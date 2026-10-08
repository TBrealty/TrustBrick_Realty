import { useSyncExternalStore } from "react";
import { authHeaders } from "@/api/client";
import { API_ORIGIN } from "@/config";
import type { QueuedUpload, UploadKind } from "./queue";

/**
 * The web preview's version: no file system, so uploads go straight from the picked file, and
 * nothing is kept if the page closes. The phone app uses queue.ts.
 */
let items: QueuedUpload[] = [];
const listeners = new Set<() => void>();
const uploadedListeners = new Set<(listingRef: string) => void>();
const emit = () => {
  items = [...items];
  listeners.forEach((l) => l());
};
const update = (id: string, patch: Partial<QueuedUpload>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
};

async function upload(item: QueuedUpload) {
  update(item.id, { status: "uploading", error: null });
  try {
    const blob = await (await fetch(item.file)).blob();
    const r = await fetch(`${API_ORIGIN}/api/v1/partner/listings/${item.listingRef}/media?kind=${item.kind}`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": item.mime, "x-file-name": encodeURIComponent(item.name) },
      body: blob,
    });
    if (r.ok) {
      items = items.filter((i) => i.id !== item.id);
      emit();
      uploadedListeners.forEach((l) => l(item.listingRef));
      return;
    }
    const body = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    update(item.id, { status: "failed", error: body.error?.message ?? "The upload didn't go through.", refused: r.status < 500 });
  } catch {
    update(item.id, { status: "failed", error: "No connection.", refused: false });
  }
}

export async function processUploads() {
  for (const item of items.filter((i) => i.status === "waiting")) await upload(item);
}

export async function enqueueUploads(listingRef: string, kind: UploadKind, files: { uri: string; name: string; mime: string }[]) {
  for (const f of files) {
    items.push({ id: `${Date.now()}-${Math.random()}`, listingRef, kind, name: f.name, file: f.uri, mime: f.mime, status: "waiting", progress: 0, error: null, refused: false });
  }
  emit();
  await processUploads();
}

export function retryUpload(id: string) {
  update(id, { status: "waiting", error: null });
  void processUploads();
}

export function removeUpload(id: string) {
  items = items.filter((i) => i.id !== id);
  emit();
}

export function onUploaded(listener: (listingRef: string) => void) {
  uploadedListeners.add(listener);
  return () => {
    uploadedListeners.delete(listener);
  };
}

export function useUploads(listingRef: string): QueuedUpload[] {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
  return all.filter((i) => i.listingRef === listingRef);
}

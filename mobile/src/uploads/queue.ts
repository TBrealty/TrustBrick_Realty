import { Directory, File, Paths, UploadType } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { ApiError, api, authHeaders } from "@/api/client";
import { API_ORIGIN } from "@/config";

/**
 * Tour files recorded on site wait here until they're uploaded. Each picked file is copied into
 * the app's own storage first, so it survives the app closing and a phone with no signal; the
 * queue uploads one at a time with progress, and tries again when the app comes back to the
 * foreground. A file the server turns down (not a 360° photo, too large) stays with its reason
 * until it's removed.
 *
 * A room taken with the guided camera ("capture") is one item: its ~30 photos are sent one by one
 * to a capture opened on the server, picking up where they left off, and then it's finished
 * (the server joins them into a 360° photo).
 */

export type UploadKind = "panorama" | "model_3d" | "capture" | "photo" | "floor_plan" | "video" | "document";
export type CaptureShot = { uri: string; yaw: number; pitch: number; roll: number };
export type QueuedUpload = {
  id: string;
  listingRef: string;
  kind: UploadKind;
  name: string;
  file: string;
  mime: string;
  status: "waiting" | "uploading" | "failed";
  progress: number;
  error: string | null;
  /** The server refused it; trying again won't help. */
  refused: boolean;
  /** Guided captures: the photos, the camera's field of view, the server's capture, and how many photos it has. */
  shots?: CaptureShot[];
  hfov?: number;
  captureId?: string | null;
  sent?: number;
};

const dir = new Directory(Paths.document, "tour-uploads");
const queueFile = new File(dir, "queue.json");
let items: QueuedUpload[] = [];
let loaded = false;
let running = false;
const listeners = new Set<() => void>();
const uploadedListeners = new Set<(listingRef: string) => void>();

function emit() {
  items = [...items];
  listeners.forEach((l) => l());
}

function save() {
  try {
    queueFile.write(JSON.stringify(items.map((i) => ({ ...i, status: i.status === "uploading" ? "waiting" : i.status }))));
  } catch {}
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    dir.create({ idempotent: true, intermediates: true });
    if (queueFile.exists) items = (JSON.parse(queueFile.textSync()) as QueuedUpload[]).filter((i) => (i.kind === "capture" ? new Directory(i.file).exists : new File(i.file).exists));
  } catch {
    items = [];
  }
}

const update = (id: string, patch: Partial<QueuedUpload>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
};

const deleteFiles = (item: QueuedUpload) => {
  try {
    if (item.kind === "capture") new Directory(item.file).delete();
    else new File(item.file).delete();
  } catch {}
};

function finish(item: QueuedUpload) {
  items = items.filter((i) => i.id !== item.id);
  deleteFiles(item);
  save();
  emit();
  uploadedListeners.forEach((l) => l(item.listingRef));
}

/** A guided capture: open it on the server (once), send the photos it doesn't have yet, then finish it. */
async function uploadCapture(item: QueuedUpload): Promise<"ok" | "offline" | "refused"> {
  const shots = item.shots ?? [];
  const fail = (error: unknown, fallback: string): "offline" | "refused" => {
    const refused = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429;
    update(item.id, { status: "failed", error: error instanceof Error && error.message ? error.message : fallback, refused });
    save();
    return refused ? "refused" : "offline";
  };
  let captureId = item.captureId ?? null;
  if (!captureId) {
    try {
      captureId = (await api<{ id: string }>(`/partner/listings/${item.listingRef}/captures`, { method: "POST", body: { roomName: item.name, hfov: item.hfov ?? 53, shotCount: shots.length } })).id;
    } catch (error) {
      return fail(error, "No connection. It'll upload when you're back online.");
    }
    update(item.id, { captureId, sent: 0 });
    save();
  }
  for (let i = item.sent ?? 0; i < shots.length; i++) {
    const s = shots[i];
    const query = `yaw=${s.yaw.toFixed(2)}&pitch=${s.pitch.toFixed(2)}&roll=${s.roll.toFixed(2)}`;
    try {
      const task = new File(s.uri).createUploadTask(`${API_ORIGIN}/api/v1/partner/captures/${captureId}/shots/${i}?${query}`, {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: { ...authHeaders(), "content-type": "image/jpeg" },
      });
      const result = await task.uploadAsync();
      if (result.status < 200 || result.status >= 300) {
        let message = "A photo didn't go through.";
        try {
          message = (JSON.parse(result.body) as { error?: { message?: string } }).error?.message ?? message;
        } catch {}
        return fail(new ApiError(result.status, "UPLOAD_FAILED", message), message);
      }
    } catch {
      return fail(null, "No connection. It'll upload when you're back online.");
    }
    item = { ...item, captureId, sent: i + 1 };
    update(item.id, { sent: i + 1, progress: (i + 1) / shots.length });
    save();
  }
  try {
    await api(`/partner/captures/${captureId}/finish`, { method: "POST" });
  } catch (error) {
    return fail(error, "No connection. It'll upload when you're back online.");
  }
  finish(item);
  return "ok";
}

async function uploadOne(item: QueuedUpload): Promise<"ok" | "offline" | "refused"> {
  update(item.id, { status: "uploading", progress: item.kind === "capture" ? (item.sent ?? 0) / Math.max(item.shots?.length ?? 1, 1) : 0, error: null });
  if (item.kind === "capture") return uploadCapture(item);
  try {
    const task = new File(item.file).createUploadTask(`${API_ORIGIN}/api/v1/partner/listings/${item.listingRef}/media?kind=${item.kind}`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      headers: { ...authHeaders(), "content-type": item.mime, "x-file-name": encodeURIComponent(item.name) },
      onProgress: ({ bytesSent, totalBytes }) => totalBytes > 0 && update(item.id, { progress: bytesSent / totalBytes }),
    });
    const result = await task.uploadAsync();
    if (result.status >= 200 && result.status < 300) {
      finish(item);
      return "ok";
    }
    let message = "The upload didn't go through.";
    try {
      message = (JSON.parse(result.body) as { error?: { message?: string } }).error?.message ?? message;
    } catch {}
    const refused = result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 429;
    update(item.id, { status: "failed", error: message, refused });
    save();
    return refused ? "refused" : "offline";
  } catch {
    update(item.id, { status: "failed", error: "No connection. It'll upload when you're back online.", refused: false });
    save();
    return "offline";
  }
}

/** Uploads whatever is waiting, one at a time; stops at the first connection problem. */
export async function processUploads() {
  load();
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === "waiting");
      if (!next) break;
      if ((await uploadOne(next)) === "offline") break;
    }
  } finally {
    running = false;
  }
}

/** Adds a room taken with the guided camera (its photos already in their own folder) and starts sending it. */
export async function enqueueCapture(listingRef: string, capture: { roomName: string; hfov: number; shots: CaptureShot[]; folder: string }) {
  load();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({
    id,
    listingRef,
    kind: "capture",
    name: capture.roomName,
    file: capture.folder,
    mime: "image/jpeg",
    status: "waiting",
    progress: 0,
    error: null,
    refused: false,
    shots: capture.shots,
    hfov: capture.hfov,
    captureId: null,
    sent: 0,
  });
  save();
  emit();
  void processUploads();
}

/** Adds files to the queue (copying them into the app's storage) and starts uploading. */
export async function enqueueUploads(listingRef: string, kind: UploadKind, files: { uri: string; name: string; mime: string }[]) {
  load();
  for (const f of files) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = kind === "model_3d" ? "glb" : (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const dest = new File(dir, `${id}.${ext}`);
    await new File(f.uri).copy(dest);
    items.push({ id, listingRef, kind, name: f.name, file: dest.uri, mime: f.mime, status: "waiting", progress: 0, error: null, refused: false });
  }
  save();
  emit();
  void processUploads();
}

export function retryUpload(id: string) {
  update(id, { status: "waiting", error: null, refused: false });
  save();
  void processUploads();
}

export function removeUpload(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item || item.status === "uploading") return;
  items = items.filter((i) => i.id !== id);
  deleteFiles(item);
  // A capture already opened on the server is discarded there too (best effort).
  if (item.kind === "capture" && item.captureId) void api(`/partner/captures/${item.captureId}`, { method: "DELETE" }).catch(() => {});
  save();
  emit();
}

/** Called after each upload finishes, so screens can refresh the listing. */
export function onUploaded(listener: (listingRef: string) => void) {
  uploadedListeners.add(listener);
  return () => {
    uploadedListeners.delete(listener);
  };
}

export function useUploads(listingRef: string): QueuedUpload[] {
  const all = useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
  return all.filter((i) => i.listingRef === listingRef);
}

// Back in the foreground (often with signal again): try what's waiting.
AppState.addEventListener("change", (state) => {
  if (state !== "active") return;
  load();
  items = items.map((i) => (i.status === "failed" && !i.refused ? { ...i, status: "waiting", error: null } : i));
  emit();
  void processUploads();
});

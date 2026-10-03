"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteMediaAction, mediaAltAction, reorderMediaAction } from "@/app/(workspace)/properties/actions";
import { ActionForm, ConfirmAction, Submit } from "@/components/workspace/forms";
import type { MediaItem } from "@/lib/services/media";
import { UPLOAD_KINDS, type UploadKind } from "@/lib/storage/sniff";

const ACCEPT: Record<UploadKind, string> = {
  photo: "image/jpeg,image/png,image/webp,image/avif",
  floor_plan: "image/jpeg,image/png,image/webp,application/pdf",
  video: "video/mp4,video/quicktime,video/webm",
  document: "application/pdf,image/jpeg,image/png",
};

const HELP: Record<UploadKind, string> = {
  photo: "JPEG, PNG, WebP or AVIF, up to 15 MB, at least 400 px on the short side. The first photo is the cover.",
  floor_plan: "An image or PDF, up to 15 MB.",
  video: "MP4, MOV or WebM, up to 100 MB.",
  document: "Private: only you and Trustbrick reviewers can open these. PDF or image, up to 15 MB.",
};

type Upload = { name: string; progress: number; error?: string };

/**
 * Uploads go straight to the upload route one file at a time, with progress. The server
 * decides the type from the bytes and re-encodes images; this component just reports back.
 */
export function MediaManager({ referenceId, items }: { referenceId: string; items: MediaItem[] }) {
  return (
    <div className="space-y-8">
      {(Object.keys(UPLOAD_KINDS) as UploadKind[]).map((kind) => (
        <KindSection key={kind} kind={kind} referenceId={referenceId} items={items.filter((i) => i.kind === kind)} />
      ))}
    </div>
  );
}

function KindSection({ kind, referenceId, items }: { kind: UploadKind; referenceId: string; items: MediaItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pending, startTransition] = useTransition();
  const rules = UPLOAD_KINDS[kind];

  const upload = (file: File) =>
    new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/listings/${referenceId}/media?kind=${kind}`);
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: e.loaded / e.total } : x)));
      xhr.onload = () => {
        let message = "The upload failed.";
        try {
          const body = JSON.parse(xhr.responseText) as { ok: boolean; message?: string };
          if (body.ok) {
            setUploads((u) => u.filter((x) => x.name !== file.name));
            return resolve();
          }
          message = body.message ?? message;
        } catch {}
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: message } : x)));
        resolve();
      };
      xhr.onerror = () => {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: "Network error. Try again." } : x)));
        resolve();
      };
      xhr.send(file);
    });

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].slice(0, Math.max(0, rules.maxPerProperty - items.length));
    setUploads((u) => [...u.filter((x) => !x.error), ...list.map((f) => ({ name: f.name, progress: 0 }))]);
    for (const file of list) {
      if (file.size > rules.maxBytes) {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: `Larger than ${Math.round(rules.maxBytes / 1024 / 1024)} MB.` } : x)));
        continue;
      }
      await upload(file);
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  const move = (index: number, delta: number) => {
    const order = items.map((i) => i.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + delta, 0, moved);
    startTransition(async () => {
      await reorderMediaAction(referenceId, order);
      router.refresh();
    });
  };

  const label = kind === "photo" ? "Photos" : kind === "floor_plan" ? "Floor plans" : kind === "video" ? "Videos" : "Documents";
  return (
    <section aria-labelledby={`media-${kind}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id={`media-${kind}`} className="text-[0.9375rem] font-semibold">
            {label}{" "}
            <span className="font-normal text-stone-deep">
              ({items.length} of {rules.maxPerProperty})
            </span>
          </h3>
          <p className="text-[0.75rem] text-stone-deep">{HELP[kind]}</p>
        </div>
        <label className={`wbtn wbtn-secondary cursor-pointer ${items.length >= rules.maxPerProperty ? "pointer-events-none opacity-50" : ""}`}>
          <input ref={inputRef} type="file" accept={ACCEPT[kind]} multiple={kind !== "video"} className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          + Add {label.toLowerCase()}
        </label>
      </div>

      {uploads.length > 0 && (
        <ul className="mb-3 space-y-1.5" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.name} className="rounded-[3px] border border-line-light bg-card px-3 py-2 text-[0.8125rem]">
              <div className="flex justify-between gap-3">
                <span className="truncate">{u.name}</span>
                <span className={u.error ? "text-brick" : "text-stone-deep"}>{u.error ?? `${Math.round(u.progress * 100)}%`}</span>
              </div>
              {!u.error && (
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/8" aria-hidden>
                  <span className="block h-full bg-ink transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <p className="rounded-[3px] border border-dashed border-line-light px-4 py-6 text-center text-[0.8125rem] text-stone-deep">No {label.toLowerCase()} yet.</p>
      ) : (
        <ol className={`grid grid-cols-1 gap-3 ${kind ==="photo" || kind === "floor_plan" ? "sm:grid-cols-2 lg:grid-cols-3" : ""} ${pending ? "opacity-60" : ""}`}>
          {items.map((item, i) => (
            <li key={item.id} className="wcard overflow-hidden">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded renditions are already sized
                <img src={item.thumbnailUrl} alt={item.altText ?? ""} className="aspect-[4/3] w-full bg-sand object-cover" loading="lazy" />
              ) : kind === "video" ? (
                <video src={item.url} controls preload="metadata" className="aspect-video w-full bg-ink" />
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer" className="flex aspect-[4/3] items-center justify-center bg-paper text-[0.8125rem] text-graphite underline">
                  Open {item.originalFilename ?? "document"}
                </a>
              )}
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2 text-[0.75rem] text-stone-deep">
                  <span>
                    {i === 0 && kind === "photo" ? "Cover · " : ""}
                    {item.referenceId ?? (item.width ? `${item.width}×${item.height}` : item.originalFilename)}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="wbtn wbtn-ghost wbtn-sm" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Move ${label.toLowerCase()} ${i + 1} earlier`}>
                      ↑
                    </button>
                    <button type="button" className="wbtn wbtn-ghost wbtn-sm" disabled={i === items.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Move ${label.toLowerCase()} ${i + 1} later`}>
                      ↓
                    </button>
                  </span>
                </div>
                {(kind === "photo" || kind === "floor_plan") && (
                  <ActionForm action={mediaAltAction} className="flex items-end gap-2">
                    <input type="hidden" name="ref" value={referenceId} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <label className="flex-1">
                      <span className="sr-only">Description of {label.toLowerCase()} {i + 1}</span>
                      <input name="alt" defaultValue={item.altText ?? ""} placeholder="Describe the photo (for screen readers)" className="winput h-8 text-[0.75rem]" maxLength={200} />
                    </label>
                    <Submit variant="secondary" className="wbtn-sm">
                      Save
                    </Submit>
                  </ActionForm>
                )}
                <ConfirmAction
                  label="Delete"
                  title={`Delete this ${kind === "photo" ? "photo" : label.toLowerCase().replace(/s$/, "")}?`}
                  description="The file is removed from storage. This can't be undone."
                  action={deleteMediaAction}
                  hidden={{ ref: referenceId, mediaId: item.id }}
                  variant="danger"
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

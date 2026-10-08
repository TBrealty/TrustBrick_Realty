"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteMediaAction, mediaAltAction, reorderMediaAction, saveTourLinkAction } from "@/app/(workspace)/properties/actions";
import { ActionForm, ConfirmAction, Submit, TextInput } from "@/components/workspace/forms";
import type { MediaItem } from "@/lib/services/media";
import { UPLOAD_KINDS, type UploadKind } from "@/lib/storage/sniff";
import { TOUR_LINK_HELP, TOUR_PROVIDERS, providerNames } from "@/lib/tours/terms";

const ACCEPT: Record<UploadKind, string> = {
  photo: "image/jpeg,image/png,image/webp,image/avif",
  floor_plan: "image/jpeg,image/png,image/webp,application/pdf",
  video: "video/mp4,video/quicktime,video/webm",
  document: "application/pdf,image/jpeg,image/png",
  panorama: "image/jpeg,image/png,image/webp",
  // Browsers rarely know a .glb's type, so the extension is offered too.
  model_3d: ".glb,model/gltf-binary",
};

const HELP: Record<UploadKind, string> = {
  photo: "JPEG, PNG, WebP or AVIF, up to 15 MB, at least 400 px on the short side. The first photo is the cover.",
  floor_plan: "An image or PDF, up to 15 MB.",
  video: "MP4, MOV or WebM, up to 100 MB.",
  document: "Private: only you and Trustbrick reviewers can open these. PDF or image, up to 15 MB.",
  panorama: "One per room, from a 360° camera or a 360° photo app: JPEG, PNG or WebP, up to 40 MB, twice as wide as tall (like 6000×3000). Name each room; the first one opens the tour.",
  model_3d: "One .glb file, up to 100 MB: export it from a 3D scanning app (such as Polycam or Scaniverse) or ask the architect for the model.",
};

const LABELS: Record<UploadKind, { title: string; add: string; empty: string; one: string }> = {
  photo: { title: "Photos", add: "Add photos", empty: "No photos yet.", one: "photo" },
  floor_plan: { title: "Floor plans", add: "Add floor plans", empty: "No floor plans yet.", one: "floor plan" },
  video: { title: "Videos", add: "Add videos", empty: "No videos yet.", one: "video" },
  document: { title: "Documents", add: "Add documents", empty: "No documents yet.", one: "document" },
  panorama: { title: "360° photos", add: "Add 360° photos", empty: "No 360° photos yet.", one: "360° photo" },
  model_3d: { title: "3D model", add: "Add a 3D model", empty: "No 3D model yet.", one: "3D model" },
};

const STANDARD_KINDS: UploadKind[] = ["photo", "floor_plan", "video", "document"];
const fileSize = (n: number | null) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

type Upload = { name: string; progress: number; error?: string };

/**
 * Uploads go straight to the upload route one file at a time, with progress. The server
 * decides the type from the bytes and re-encodes images; this component just reports back.
 */
export function MediaManager({ referenceId, items }: { referenceId: string; items: MediaItem[] }) {
  return (
    <div className="space-y-8">
      {STANDARD_KINDS.map((kind) => (
        <KindSection key={kind} kind={kind} referenceId={referenceId} items={items.filter((i) => i.kind === kind)} />
      ))}
    </div>
  );
}

/**
 * The virtual tour: 360° photos room by room, a 3D model, and a link to a 3D tour hosted
 * elsewhere. Any of them is enough. Buyers see that the listing has a tour; Plus members open it.
 */
export function VirtualTourManager({
  referenceId,
  items,
  tourUrl,
  stay = false,
  live = false,
  hidden = null,
  showPreview = true,
}: {
  referenceId: string;
  items: MediaItem[];
  tourUrl: string | null;
  stay?: boolean;
  /** The listing is live: changes show straight away and Trustbrick reviews them. */
  live?: boolean;
  /** Trustbrick hid the tour after a review. */
  hidden?: { reason: string | null } | null;
  showPreview?: boolean;
}) {
  const has = tourUrl || items.some((i) => i.kind === "panorama" || i.kind === "model_3d");
  return (
    <div className="space-y-8">
      {hidden && (
        <p role="status" className="rounded-[3px] border-l-2 border-brick bg-brick/6 px-4 py-3 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">Trustbrick has hidden this tour</strong>
          {hidden.reason ? `: “${hidden.reason}”` : "."} Fix it below. Your changes go to Trustbrick for a check, and the tour is shown again once they&apos;re approved.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[3px] bg-paper px-4 py-3 text-[0.8125rem] text-graphite">
        <p className="max-w-[60ch]">
          {live ? (
            <>
              Your {stay ? "stay" : "listing"} remains live while you change the tour. <strong className="font-medium text-ink">Changes show straight away</strong>, and Trustbrick checks each one;
              if something&apos;s wrong, the tour is hidden and you&apos;re told why. A hidden tour is shown again once Trustbrick approves your fix.
            </>
          ) : (
            <>
              Optional. {stay ? "Stays" : "Listings"} with a tour get a <strong className="font-medium text-ink">3D tour</strong> badge in search, and {stay ? "guests" : "buyers"} can filter for
              them. The tour itself opens for Trustbrick Plus members, you and the reviewers.
            </>
          )}
        </p>
        {has && showPreview && (
          <Link href={`/properties/${referenceId}/tour`} className="wbtn wbtn-secondary wbtn-sm">
            Preview the tour
          </Link>
        )}
      </div>
      <KindSection kind="panorama" referenceId={referenceId} items={items.filter((i) => i.kind === "panorama")} />
      <KindSection kind="model_3d" referenceId={referenceId} items={items.filter((i) => i.kind === "model_3d")} />
      <TourLinkForm referenceId={referenceId} tourUrl={tourUrl} />
    </div>
  );
}

function TourLinkForm({ referenceId, tourUrl }: { referenceId: string; tourUrl: string | null }) {
  const router = useRouter();
  return (
    <section aria-labelledby="media-tour-link">
      <h3 id="media-tour-link" className="text-[0.9375rem] font-semibold">
        Hosted 3D tour <span className="font-normal text-stone-deep">(link)</span>
      </h3>
      <p className="mb-3 text-[0.75rem] text-stone-deep">
        Already have a 3D tour made with {providerNames}? Paste its share link and it&apos;s shown inside the listing.
      </p>
      <ActionForm action={saveTourLinkAction} onSuccess={() => router.refresh()}>
        <input type="hidden" name="ref" value={referenceId} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextInput
            // Remounts after a save, to show the link in the clean form it was saved in.
            key={tourUrl ?? ""}
            label="Tour link"
            name="tourUrl"
            type="url"
            inputMode="url"
            defaultValue={tourUrl ?? ""}
            placeholder={TOUR_PROVIDERS[0].example}
            maxLength={500}
            hint={`${TOUR_LINK_HELP} To remove it, clear the box and save.`}
            fieldClassName="flex-1"
          />
          <Submit variant="secondary" className="sm:mt-6">
            Save link
          </Submit>
        </div>
      </ActionForm>
    </section>
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

  const words = LABELS[kind];
  const label = words.title;
  const imageGrid = kind === "photo" || kind === "floor_plan" || kind === "panorama";
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
          <input ref={inputRef} type="file" accept={ACCEPT[kind]} multiple={kind !== "video" && kind !== "model_3d"} className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          + {words.add}
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
        <p className="rounded-[3px] border border-dashed border-line-light px-4 py-6 text-center text-[0.8125rem] text-stone-deep">{words.empty}</p>
      ) : (
        <ol className={`grid grid-cols-1 gap-3 ${kind === "panorama" ? "sm:grid-cols-2 xl:grid-cols-3" : imageGrid ? "sm:grid-cols-2 lg:grid-cols-3" : ""} ${pending ? "opacity-60" : ""}`}>
          {items.map((item, i) => (
            <li key={item.id} className="wcard overflow-hidden">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded renditions are already sized
                <img src={item.thumbnailUrl} alt={item.altText ?? ""} className={`${kind === "panorama" ? "aspect-[2/1]" : "aspect-[4/3]"} w-full bg-sand object-cover`} loading="lazy" />
              ) : kind === "model_3d" ? (
                <div className="flex items-center justify-between gap-3 bg-paper px-4 py-5 text-[0.8125rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.originalFilename ?? "3D model"}</span>
                    <span className="text-stone-deep">.glb · {fileSize(item.sizeBytes)}</span>
                  </span>
                  <Link href={`/properties/${referenceId}/tour?view=model`} className="wbtn wbtn-secondary wbtn-sm">
                    Preview
                  </Link>
                </div>
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
                    {i === 0 && kind === "photo" ? "Cover · " : i === 0 && kind === "panorama" && items.length > 1 ? "Opens the tour · " : ""}
                    {kind === "model_3d" ? "Shown in the tour" : (item.referenceId ?? (item.width ? `${item.width}×${item.height}` : item.originalFilename))}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="wbtn wbtn-ghost wbtn-sm" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Move ${words.one} ${i + 1} earlier`}>
                      ↑
                    </button>
                    <button type="button" className="wbtn wbtn-ghost wbtn-sm" disabled={i === items.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Move ${words.one} ${i + 1} later`}>
                      ↓
                    </button>
                  </span>
                </div>
                {kind === "panorama" && (
                  <ActionForm action={mediaAltAction} className="flex items-end gap-2">
                    <input type="hidden" name="ref" value={referenceId} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <label className="flex-1">
                      <span className="mb-1 block text-[0.75rem] font-medium text-ink">Room name</span>
                      <input name="alt" defaultValue={item.altText ?? ""} placeholder="e.g. Living room" className="winput h-8 text-[0.75rem]" maxLength={40} />
                    </label>
                    <Submit variant="secondary" className="wbtn-sm">
                      Save
                    </Submit>
                  </ActionForm>
                )}
                {(kind === "photo" || kind === "floor_plan") && (
                  <ActionForm action={mediaAltAction} className="flex items-end gap-2">
                    <input type="hidden" name="ref" value={referenceId} />
                    <input type="hidden" name="mediaId" value={item.id} />
                    <label className="flex-1">
                      <span className="sr-only">Description of {words.one} {i + 1}</span>
                      <input name="alt" defaultValue={item.altText ?? ""} placeholder="Describe the photo (for screen readers)" className="winput h-8 text-[0.75rem]" maxLength={200} />
                    </label>
                    <Submit variant="secondary" className="wbtn-sm">
                      Save
                    </Submit>
                  </ActionForm>
                )}
                <ConfirmAction
                  label="Delete"
                  title={`Delete this ${words.one}?`}
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

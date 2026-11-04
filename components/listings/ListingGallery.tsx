"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Photo = { key: string; alt: string | null };

/**
 * A listing's photos. On larger screens, the cover and up to four more in a grid; on phones,
 * every photo in a strip you swipe. Any photo, or "Show all", opens a full-screen viewer that
 * swipes, takes the arrow keys and closes with Escape. `overlay` sits on the cover (the tour link).
 */
export function ListingGallery({ photos, title, overlay }: { photos: Photo[]; title: string; overlay?: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [stripIndex, setStripIndex] = useState(0);
  // Where the viewer is heading: quick key presses step from here, not from a scroll still under way.
  const target = useRef(0);
  const count = photos.length;
  const side = photos.slice(1, 5);
  const alt = (p: Photo, i: number) => p.alt ?? `${title}, photo ${i + 1} of ${count}`;

  const show = (i: number, behavior: ScrollBehavior) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(count - 1, i));
    target.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior });
  };
  const open = (i: number) => {
    dialog.current?.showModal();
    setCurrent(i);
    // The track has its width only once the dialog is open.
    requestAnimationFrame(() => show(i, "instant"));
  };
  const onTrackScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i === current) return;
    setCurrent(i);
    thumbs.current?.children[i]?.scrollIntoView({ block: "nearest", inline: "center" });
  };
  const onStripScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.clientWidth) setStripIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (count === 0) {
    return (
      <div className="relative mt-6 aspect-[16/10] bg-sand sm:aspect-[21/9]">
        {overlay}
      </div>
    );
  }

  const grid =
    side.length >= 3 ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" : side.length > 0 ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "";

  return (
    <div className="relative mt-6">
      {/* Phones: swipe through every photo. */}
      <div
        onScroll={onStripScroll}
        className="-mx-(--gutter) flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:hidden"
        role="region"
        aria-roledescription="carousel"
        aria-label={`Photos, ${count}`}
      >
        {photos.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => open(i)}
            className="relative aspect-[4/3] w-full shrink-0 snap-center bg-sand"
            aria-label={`Open photo ${i + 1} of ${count}`}
          >
            <Image src={p.key} alt={alt(p, i)} fill sizes="(min-width: 640px) 50vw, 100vw" loading={i === 0 ? "eager" : "lazy"} className="object-cover" />
          </button>
        ))}
      </div>

      {/* Larger screens: the cover and up to four more. */}
      <div className={`hidden aspect-[21/9] gap-2 sm:grid sm:grid-rows-2 ${grid}`}>
        <button type="button" onClick={() => open(0)} className="group relative row-span-2 overflow-hidden bg-sand" aria-label={`Open photo 1 of ${count}`}>
          <Image src={photos[0].key} alt={alt(photos[0], 0)} fill preload sizes="(min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        </button>
        {side.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => open(i + 1)}
            className={`group relative overflow-hidden bg-sand ${side.length === 1 ? "row-span-2" : ""} ${side.length === 3 && i === 2 ? "col-span-2" : ""}`}
            aria-label={`Open photo ${i + 2} of ${count}`}
          >
            <Image src={p.key} alt={alt(p, i + 1)} fill sizes="25vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          </button>
        ))}
      </div>

      {overlay}
      {count > 1 && (
        <>
          <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-ink/75 px-2.5 py-1 text-[0.75rem] text-paper tabular-nums sm:hidden">
            {stripIndex + 1} / {count}
          </span>
          <button
            type="button"
            onClick={() => open(0)}
            className="absolute right-3 bottom-3 hidden items-center gap-2 border border-ink bg-paper px-4 py-2 text-[0.875rem] font-medium text-ink shadow-sm transition-colors hover:bg-ivory sm:inline-flex"
          >
            <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="currentColor">
              <rect x="1" y="1" width="6" height="6" />
              <rect x="9" y="1" width="6" height="6" />
              <rect x="1" y="9" width="6" height="6" />
              <rect x="9" y="9" width="6" height="6" />
            </svg>
            Show all {count} photos
          </button>
        </>
      )}

      <dialog
        ref={dialog}
        aria-label={`Photos of ${title}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") show(target.current + 1, "smooth");
          if (e.key === "ArrowLeft") show(target.current - 1, "smooth");
        }}
        className="photo-viewer fixed inset-0 m-0 h-svh max-h-none w-screen max-w-none bg-[#0b0d12] p-0 text-paper backdrop:bg-black"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
            <button type="button" onClick={() => dialog.current?.close()} className="inline-flex items-center gap-2 text-[0.9375rem] hover:underline">
              <span aria-hidden className="text-[1.25rem] leading-none">×</span> Close
            </button>
            <p className="text-[0.875rem] tabular-nums" aria-live="polite">
              {current + 1} / {count}
            </p>
            <span className="w-16" aria-hidden />
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={track}
              onScroll={onTrackScroll}
              onScrollEnd={(e) => {
                // A swipe settles here; keys and buttons carry on from it.
                const el = e.currentTarget;
                if (el.clientWidth) target.current = Math.round(el.scrollLeft / el.clientWidth);
              }}
              className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
              role="region"
              aria-roledescription="carousel"
              aria-label="Photos"
            >
              {photos.map((p, i) => (
                <div key={p.key} className="relative h-full w-full shrink-0 snap-center" aria-label={`Photo ${i + 1} of ${count}`} role="group" aria-roledescription="slide">
                  <Image src={p.key} alt={alt(p, i)} fill sizes="100vw" className="object-contain" />
                </div>
              ))}
            </div>
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => show(target.current - 1, "smooth")}
                  disabled={current === 0}
                  aria-label="Previous photo"
                  className="absolute top-1/2 left-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-paper/90 text-[1.25rem] text-ink transition-opacity hover:bg-paper disabled:opacity-0 sm:grid"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => show(target.current + 1, "smooth")}
                  disabled={current === count - 1}
                  aria-label="Next photo"
                  className="absolute top-1/2 right-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-paper/90 text-[1.25rem] text-ink transition-opacity hover:bg-paper disabled:opacity-0 sm:grid"
                >
                  ›
                </button>
              </>
            )}
          </div>
          <p className="min-h-10 shrink-0 px-4 pt-3 text-center text-[0.875rem] text-paper/75 sm:px-6">{photos[current]?.alt ?? ""}</p>
          {count > 1 && (
            <div ref={thumbs} className="flex shrink-0 gap-2 overflow-x-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:none] sm:justify-center sm:px-6">
              {photos.map((p, i) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => show(i, "smooth")}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === current ? "true" : undefined}
                  className={`relative h-12 w-16 shrink-0 overflow-hidden transition-opacity ${i === current ? "opacity-100 outline-2 outline-paper" : "opacity-50 hover:opacity-80"}`}
                >
                  <Image src={p.key} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * A titled row of listing cards that scrolls sideways. Phones swipe it; on larger screens two
 * round arrows beside "See all" move it a screenful at a time, and each greys out at its end.
 * The arrows only appear when there's more than fits. `children` are the cards' <li>s.
 */
export function ListingRail({ title, subtitle, href, children }: { title: string; subtitle: string; href: string; children: React.ReactNode }) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    // A screenful, less a little so the next card's edge stays in view; snapping lines it up.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduced ? "auto" : "smooth" });
  };

  const scrolls = !(edges.start && edges.end);

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-6">
        <div>
          <h3 className="display text-[clamp(1.9rem,3.2vw,2.75rem)] leading-none">{title}</h3>
          <p className="mt-2 text-[0.9375rem] text-stone-deep">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <Link href={href} className="link-rule text-[0.9375rem] text-brick">
            See all →
          </Link>
          {scrolls && (
            <div className="hidden items-center gap-2 sm:flex">
              <RailButton label={`Previous: ${title}`} controls={listId} disabled={edges.start} onClick={() => page(-1)} flip />
              <RailButton label={`Next: ${title}`} controls={listId} disabled={edges.end} onClick={() => page(1)} />
            </div>
          )}
        </div>
      </div>
      <ul
        ref={listRef}
        id={listId}
        className="-mx-(--gutter) flex snap-x snap-mandatory scroll-px-(--gutter) gap-5 overflow-x-auto px-(--gutter) pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </>
  );
}

function RailButton({ label, controls, disabled, onClick, flip = false }: { label: string; controls: string; disabled: boolean; onClick: () => void; flip?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full border border-line-light bg-paper text-ink transition-[background-color,color,border-color,opacity] duration-200 hover:border-ink hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick disabled:pointer-events-none disabled:opacity-35"
    >
      <svg viewBox="0 0 16 16" aria-hidden className={`size-4 ${flip ? "rotate-180" : ""}`} fill="none">
        <path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </button>
  );
}

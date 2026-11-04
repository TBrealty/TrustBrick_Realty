"use client";

import { useEffect, useState } from "react";

/**
 * On phones and tablets, the price and the main action stay at the bottom of the screen. The
 * action jumps to the panel with the contact or booking form; the bar steps aside while that
 * panel is on screen, so there's never two of the same button.
 */
export function ListingActionBar({ price, suffix, prefix, note, action, target }: { price: string; suffix: string | null; prefix: string | null; note?: string | null; action: string; target: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div
      inert={hidden}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line-light bg-paper/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(13,17,25,0.06)] backdrop-blur transition-transform duration-300 lg:hidden ${hidden ? "translate-y-full" : ""}`}
    >
      <div className="shell flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            {prefix && <span className="text-[0.75rem] text-stone-deep">{prefix}</span>}
            <span className="display text-[1.625rem] leading-none">{price}</span>
            {suffix && <span className="text-[0.75rem] text-stone-deep">{suffix}</span>}
          </p>
          {note && <p className="mt-0.5 truncate text-[0.75rem] text-stone-deep">{note}</p>}
        </div>
        <a
          href={`#${target}`}
          onClick={(e) => {
            const el = document.getElementById(target);
            if (!el) return;
            e.preventDefault();
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="btn btn-dark shrink-0"
        >
          <span>{action}</span>
        </a>
      </div>
    </div>
  );
}

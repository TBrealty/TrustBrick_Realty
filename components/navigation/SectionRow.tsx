"use client";

import { useEffect, useRef } from "react";

/** A sideways-scrolling row of links (the phone version of a header's sections) that keeps the current one in view. */
export function SectionRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = ref.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const left = current.offsetLeft - row.offsetLeft;
    if (left + current.offsetWidth > row.scrollLeft + row.clientWidth || left < row.scrollLeft) row.scrollLeft = left - 16;
  });
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FOR_OWNERS, LEGAL_VERIFICATION, SERVICES } from "@/lib/site";

/**
 * The Services disclosure: a button that opens a panel of links. Opens on click (and with
 * Enter, Space or ↓), closes on Escape, on a click outside, or when a link is chosen.
 * Arrow keys move between the links.
 */
export function ServicesMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const focusLink = (i: number) => {
    const items = linksRef.current.filter(Boolean) as HTMLAnchorElement[];
    items[(i + items.length) % items.length]?.focus();
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    const items = linksRef.current.filter(Boolean) as HTMLAnchorElement[];
    const i = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusLink(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusLink(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusLink(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusLink(items.length - 1);
    } else if (e.key === "Tab" && !e.shiftKey && i === items.length - 1) {
      close(false);
    }
  };

  const item = (entry: { href: string; label: string; hint: string }, i: number) => {
    return (
      <li key={entry.href}>
        <Link
          ref={(el) => {
            linksRef.current[i] = el;
          }}
          href={entry.href}
          onClick={() => setOpen(false)}
          className="group/item block rounded-[3px] px-3 py-2.5 outline-none transition-colors hover:bg-ink/[0.045] focus-visible:bg-ink/[0.06]"
        >
          <span className="flex items-center justify-between gap-3 text-[0.9375rem] font-medium text-ink">
            {entry.label}
            <span aria-hidden className="text-brick opacity-0 transition-[opacity,transform] duration-300 group-hover/item:translate-x-0.5 group-hover/item:opacity-100 group-focus-visible/item:opacity-100">
              →
            </span>
          </span>
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-stone-deep">{entry.hint}</span>
        </Link>
      </li>
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusLink(0));
          }
        }}
        className="link-rule flex items-center gap-1.5 opacity-85 transition-opacity duration-500 hover:opacity-100 aria-expanded:opacity-100"
      >
        Our Services
        <svg viewBox="0 0 12 12" aria-hidden className={`size-2.5 transition-transform duration-300 ease-(--ease-smooth) ${open ? "rotate-180" : ""}`}>
          <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      <div
        id={panelId}
        onKeyDown={onPanelKey}
        hidden={!open}
        className="absolute top-[calc(100%+1.1rem)] left-1/2 z-50 w-[36rem] -translate-x-1/2 rounded-[4px] border border-line-light bg-ivory p-3 text-ink shadow-[0_24px_60px_-20px_rgb(13_17_25/0.45)]"
      >
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
          <div>
            <p className="eyebrow px-3 pt-1.5 pb-1 text-stone-deep">Find a place</p>
            <ul>{SERVICES.map((e, i) => item(e, i))}</ul>
            <p className="eyebrow mt-2 border-t border-line-light px-3 pt-3 pb-1 text-stone-deep">Before you sign</p>
            <ul>{item(LEGAL_VERIFICATION, SERVICES.length)}</ul>
          </div>
          <div className="rounded-[3px] bg-paper p-1">
            <p className="eyebrow px-3 pt-1.5 pb-1 text-stone-deep">For owners &amp; agents</p>
            <ul>{FOR_OWNERS.map((e, i) => item(e, SERVICES.length + 1 + i))}</ul>
            <p className="px-3 pt-3 pb-2 text-[0.75rem] leading-snug text-stone-deep">Hosts and agents are checked by the Trustbrick team before they can list.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

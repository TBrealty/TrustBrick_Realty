"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LEGAL_VERIFICATION, SERVICES } from "@/lib/site";

/** Line icons for the menu, one per destination (24×24, drawn in currentColor). */
const ICONS: Record<string, React.ReactNode> = {
  "/buy": <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M10 20v-5h4v5" />,
  "/rent": <path d="M11.5 15a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-1-2.5 8-8M16 7l2 2m-4 0 1.5 1.5" />,
  "/pg": <path d="M3 18V8m0 6h18v4m0-4v-2a3 3 0 0 0-3-3h-7v5m-2.4-3a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0Z" />,
  "/stays": <path d="M4 20h16M6 20V9l6-5 6 5v11m-8 0v-4a2 2 0 0 1 4 0v4" />,
  "/invest": <path d="M4 19h16M5 15l4-4 3 3 6-7m-4 0h4v4" />,
  "/legal-verification": <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4" />,
};

/**
 * The Services disclosure: a button that opens a frosted-glass panel of links under it, each with
 * its icon. The hero shows through, blurred. Opens on click (and with Enter, Space or ↓), closes
 * on Escape, on a click outside, or when a link is chosen. Arrow keys move between the links; the
 * section you're in is marked like a hovered one.
 */
export function ServicesMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
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

  // Each link: its icon in a small tile, then its name; the description is its tooltip. Under the
  // pointer, in focus, or for the section you're in, the row lights up and the tile turns brick.
  const item = (entry: { href: string; label: string; hint: string }, i: number) => {
    const current = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    return (
      <li key={entry.href}>
        <Link
          ref={(el) => {
            linksRef.current[i] = el;
          }}
          href={entry.href}
          title={entry.hint}
          aria-current={current ? "page" : undefined}
          onClick={() => setOpen(false)}
          className="group/item flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[0.9rem] whitespace-nowrap text-white/80 outline-none transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
        >
          <span className="grid size-[1.9rem] flex-none place-items-center rounded-[8px] bg-white/[0.07] transition-colors duration-200 group-hover/item:bg-brick-bright group-hover/item:text-white group-focus-visible/item:bg-brick-bright group-aria-[current=page]/item:bg-brick-bright">
            <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[entry.href]}
            </svg>
          </span>
          {entry.label}
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
        className="services-panel menu-in absolute top-full left-0 z-50 mt-3.5 w-max min-w-[13.5rem] rounded-2xl border border-white/[0.14] bg-[rgb(18_21_27/0.6)] p-1.5 text-white shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6),inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-xl backdrop-saturate-150"
      >
        <ul className="space-y-0.5">{SERVICES.map((e, i) => item(e, i))}</ul>
        <div aria-hidden className="mx-2.5 my-1.5 border-t border-white/10" />
        <ul>{item(LEGAL_VERIFICATION, SERVICES.length)}</ul>
      </div>
    </div>
  );
}

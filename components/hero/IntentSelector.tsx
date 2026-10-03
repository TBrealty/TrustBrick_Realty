"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const INTENT_EVENT = "trustbrick:intent";
export type Intent = "buy" | "rent" | "sell" | "invest" | "stay" | "pg_men" | "pg_women";

// Each option opens its browse page. Sell has no page yet (sellers will register
// first), so it keeps scrolling to the "Sell property" path on this page.
const intents: { id: Intent; label: string; href: string }[] = [
  { id: "buy", label: "Buy", href: "/buy" },
  { id: "rent", label: "Rent", href: "/rent" },
  { id: "sell", label: "Sell", href: "#paths" },
  { id: "invest", label: "Invest", href: "/invest" },
  { id: "stay", label: "Home Stay", href: "/stays" },
];

const pgOptions: { id: Intent; label: string; href: string }[] = [
  { id: "pg_men", label: "PGs for Men", href: "/pg?gender=men" },
  { id: "pg_women", label: "PGs for Women", href: "/pg?gender=women" },
];

const MENU_WIDTH = 224;
/** Measured rendered height, used only to decide whether the menu fits below its trigger. */
const MENU_HEIGHT = 131;
const EDGE = 16;
const BOTTOM_EDGE = 8;
const GAP = 8;

function announce(intent: Intent) {
  window.dispatchEvent(new CustomEvent<Intent>(INTENT_EVENT, { detail: intent }));
}

/** Reveal animation shared by every option in the expanded row. */
function OptionLabel({ open, index, children }: { open: boolean; index: number; children: React.ReactNode }) {
  return (
    <span
      className={`flex items-center gap-1.5 transition-[transform,opacity] duration-500 ease-(--ease-smooth) ${open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      style={{ transitionDelay: open ? `${120 + index * 60}ms` : "0ms" }}
    >
      {children}
    </span>
  );
}

const optionClass =
  "group flex h-13 w-full items-center justify-center px-1 font-serif text-[1.25rem] italic text-on-contrast/85 transition-colors duration-500 hover:text-on-contrast sm:px-6 sm:text-[1.375rem]";

const underline =
  "bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-bottom-left bg-no-repeat pb-0.5 transition-[background-size] duration-500 group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px]";

export function IntentSelector() {
  const [open, setOpen] = useState(false);
  const [pgOpen, setPgOpen] = useState(false);
  // Anchored by `bottom` when flipped, so placement is exact whatever the menu's real height.
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pgButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const closeAll = useCallback(() => {
    setPgOpen(false);
    setOpen(false);
  }, []);

  const closePg = useCallback((restoreFocus: boolean) => {
    setPgOpen(false);
    if (restoreFocus) pgButtonRef.current?.focus();
  }, []);

  // Outer panel: Escape and outside clicks. The PG menu lives in a portal, so it
  // counts as "inside" even though it is not a DOM descendant of the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || pgOpen) return;
      closeAll();
      buttonRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeAll();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, pgOpen, closeAll]);

  // Position the PG menu against its trigger, keeping it inside the viewport.
  const place = useCallback(() => {
    const rect = pgButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const maxLeft = window.innerWidth - EDGE - MENU_WIDTH;
    const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - MENU_WIDTH / 2, maxLeft));
    const fitsBelow = rect.bottom + GAP + MENU_HEIGHT <= window.innerHeight - BOTTOM_EDGE;
    setMenuPos(
      fitsBelow
        ? { top: rect.bottom + GAP, left }
        : { bottom: window.innerHeight - rect.top + GAP, left },
    );
  }, []);

  // Position is computed before opening, so the menu exists by the time we focus into it.
  const openPg = useCallback(() => {
    place();
    setPgOpen(true);
  }, [place]);

  useLayoutEffect(() => {
    if (!pgOpen) return;
    itemRefs.current[0]?.focus({ preventScroll: true });
    // A floating menu detached from its trigger reads as broken, so close on scroll.
    const onScroll = () => closePg(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", place);
    };
  }, [pgOpen, place, closePg]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const move = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Stop here: closing the menu re-registers the panel's document listener
      // synchronously, and it would otherwise catch this same Escape and close
      // the whole selector instead of just this menu.
      e.stopPropagation();
      closePg(true);
    } else if (e.key === "Tab") {
      closePg(false);
    }
  };

  return (
    <div ref={rootRef} className="flex flex-wrap items-stretch sm:flex-nowrap">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="intent-options"
        onClick={() => (open ? closeAll() : setOpen(true))}
        className="btn btn-ghost-light"
      >
        <span>I&rsquo;m looking to&hellip;</span>
        <svg viewBox="0 0 12 12" aria-hidden className={`size-3 transition-transform duration-500 ease-(--ease-out) ${open ? "rotate-45" : ""}`}>
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <div
        className={`grid transition-[grid-template-columns,grid-template-rows,opacity] duration-500 ease-(--ease-smooth) max-sm:basis-full ${
          open
            ? "opacity-100 max-sm:grid-rows-[1fr] sm:grid-cols-[1fr]"
            : "opacity-0 max-sm:grid-rows-[0fr] sm:grid-cols-[0fr]"
        }`}
      >
        <ul
          id="intent-options"
          inert={!open}
          aria-label="Choose what you're looking to do"
          className="flex min-h-0 min-w-0 overflow-hidden max-sm:mt-3 max-sm:grid max-sm:grid-cols-3"
        >
          {intents.map((intent, i) => (
            <li key={intent.id} className="shadow-[inset_1px_0_0_var(--line-dark)] max-sm:nth-[3n+1]:shadow-none sm:first:shadow-none">
              <a
                href={intent.href}
                onClick={() => {
                  if (intent.href.startsWith("#")) announce(intent.id);
                  closeAll();
                }}
                className={optionClass}
              >
                <OptionLabel open={open} index={i}>
                  <span className={underline}>{intent.label}</span>
                </OptionLabel>
              </a>
            </li>
          ))}

          <li className="shadow-[inset_1px_0_0_var(--line-dark)]">
            <button
              ref={pgButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={pgOpen}
              aria-controls={pgOpen ? "pg-menu" : undefined}
              onClick={() => (pgOpen ? closePg(false) : openPg())}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && !pgOpen) {
                  e.preventDefault();
                  openPg();
                }
              }}
              className={optionClass}
            >
              <OptionLabel open={open} index={intents.length}>
                <span className={underline}>PGs</span>
                <svg
                  viewBox="0 0 12 12"
                  aria-hidden
                  className={`size-2.5 not-italic transition-transform duration-300 ease-(--ease-smooth) ${pgOpen ? "rotate-180" : ""}`}
                >
                  <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </OptionLabel>
            </button>
          </li>
        </ul>
      </div>

      {pgOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id="pg-menu"
            role="menu"
            aria-label="Paying guest accommodation"
            onKeyDown={onMenuKeyDown}
            style={{ top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left, width: MENU_WIDTH }}
            className="pg-menu fixed z-[60] border border-line-dark bg-contrast/95 p-1.5 text-on-contrast shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)] backdrop-blur-[6px]"
          >
            <p className="eyebrow px-3 pt-2.5 pb-2 text-mist" aria-hidden>
              Paying guest
            </p>
            {pgOptions.map((option, i) => (
              <a
                key={option.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                href={option.href}
                onClick={() => {
                  closeAll();
                }}
                className="flex items-center justify-between px-3 py-2.5 text-[0.9375rem] text-on-contrast/85 outline-none transition-colors duration-200 hover:bg-on-contrast/8 hover:text-on-contrast focus-visible:bg-on-contrast/10 focus-visible:text-on-contrast"
              >
                {option.label}
                <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 opacity-60">
                  <path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
                </svg>
              </a>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

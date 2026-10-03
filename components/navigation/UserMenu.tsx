"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { links } from "@/lib/site";
import type { SessionUser } from "./useSessionUser";

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Account";
}

export function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <circle cx="10" cy="7" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.75 16.5c.9-3 3.3-4.5 6.25-4.5s5.35 1.5 6.25 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <rect x="3.5" y="6.5" width="13" height="9.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v1.5M3.5 10.5h13" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path d="M3.5 4.5h13v9.5H9.5l-4 3v-3h-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path d="M5.5 3.5h9v13l-4.5-3.2-4.5 3.2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path d="M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function BadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path d="M10 2.5l2 1.6 2.6-.2.7 2.5 2.2 1.4-1 2.4 1 2.4-2.2 1.4-.7 2.5-2.6-.2L10 17.5l-2-1.6-2.6.2-.7-2.5-2.2-1.4 1-2.4-1-2.4 2.2-1.4.7-2.5 2.6.2zM7.2 10l2 2 3.6-3.8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path d="M8 4H4.5v12H8M12.5 6.5 16 10l-3.5 3.5M16 10H7.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const itemClass =
  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[0.9375rem] text-on-contrast/85 outline-none transition-colors duration-200 hover:bg-on-contrast/8 hover:text-on-contrast focus-visible:bg-on-contrast/10 focus-visible:text-on-contrast";

type Props = {
  user: SessionUser;
  /** Called before navigating away, e.g. to close a surrounding mobile menu. */
  onNavigate?: () => void;
};

/**
 * Account menu button: user icon and first name, opening Profile, Bookmarks and
 * Log out. Follows the WAI-ARIA menu button pattern.
 */
export function UserMenu({ user, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const focusFirstOnOpen = useRef(false);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  const openMenu = useCallback((focusFirst: boolean) => {
    focusFirstOnOpen.current = focusFirst;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (focusFirstOnOpen.current) itemRefs.current[0]?.focus();

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    // The landing header slides away on scroll; a menu left floating would detach from it.
    const onScroll = () => close(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, close]);

  const onButtonKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(true);
      requestAnimationFrame(() => itemRefs.current.at(-1)?.focus());
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focus(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focus(0);
        break;
      case "End":
        event.preventDefault();
        focus(items.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const name = firstName(user.name);
  // Agents and staff get their workspace first; customers get a way to apply as an agent.
  const menuLinks = [
    user.hasWorkspace
      ? { href: "/dashboard", label: "Workspace dashboard", icon: <DashboardIcon className="size-4 opacity-70" /> }
      : null,
    { href: links.profile, label: "Profile", icon: <UserIcon className="size-4 opacity-70" /> },
    { href: links.bookmarks, label: "Bookmarks", icon: <BookmarkIcon className="size-4 opacity-70" /> },
    { href: links.trips, label: "Trips", icon: <TripIcon className="size-4 opacity-70" /> },
    { href: links.messages, label: "Messages", icon: <MessageIcon className="size-4 opacity-70" /> },
    user.hasWorkspace ? null : { href: "/become-a-host", label: "Become a host", icon: <BadgeIcon className="size-4 opacity-70" /> },
    user.hasWorkspace ? null : { href: "/become-an-agent", label: "Become an agent", icon: <BadgeIcon className="size-4 opacity-70" /> },
  ].filter((x): x is { href: string; label: string; icon: React.ReactElement } => x !== null);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${user.name || user.email}`}
        onClick={() => (open ? close(false) : openMenu(false))}
        onKeyDown={onButtonKeyDown}
        className="group flex min-h-10 items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors duration-300 hover:bg-current/8"
      >
        <span className="grid size-8 place-items-center rounded-full border border-current/35 transition-colors duration-300 group-hover:border-current/60">
          <UserIcon className="size-[1.125rem]" />
        </span>
        <span className="max-w-[7rem] truncate text-[0.875rem] font-medium">{name}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className={`size-2.5 opacity-70 transition-transform duration-300 ease-(--ease-smooth) ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      {open && (
        // Fully opaque on purpose: this panel sits inside a header that already uses a
        // backdrop blur, so its own blur cannot reach the page and translucency would
        // let text show through crisply.
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="menu-in absolute top-full right-0 z-[60] mt-2 w-64 border border-line-dark bg-contrast p-1.5 text-on-contrast shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]"
        >
          <div className="border-b border-line-dark px-3 pt-2.5 pb-3" role="presentation">
            <p className="truncate text-[0.9375rem] font-medium">{user.name}</p>
            <p className="mt-0.5 truncate text-[0.8125rem] text-mist">{user.email}</p>
          </div>

          <div className="py-1.5" role="presentation">
            {menuLinks.map((item, i) => (
              <a
                key={item.href}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                href={item.href}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={itemClass}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </div>

          <form action={signOutAction} className="border-t border-line-dark pt-1.5" role="presentation">
            <button
              ref={(el) => {
                itemRefs.current[menuLinks.length] = el;
              }}
              role="menuitem"
              type="submit"
              className={itemClass}
            >
              <LogOutIcon className="size-4 opacity-70" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

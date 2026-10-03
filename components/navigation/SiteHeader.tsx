"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { FOR_OWNERS, LEGAL_VERIFICATION, SERVICES, links, site } from "@/lib/site";
import { ServicesMenu } from "./ServicesMenu";
import { signOutAction } from "@/app/(auth)/actions";
import { firstName, UserIcon, UserMenu } from "./UserMenu";
import { useSessionUser } from "./useSessionUser";
import { ThemeChoicePicker } from "@/components/theme/ThemeChoice";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

// Sustained travel needed before the bar steps aside, and before it returns.
const HIDE_DOWN_PX = 64;
const HIDE_UP_PX = 24;

const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) * 16 || 72;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [onDark, setOnDark] = useState(true);
  const [open, setOpen] = useState(false);
  const session = useSessionUser();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let last = window.scrollY;
    let travelled = 0;
    let frame = 0;
    // Last committed values, so a scroll frame only re-renders on a real change.
    let isScrolled = false;
    let isHidden = false;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - last;
        last = y;

        if ((y > 32) !== isScrolled) {
          isScrolled = y > 32;
          setScrolled(isScrolled);
        }

        // Require sustained travel in one direction, so inertia and trackpad
        // jitter cannot flip the bar in and out.
        travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta;

        let next = isHidden;
        if (y <= window.innerHeight * 0.6) next = false;
        else if (travelled > HIDE_DOWN_PX) next = true;
        else if (travelled < -HIDE_UP_PX) next = false;

        if (next !== isHidden) {
          isHidden = next;
          travelled = 0;
          setHidden(next);
        }
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Tint the bar to whatever sits beneath it, so it never drops a pale slab over
  // the cinematic sections. Sections opt in with data-nav="dark".
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('[data-nav="dark"]');
    if (!targets.length) return;
    const overlapping = new Set<Element>();
    let observer: IntersectionObserver | null = null;

    const connect = () => {
      observer?.disconnect();
      overlapping.clear();
      const band = Math.max(window.innerHeight - headerHeight(), 0);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) overlapping.add(entry.target);
            else overlapping.delete(entry.target);
          }
          setOnDark(overlapping.size > 0);
        },
        { rootMargin: `0px 0px -${band}px 0px` },
      );
      targets.forEach((el) => observer?.observe(el));
    };

    let resizeFrame = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(connect);
    };

    connect();
    window.addEventListener("resize", onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(resizeFrame);
    };
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close();
      if (event.key !== "Tab" || !panel) return;
      const focusables = [
        toggleRef.current,
        ...panel.querySelectorAll<HTMLElement>("a[href], button"),
      ].filter(Boolean) as HTMLElement[];
      const first = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        first.focus();
      }
    };
    const onResize = () => window.innerWidth >= 1024 && close(false);

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const solid = scrolled && !open;
  const darkBar = solid && onDark;

  return (
    <>
      <header
        data-solid={solid || undefined}
        className={[
          "fixed inset-x-0 top-0 z-50 transition-[transform,background-color,color,box-shadow] duration-500 ease-(--ease-smooth)",
          // "surface-dark" lights the logo's halo wherever the bar carries light text.
          solid
            ? darkBar
              ? "surface-dark bg-contrast/80 text-on-contrast shadow-[0_1px_0_var(--line-dark)] backdrop-blur-[6px]"
              : "bg-ivory/92 text-ink shadow-[0_1px_0_var(--line-light)] backdrop-blur-[6px]"
            : "surface-dark bg-transparent text-on-contrast",
          hidden && !open ? "-translate-y-full" : "translate-y-0",
        ].join(" ")}
      >
        <div className="shell enter-fade flex h-(--header-h) items-center justify-between gap-3 sm:gap-6 lg:grid lg:grid-cols-[1fr_auto_1fr]" style={{ "--d": "240ms" } as React.CSSProperties}>
          <a href="#top" className="-m-2 shrink-0 p-2 lg:justify-self-start" aria-label={`${site.name} — back to top`}>
            {/* Always the brand's brick and green; only the arch and "Trust" follow the bar's text colour. */}
            <Logo tone="brand" markClassName="size-7" />
          </a>

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-10 text-[0.9375rem] tracking-[-0.005em]">
              <li>
                <ServicesMenu />
              </li>
              <li>
                <Link href={links.about} className="link-rule opacity-85 transition-opacity duration-500 hover:opacity-100">
                  About
                </Link>
              </li>
              <li>
                <Link href={links.contact} className="link-rule opacity-85 transition-opacity duration-500 hover:opacity-100">
                  Contact us
                </Link>
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-1 sm:gap-5 lg:justify-self-end">
            {/* The open mobile menu carries its own account actions, so step these aside. */}
            <div className={`flex items-center gap-2 transition-opacity duration-300 sm:gap-6 ${open ? "invisible opacity-0" : "opacity-100"}`}>
              <ThemeToggle className="hidden sm:inline-flex" />
              <Link
                href="/become-a-host"
                data-cta="list-your-home"
                className="link-rule hidden text-[0.875rem] whitespace-nowrap opacity-85 transition-opacity duration-500 hover:opacity-100 lg:inline"
              >
                List your home
              </Link>
              <span aria-hidden className="hidden h-4 w-px bg-current opacity-25 lg:block" />
              {session.status === "authenticated" ? (
                <UserMenu user={session.user} />
              ) : (
                <>
                  <a href={links.login} className="link-rule hidden text-[0.875rem] whitespace-nowrap opacity-85 transition-opacity duration-500 hover:opacity-100 sm:inline">
                    Log in
                  </a>
                  <a
                    href={links.signup}
                    className={`btn btn-compact ${solid && !darkBar ? "btn-dark" : "btn-light"}`}
                  >
                    Sign up
                  </a>
                </>
              )}
            </div>
            <button
              ref={toggleRef}
              type="button"
              className="relative -mr-2 grid size-11 place-items-center lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => (open ? close(false) : setOpen(true))}
            >
              <span aria-hidden className="relative block h-3 w-6">
                <span
                  className={`absolute left-0 h-px w-6 bg-current transition-transform duration-500 ease-(--ease-out) ${open ? "top-1.5 rotate-45" : "top-0"}`}
                />
                <span
                  className={`absolute left-0 h-px bg-current transition-all duration-500 ease-(--ease-out) ${open ? "top-1.5 w-6 -rotate-45" : "top-3 w-4"}`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={`surface-dark fixed inset-0 z-40 flex flex-col overflow-y-auto overscroll-contain bg-contrast text-on-contrast transition-[clip-path,visibility] duration-500 ease-(--ease-smooth) lg:hidden ${
          open ? "visible [clip-path:inset(0_0_0_0)]" : "invisible [clip-path:inset(0_0_100%_0)]"
        }`}
      >
        <nav aria-label="Mobile" className="shell flex flex-1 flex-col justify-center pt-(--header-h)">
          <p className="eyebrow mb-2 text-mist">Our Services</p>
          <ul className="flex flex-col">
            {[...SERVICES, LEGAL_VERIFICATION].map((service, i) => (
              <li key={service.href} className="border-b border-line-dark">
                <Link
                  href={service.href}
                  onClick={() => close(false)}
                  className={`display flex items-baseline justify-between py-3 text-[clamp(2.125rem,9.5vw,4rem)] sm:py-4 transition-[opacity,transform] duration-500 ease-(--ease-smooth) ${
                    open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                  }`}
                  style={{ transitionDelay: open ? `${160 + i * 60}ms` : "0ms" }}
                >
                  {service.label}
                  <span className="eyebrow text-mist tabular-nums">0{i + 1}</span>
                </Link>
              </li>
            ))}
          </ul>
          <ul
            className={`mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-mist transition-opacity delay-300 duration-700 ${open ? "opacity-100" : "opacity-0"}`}
          >
            {[{ label: "About", href: links.about }, { label: "Contact us", href: links.contact }, ...FOR_OWNERS].map((item) => (
              <li key={item.label}>
                <Link href={item.href} onClick={() => close(false)} className="link-rule hover:text-on-contrast">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div
          className={`shell flex flex-col gap-6 pb-[max(2rem,env(safe-area-inset-bottom))] transition-opacity delay-300 duration-700 ${open ? "opacity-100" : "opacity-0"}`}
        >
          <ThemeChoicePicker className="border-t border-line-dark pt-5" />
          {session.status === "authenticated" ? (
            <div>
              <div className="mb-4 flex items-center gap-3 border-t border-line-dark pt-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-on-contrast/35">
                  <UserIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-medium">{firstName(session.user.name)}</span>
                  <span className="block truncate text-[0.8125rem] text-mist">{session.user.email}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <a href={links.profile} onClick={() => close(false)} className="btn btn-light w-full">
                  Profile
                </a>
                <a href={links.bookmarks} onClick={() => close(false)} className="btn btn-ghost-light w-full">
                  Bookmarks
                </a>
              </div>
              <form action={signOutAction} className="mt-3">
                <button type="submit" className="btn btn-ghost-light w-full">
                  <span>Log out</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <a href={links.login} onClick={() => close(false)} className="btn btn-ghost-light w-full">
                Log in
              </a>
              <a href={links.signup} onClick={() => close(false)} className="btn btn-light w-full">
                Sign up
              </a>
            </div>
          )}
          <p className="text-[0.75rem] text-mist">{site.legalName}</p>
        </div>
      </div>
    </>
  );
}

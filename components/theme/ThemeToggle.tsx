"use client";

import { useEffect, useState } from "react";
import { isDark, setChoice, subscribe } from "./theme";

/**
 * Light ⇄ dark, as a switch.
 *
 * The knob's position is set in CSS (globals.css, `.theme-switch`), so it is already
 * right on the first paint, before this component hydrates — including for a reader
 * whose device asks for dark and who has chosen nothing. Only the state a screen
 * reader announces has to wait for hydration, which is why `aria-checked` is
 * corrected on mount.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () => setDark(isDark());
    read();
    return subscribe(read);
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      suppressHydrationWarning
      onClick={() => setChoice(dark ? "light" : "dark")}
      title="Dark theme"
      className={`theme-switch ${className}`}
    >
      <span className="sr-only">Dark theme</span>
      <span aria-hidden className="theme-switch-track">
        <SunIcon className="theme-switch-icon theme-switch-sun" />
        <MoonIcon className="theme-switch-icon theme-switch-moon" />
        <span className="theme-switch-knob" />
      </span>
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.6" />
      <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M16.2 12.3A6.8 6.8 0 0 1 7.7 3.8a6.8 6.8 0 1 0 8.5 8.5z" />
    </svg>
  );
}

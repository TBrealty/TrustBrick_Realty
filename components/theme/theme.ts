"use client";

/**
 * The theme, in one place.
 *
 * "system" is the default and needs no JavaScript: globals.css answers
 * prefers-color-scheme. A choice is written to `data-theme` on <html> (so CSS wins
 * over the media query) and remembered in localStorage, which the small script in
 * the root layout replays before the first paint, so nothing flashes.
 */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "theme";
/** Fired when the theme changes here, so every control on the page keeps in step. */
export const THEME_EVENT = "trustbrick:theme";

export function readChoice(): ThemeChoice {
  const attr = document.documentElement.dataset.theme;
  return attr === "dark" || attr === "light" ? attr : "system";
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function isDark(choice: ThemeChoice = readChoice()): boolean {
  return choice === "system" ? systemPrefersDark() : choice === "dark";
}

export function setChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    delete root.dataset.theme;
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      // A blocked store only means the choice doesn't outlive this page.
    }
  } else {
    root.dataset.theme = choice;
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      // As above.
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Calls back whenever the theme changes here, in another tab, or on the device. */
export function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    const value = e.newValue;
    if (value === "dark" || value === "light") document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
    onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The home page's background film (public/videos/CREDITS.md): a looping montage over the hero's
 * still, which is its first frame, so the swap is invisible. It plays only where it's welcome:
 * not for people who ask their device to reduce motion, not on a slow connection or with data
 * saver on, and not while scrolled away. A visitor who pauses it keeps it paused on this device.
 */

const PAUSED_KEY = "tb-hero-video-paused";

// A tiny store shared by the video (behind the hero) and its button (in the hero's footer).
type State = { available: boolean; playing: boolean };
let state: State = { available: false, playing: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: State = { available: false, playing: false };
let video: HTMLVideoElement | null = null;
let userPaused = false;

const readPaused = () => {
  try {
    return localStorage.getItem(PAUSED_KEY) === "1";
  } catch {
    return false;
  }
};
const savePaused = (paused: boolean) => {
  try {
    if (paused) localStorage.setItem(PAUSED_KEY, "1");
    else localStorage.removeItem(PAUSED_KEY);
  } catch {
    // Private windows: it just won't be remembered.
  }
};

/** Should this visitor get the film at all? */
function welcome() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /(^|-)(2g|3g)$/.test(c.effectiveType)) return false;
  return true;
}

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || !welcome()) return;
    video = v;
    userPaused = readPaused();
    // Laptops and big screens get 1080p; tablets and phones the lighter 720p.
    v.src = window.matchMedia("(min-width: 1024px)").matches ? "/videos/hero-montage-1080.mp4" : "/videos/hero-montage-720.mp4";

    const onPlaying = () => {
      v.dataset.on = "";
      set({ available: true, playing: true });
    };
    const onPause = () => set({ playing: false });
    const onReady = () => set({ available: true });
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadeddata", onReady);

    // Play while the hero is on screen; rest when it isn't.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPaused) v.play().catch(() => {});
      else if (!entry.isIntersecting) v.pause();
    });
    io.observe(v);
    // Paused before: show the Play button, but fetch nothing until it is pressed.
    if (userPaused) set({ available: true });

    return () => {
      io.disconnect();
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadeddata", onReady);
      video = null;
      set({ available: false, playing: false });
    };
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-1000 data-on:opacity-100"
    />
  );
}

/**
 * Pause or play the film. Until the film is ready (or when it isn't shown at all), the hero
 * keeps what was there before: `fallback`.
 */
export function HeroVideoToggle({ fallback }: { fallback: React.ReactNode }) {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  if (!s.available) return <>{fallback}</>;
  const toggle = () => {
    if (!video) return;
    if (s.playing) {
      userPaused = true;
      savePaused(true);
      video.pause();
    } else {
      userPaused = false;
      savePaused(false);
      video.play().catch(() => {});
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={s.playing ? "Pause the background video" : "Play the background video"}
      className="eyebrow flex items-center gap-2 rounded-full border border-on-contrast/25 px-3 py-2 transition-colors hover:border-on-contrast/60 hover:text-on-contrast"
    >
      {s.playing ? <Pause size={14} weight="light" aria-hidden /> : <Play size={14} weight="light" aria-hidden />}
      {s.playing ? "Pause" : "Play"}
    </button>
  );
}

"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { images } from "@/lib/images";

/**
 * Holds the opening sequence until the page can play it in one piece: the hero
 * photograph decoded and the display font loaded. Without the gate the headline
 * animates against an empty frame and then jumps as the serif swaps in.
 *
 * The gate is capped, so a slow image never keeps the words off the screen.
 */
const MAX_WAIT_MS = 900;

export function HeroMedia() {
  const [loaded, setLoaded] = useState(false);
  const started = useRef(false);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    document.documentElement.classList.add("hero-ready");
  }, []);

  // One cap for the whole wait, started on mount so a late image cannot extend it.
  useEffect(() => {
    const cap = window.setTimeout(start, MAX_WAIT_MS);
    return () => window.clearTimeout(cap);
  }, [start]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    Promise.resolve(document.fonts?.ready)
      .then(() => !cancelled && start())
      .catch(() => start());
    return () => {
      cancelled = true;
    };
  }, [loaded, start]);

  return (
    <div data-parallax="0.15" className="absolute inset-0 will-change-transform">
      <div className="hero-settle absolute inset-0">
        <Image
          src={images.hero.src}
          alt={images.hero.alt}
          fill
          preload
          quality={80}
          sizes="100vw"
          placeholder="blur"
          className="object-cover object-[58%_62%]"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}

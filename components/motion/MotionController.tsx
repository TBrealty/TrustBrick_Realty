"use client";

import { useEffect } from "react";

type Layer = {
  el: HTMLElement;
  box: HTMLElement;
  speed: number;
  fade: number;
  /** Cached geometry, measured off the scroll path. */
  center: number;
  height: number;
  visible: boolean;
  last: number;
};

/**
 * One observer and one scroll loop for the whole page, so sections can stay
 * server components and opt in with data attributes:
 *   data-reveal[="fade"|"lines"|"image"]  → gains .is-in when it enters view
 *   data-parallax="0.15"                  → translates at a fraction of scroll
 *   data-fade="0.55"                      → fades out over that share of its box
 *
 * Geometry is measured only on load and resize. During scroll the loop does no
 * layout reads at all and writes nothing but composited transforms, so scrolling
 * costs no style recalc or layout per frame.
 */
export function MotionController() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      // Start just before a block scrolls in, so nothing sits blank on screen waiting to appear.
      { rootMargin: "0px 0px 12% 0px", threshold: 0 },
    );
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => revealObserver.observe(el));

    // Content that arrives after this ran (a section streamed in or re-rendered) must reveal too,
    // or it would stay invisible.
    const added = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches("[data-reveal]:not(.is-in)")) revealObserver.observe(node);
          node.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-in)").forEach((el) => revealObserver.observe(el));
        }
      }
    });
    added.observe(document.body, { childList: true, subtree: true });

    if (reduced) {
      return () => {
        revealObserver.disconnect();
        added.disconnect();
      };
    }

    const layers: Layer[] = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]")).map((el) => ({
      el,
      box: el.parentElement ?? el,
      speed: Number(el.dataset.parallax) || 0,
      fade: Number(el.dataset.fade) || 0,
      center: 0,
      height: 1,
      visible: false,
      last: Number.NaN,
    }));

    if (!layers.length) {
      return () => {
        revealObserver.disconnect();
        added.disconnect();
      };
    }

    let viewport = window.innerHeight;

    // All reads happen here, in one batch, never inside the scroll loop.
    const measure = () => {
      viewport = window.innerHeight;
      const scrollY = window.scrollY;
      for (const layer of layers) {
        const rect = layer.box.getBoundingClientRect();
        layer.height = rect.height || 1;
        layer.center = rect.top + scrollY + rect.height / 2;
        layer.last = Number.NaN;
      }
    };

    const paint = () => {
      frame = 0;
      const scrollY = window.scrollY;
      const eye = scrollY + viewport / 2;
      for (const layer of layers) {
        if (!layer.visible) continue;
        const shift = Math.round((layer.center - eye) * layer.speed * 10) / 10;
        if (shift !== layer.last) {
          layer.last = shift;
          layer.el.style.transform = `translate3d(0, ${shift}px, 0)`;
          if (layer.fade) {
            const progress = (scrollY - (layer.center - layer.height / 2)) / (layer.height * layer.fade);
            layer.el.style.opacity = String(1 - Math.min(Math.max(progress, 0), 1));
          }
        }
      }
    };

    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    // Promote only the layers currently on screen.
    const layerObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const layer = layers.find((l) => l.box === entry.target);
          if (!layer) continue;
          layer.visible = entry.isIntersecting;
          layer.el.style.willChange = entry.isIntersecting ? "transform" : "";
        }
        schedule();
      },
      { rootMargin: "15% 0px" },
    );
    layers.forEach((layer) => layerObserver.observe(layer.box));

    let resizeFrame = 0;
    const remeasure = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        measure();
        paint();
      });
    };

    measure();
    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", remeasure);
    // Images and fonts settling can move sections; re-measure once they land.
    window.addEventListener("load", remeasure);
    document.fonts?.ready.then(remeasure).catch(() => {});

    return () => {
      revealObserver.disconnect();
      added.disconnect();
      layerObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
    };
  }, []);

  return null;
}

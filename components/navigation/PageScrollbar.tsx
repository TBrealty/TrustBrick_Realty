"use client";

import { useEffect, useRef } from "react";

const PAD = 4; // px kept clear at the top and bottom of the screen
const MIN = 40; // the handle's smallest height, so it stays easy to grab

/**
 * The page's scrollbar: a slim brick handle floating over the right edge of the screen, in place
 * of the browser's own bar (hidden in globals.css), which sits in a strip of its own beside the
 * page and can't take the colour of each section. The page scrolls exactly as before (wheel,
 * keyboard, touch, find-in-page); this only shows where you are and can be dragged. Mouse and
 * trackpad screens only: phones and tablets keep their own overlay scrollbars.
 */
export function PageScrollbar() {
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    const doc = document.documentElement;
    let frame = 0;
    let size = MIN;

    const update = () => {
      frame = 0;
      const view = window.innerHeight;
      const total = doc.scrollHeight;
      const scrollable = total - view;
      if (scrollable <= 1) {
        thumb.hidden = true;
        return;
      }
      thumb.hidden = false;
      const track = view - PAD * 2;
      size = Math.max(MIN, (track * view) / total);
      const top = PAD + (track - size) * Math.min(1, Math.max(0, window.scrollY / scrollable));
      thumb.style.height = `${size}px`;
      thumb.style.transform = `translate3d(0, ${top}px, 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    // Dragging the handle scrolls the page in proportion, at once (not smoothly).
    let startY = 0;
    let startScroll = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      thumb.setPointerCapture(e.pointerId);
      thumb.dataset.dragging = "";
      startY = e.clientY;
      startScroll = window.scrollY;
    };
    const onMove = (e: PointerEvent) => {
      if (!("dragging" in thumb.dataset)) return;
      const view = window.innerHeight;
      const track = view - PAD * 2 - size;
      if (track <= 0) return;
      const ratio = (doc.scrollHeight - view) / track;
      window.scrollTo({ top: startScroll + (e.clientY - startY) * ratio, behavior: "instant" });
    };
    const onUp = (e: PointerEvent) => {
      delete thumb.dataset.dragging;
      if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The page grows and shrinks as images, reveals and filters change it.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    thumb.addEventListener("pointerdown", onDown);
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onUp);
    thumb.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      thumb.removeEventListener("pointerdown", onDown);
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onUp);
      thumb.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return <div ref={thumbRef} aria-hidden hidden className="page-scrollbar" />;
}

"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

/** About 1 km: the rounded point (lib/listings/queries.ts) is always within ~800 m of the real one. */
const RADIUS_M = 1000;

/**
 * Roughly where a listing is: OpenStreetMap with a soft brick circle over the area, never a pin on
 * the building. Leaflet and the tiles load only when the map scrolls into view, so the page isn't
 * slowed by a map nobody looks at. Scrolling the page never zooms the map; dragging and the zoom
 * buttons do, up to street level.
 */
export function ListingMap({ lat, lng, place, note }: { lat: number; lng: number; place: string; note: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"waiting" | "ready" | "failed">("waiting");

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !boxRef.current) return;
        map = L.map(boxRef.current, {
          center: [lat, lng],
          // One step further out on narrow screens, so the area around the circle shows too.
          zoom: boxRef.current.clientWidth < 560 ? 13 : 14,
          minZoom: 10,
          maxZoom: 16,
          scrollWheelZoom: false,
          zoomControl: true,
        });
        map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        // The site's tint, as a layer between the tiles (z-index 200) and the circle (400), blended
        // over the tiles in CSS (globals.css). A CSS filter on the tiles would show hairline seams
        // between them on high-density screens.
        const tint = map.createPane("tint");
        tint.style.zIndex = "250";
        tint.style.pointerEvents = "none";
        L.rectangle(
          [
            [-85, -180],
            [85, 180],
          ],
          { pane: "tint", renderer: L.svg({ pane: "tint" }), stroke: false, interactive: false, className: "listing-map-tint" },
        ).addTo(map);
        L.circle([lat, lng], { radius: RADIUS_M, color: "#b0502c", weight: 1.5, fillColor: "#de6a3d", fillOpacity: 0.14 }).addTo(map);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        void start();
      },
      { rootMargin: "300px" },
    );
    io.observe(box);
    return () => {
      cancelled = true;
      io.disconnect();
      map?.remove();
    };
  }, [lat, lng]);

  return (
    <figure>
      <div className="listing-map relative isolate aspect-[16/10] overflow-hidden border border-line-light bg-sand sm:aspect-[16/8]">
        <div ref={boxRef} className="absolute inset-0" role="img" aria-label={`Map of the area around ${place}`} />
        {state !== "ready" && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[0.875rem] text-stone-deep">
            {state === "failed" ? `The map couldn't load. The listing is in ${place}.` : `Loading the map of ${place}…`}
          </p>
        )}
      </div>
      <figcaption className="mt-3 flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-stone-deep">
        <span aria-hidden className="mt-1.5 size-2.5 flex-none rounded-full border border-brick bg-brick-bright/25" />
        <span>
          Approximate location in {place}: the listing is within the shaded area. {note}
        </span>
      </figcaption>
    </figure>
  );
}

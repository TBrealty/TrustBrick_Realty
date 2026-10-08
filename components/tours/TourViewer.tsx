"use client";

import "@photo-sphere-viewer/core/index.css";
import { useEffect, useRef, useState } from "react";
import type { TourData, TourRoom, TourView } from "@/lib/tours/terms";


type ViewerLike = { setPanorama: (url: string, options?: { caption?: string; transition?: boolean | { speed: number } }) => Promise<boolean>; destroy: () => void };

/**
 * The virtual tour: 360° rooms (drag, pinch or turn the phone to look around), the 3D model
 * (drag to turn it, scroll or pinch to zoom), and a hosted 3D tour. The viewers are loaded only
 * here, so the rest of the site never downloads them.
 */
export function TourViewer({ tour, title, initialView }: { tour: TourData; title: string; initialView?: TourView }) {
  const views: { key: TourView; label: string }[] = [
    ...(tour.rooms.length ? [{ key: "rooms" as const, label: "360° tour" }] : []),
    ...(tour.model ? [{ key: "model" as const, label: "3D model" }] : []),
    ...(tour.link ? [{ key: "link" as const, label: `3D tour · ${tour.link.provider}` }] : []),
  ];
  const [view, setView] = useState<TourView>(views.some((v) => v.key === initialView) ? initialView! : (views[0]?.key ?? "rooms"));

  if (views.length === 0) return <p className="text-[0.9375rem] text-stone-deep">This property doesn&apos;t have a virtual tour yet.</p>;
  return (
    <div>
      {views.length > 1 && (
        <div role="tablist" aria-label="Tour views" className="mb-4 flex flex-wrap gap-2">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              id={`tour-tab-${v.key}`}
              aria-selected={view === v.key}
              aria-controls={`tour-panel-${v.key}`}
              onClick={() => setView(v.key)}
              className={`rounded-full border px-4 py-2 text-[0.875rem] transition-colors ${view === v.key ? "border-ink bg-ink text-paper" : "border-line-light bg-card text-graphite hover:border-ink/40"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <div role={views.length > 1 ? "tabpanel" : undefined} id={`tour-panel-${view}`} aria-labelledby={views.length > 1 ? `tour-tab-${view}` : undefined}>
        {view === "rooms" && <Rooms rooms={tour.rooms} title={title} />}
        {view === "model" && tour.model && <Model model={tour.model} title={title} />}
        {view === "link" && tour.link && <HostedTour link={tour.link} title={title} />}
      </div>
    </div>
  );
}

const roomName = (r: TourRoom, i: number) => r.name || `Room ${i + 1}`;

function Rooms({ rooms, title }: { rooms: TourRoom[]; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<ViewerLike | null>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const first = useRef(rooms[0]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ Viewer }, { GyroscopePlugin }] = await Promise.all([import("@photo-sphere-viewer/core"), import("@photo-sphere-viewer/gyroscope-plugin")]);
        if (cancelled || !container.current) return;
        viewer.current = new Viewer({
          container: container.current,
          panorama: first.current.url,
          caption: roomName(first.current, 0),
          loadingTxt: "Loading the room…",
          defaultZoomLvl: 0,
          keyboard: "always",
          // Scrolling the page shouldn't zoom the room: zoom with Ctrl+scroll, pinch or the buttons.
          mousewheelCtrlKey: true,
          touchmoveTwoFingers: false,
          navbar: ["zoom", "move", "gyroscope", "caption", "fullscreen"],
          plugins: [GyroscopePlugin],
          lang: { gyroscope: "Look around by moving your phone", ctrlZoom: "Use Ctrl + scroll to zoom" },
        }) as unknown as ViewerLike;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      viewer.current?.destroy();
      viewer.current = null;
    };
  }, []);

  const go = (i: number) => {
    setIndex(i);
    viewer.current?.setPanorama(rooms[i].url, { caption: roomName(rooms[i], i), transition: { speed: 1200 } }).catch(() => setFailed(true));
  };

  if (failed) {
    return <p className="rounded-[3px] bg-paper p-6 text-[0.9375rem] text-graphite">The tour couldn&apos;t be shown in this browser. Try a recent Chrome, Safari or Firefox.</p>;
  }
  return (
    <div>
      <div
        ref={container}
        className="h-[min(70svh,40rem)] w-full overflow-hidden rounded-[4px] bg-ink"
        role="application"
        aria-roledescription="360° view"
        aria-label={`${roomName(rooms[index], index)}, ${title}. Drag or use the arrow keys to look around.`}
      />
      <p className="sr-only" aria-live="polite">
        Showing {roomName(rooms[index], index)}, room {index + 1} of {rooms.length}.
      </p>
      {rooms.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[0.9375rem] font-medium">
              Rooms <span className="font-normal text-stone-deep">({rooms.length})</span>
            </h2>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost-dark btn-compact" onClick={() => go(index - 1)} disabled={index === 0}>
                <span>Previous room</span>
              </button>
              <button type="button" className="btn btn-ghost-dark btn-compact" onClick={() => go(index + 1)} disabled={index === rooms.length - 1}>
                <span>Next room</span>
              </button>
            </div>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-2">
            {rooms.map((r, i) => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "true" : undefined}
                  className={`block w-36 overflow-hidden rounded-[3px] border-2 text-left transition-colors ${i === index ? "border-ink" : "border-transparent hover:border-ink/30"}`}
                >
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small gated renditions, served by /media
                    <img src={r.thumbnailUrl} alt="" className="aspect-[2/1] w-full bg-sand object-cover" loading="lazy" />
                  ) : (
                    <span className="block aspect-[2/1] bg-sand" />
                  )}
                  <span className="block truncate bg-card px-2 py-1.5 text-[0.8125rem]">{roomName(r, i)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Model({ model, title }: { model: { url: string; name: string }; title: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    import("@google/model-viewer").then(() => setReady(true)).catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="rounded-[3px] bg-paper p-6 text-[0.9375rem] text-graphite">The 3D model couldn&apos;t be shown in this browser.</p>;
  return (
    <div>
      <div className="h-[min(70svh,40rem)] w-full overflow-hidden rounded-[4px] bg-sand">
        {ready ? (
          <model-viewer
            src={model.url}
            alt={`3D model of ${title}`}
            camera-controls=""
            auto-rotate=""
            auto-rotate-delay="2000"
            interaction-prompt="auto"
            touch-action="pan-y"
            shadow-intensity="1"
            exposure="1"
            style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          />
        ) : (
          <p className="grid h-full place-items-center text-[0.9375rem] text-stone-deep">Loading the 3D model…</p>
        )}
      </div>
      <p className="mt-3 text-[0.8125rem] text-stone-deep">Drag to turn it, pinch or scroll to zoom, and drag with two fingers (or right-click) to move it.</p>
    </div>
  );
}

function HostedTour({ link, title }: { link: { provider: string; url: string }; title: string }) {
  return (
    <div>
      <iframe
        src={link.url}
        title={`3D tour of ${title}, on ${link.provider}`}
        className="h-[min(70svh,40rem)] w-full rounded-[4px] border-0 bg-ink"
        allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
      />
      <p className="mt-3 text-[0.8125rem] text-stone-deep">Hosted by {link.provider}. Use the controls inside the tour to move between rooms.</p>
    </div>
  );
}

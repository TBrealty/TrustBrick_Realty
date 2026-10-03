import { memo } from "react";

const metrics = [
  { label: "Metro station", value: "6 min", note: "walk" },
  { label: "Schools", value: "4", note: "within 1.5 km" },
  { label: "Hospitals", value: "2", note: "within 3 km" },
  { label: "Parks", value: "3", note: "within 1 km" },
];

const pois = [
  [96, 70],
  [228, 58],
  [300, 150],
  [132, 196],
  [262, 214],
  [58, 150],
  [350, 88],
];

function MapIllustration() {
  return (
    <svg viewBox="0 0 440 270" className="block h-auto w-full" aria-hidden>
      <rect width="440" height="270" fill="var(--ivory)" />
      {/* water & green */}
      <path d="M0 232c60-10 120 8 180-2s110-30 170-18 70 10 90 6v52H0z" fill="#cfd6d3" />
      <path d="M268 20h96l14 70-74 22-36-40z" fill="#d7ddcc" />
      <path d="M40 170l52-8 18 40-58 12z" fill="#d7ddcc" />
      {/* street grid */}
      <g stroke="#fff" strokeLinecap="round">
        <path d="M-10 118L450 96" strokeWidth="9" />
        <path d="M188 -10L214 280" strokeWidth="9" />
        <path d="M-10 40l460 -18M-10 190l460 -20M80 -10l20 280M330 -10l-8 280M20 260l420-60" strokeWidth="4" />
        <path d="M140 -10l10 280M262 -10l6 280M-10 70l460-14M-10 150l460-18" strokeWidth="2" />
      </g>
      {/* metro line */}
      <path d="M-10 250C120 200 150 150 204 120S340 40 450 30" fill="none" stroke="var(--brick)" strokeWidth="2.5" strokeDasharray="7 5" />
      <rect x="232" y="94" width="12" height="12" fill="var(--paper)" stroke="var(--brick)" strokeWidth="2.5" />
      {/* walk isochrone */}
      <path d="M200 30c52 6 104 34 118 76s-10 96-58 118-116 8-148-26-34-100-6-138 42-34 94-30z" fill="rgb(13 17 25 / 0.04)" stroke="var(--ink)" strokeDasharray="3 4" />
      {pois.map(([cx, cy], i) => (
        <rect key={i} x={cx - 3.5} y={cy - 3.5} width="7" height="7" fill="var(--graphite)" />
      ))}
      {/* subject */}
      <circle cx="206" cy="124" r="60" fill="none" stroke="var(--ink)" className="ring-pulse" />
      <circle cx="206" cy="124" r="11" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="206" cy="124" r="4.5" fill="var(--ink)" />
      <g className="font-mono" fontSize="8" letterSpacing="0.1em">
        <rect x="222" y="132" width="86" height="18" fill="var(--ink)" />
        <text x="230" y="144" fill="var(--paper)">
          15-MIN WALK
        </text>
      </g>
    </svg>
  );
}

// Static content: memoised so parent re-renders (autoplay, visibility) never re-render the mockup.
export const NeighborhoodMockup = memo(function NeighborhoodMockup() {
  return (
    <div className="bg-paper text-ink">
      <div className="flex items-center justify-between border-b border-line-light px-6 py-4 sm:px-8">
        <p className="eyebrow">Neighborhood Intelligence</p>
        <p className="eyebrow hidden text-stone-deep sm:block">Sample area</p>
      </div>
      <MapIllustration />
      <dl className="grid grid-cols-2 border-t border-line-light">
        {metrics.map((m, i) => (
          <div key={m.label} className={`p-5 sm:px-8 sm:py-6 ${i % 2 === 0 ? "border-r border-line-light" : ""} ${i < 2 ? "border-b border-line-light" : ""}`}>
            <dt className="text-[0.75rem] text-stone-deep">{m.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="display text-[2.25rem] leading-none">{m.value}</span>
              <span className="text-[0.75rem] text-stone-deep">{m.note}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
});

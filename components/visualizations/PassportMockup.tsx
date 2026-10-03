import { memo } from "react";

const fields = [
  ["Type", "Apartment"],
  ["Carpet area", "1,240 sq ft"],
  ["Floor", "14 of 22"],
  ["Facing", "North-east"],
  ["Completed", "2019"],
  ["Parking", "1 covered"],
];

const timeline = [
  { year: "2016", label: "Land title" },
  { year: "2017", label: "Approved" },
  { year: "2019", label: "Completed" },
  { year: "2021", label: "Sold" },
  { year: "2024", label: "Renovated" },
];

function FloorPlan() {
  return (
    <svg viewBox="0 0 220 160" className="h-auto w-full text-ink" aria-hidden>
      <g fill="none" stroke="currentColor">
        <rect x="4" y="4" width="212" height="152" strokeWidth="3" />
        <path d="M92 4v70M92 96v60M4 84h60M84 84h52M136 4v56M136 80v76M160 84h56" strokeWidth="1.5" />
        {/* door swings */}
        <path d="M64 84a20 20 0 0 1 20-20" strokeWidth="0.75" strokeDasharray="2 2" />
        <path d="M136 60a20 20 0 0 1 20 20" strokeWidth="0.75" strokeDasharray="2 2" />
        <path d="M92 74a22 22 0 0 0 22 22" strokeWidth="0.75" strokeDasharray="2 2" />
      </g>
      <g className="fill-stone-deep font-mono" fontSize="7" letterSpacing="0.08em">
        <text x="14" y="22">LIVING</text>
        <text x="99" y="22">KITCHEN</text>
        <text x="146" y="22">BED 1</text>
        <text x="14" y="102">BED 2</text>
        <text x="102" y="114">BATH</text>
        <text x="146" y="102">BED 3</text>
      </g>
      <rect x="4" y="44" width="3" height="24" className="fill-brick" />
    </svg>
  );
}

// Static content: memoised so parent re-renders (autoplay, visibility) never re-render the mockup.
export const PassportMockup = memo(function PassportMockup() {
  return (
    <div className="bg-paper text-ink">
      <div className="flex items-center justify-between border-b border-line-light px-6 py-4 sm:px-8">
        <p className="eyebrow">Property Passport™</p>
        <p className="eyebrow hidden tabular-nums text-stone-deep sm:block">TB · 0000 · 0000</p>
      </div>

      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_1fr] sm:gap-8 sm:p-8">
        <div>
          <p className="display text-[2rem] leading-none">Residence 14B</p>
          <p className="mt-2 text-[0.8125rem] text-stone-deep">Sample property · Tower B</p>
          <div className="mt-6 border border-line-light p-3">
            <FloorPlan />
          </div>
        </div>
        <dl className="grid grid-cols-2 content-start gap-x-6 sm:grid-cols-1">
          {fields.map(([k, v]) => (
            <div key={k} className="flex flex-col border-t border-line-light py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-[0.75rem] text-stone-deep">{k}</dt>
              <dd className="text-[0.875rem] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-line-light px-6 pt-5 pb-7 sm:px-8">
        <p className="eyebrow text-stone-deep">Record history</p>
        <ol className="relative mt-5 grid grid-cols-5">
          <span aria-hidden className="absolute inset-x-0 top-[5px] h-px bg-line-light" />
          {timeline.map((t, i) => (
            <li key={t.year} className="relative pr-2">
              <span
                aria-hidden
                className={`relative block size-[11px] rounded-full border ${i === timeline.length - 1 ? "border-brick bg-brick" : "border-ink bg-paper"}`}
              />
              <p className="mt-3 font-mono text-[0.6875rem] tabular-nums">{t.year}</p>
              <p className="mt-0.5 text-[0.6875rem] leading-snug text-stone-deep sm:text-[0.75rem]">{t.label}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
});

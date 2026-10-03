import { memo } from "react";

const signals = [
  { label: "Title documents", status: "Documented", ok: true },
  { label: "RERA registration", status: "Matched", ok: true },
  { label: "Listing consistency", status: "Consistent", ok: true },
  { label: "Ownership history", status: "3 records", ok: true },
  { label: "Occupancy certificate", status: "Under review", ok: false },
];

const SCORE = 86;
const TICKS = 50;

// Static content: memoised so parent re-renders (autoplay, visibility) never re-render the mockup.
export const ScoreMockup = memo(function ScoreMockup() {
  return (
    <div className="bg-paper p-6 text-ink sm:p-8">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Trustbrick Score™</p>
        <p className="eyebrow hidden text-stone-deep sm:block">Sample listing</p>
      </div>

      <div className="mt-8 flex items-end justify-between gap-6 border-b border-line-light pb-6">
        <div>
          <p className="text-[0.8125rem] text-stone-deep">3 BHK apartment · 14th floor</p>
          <p className="display mt-2 flex items-baseline gap-2 text-[4.75rem] leading-[0.8] tracking-[-0.04em] sm:text-[6.5rem]">
            {SCORE}
            <span className="font-mono text-[0.8125rem] tracking-normal text-stone-deep">/100</span>
          </p>
        </div>
        <div className="pb-1 text-right">
          <p className="text-[0.9375rem] font-medium whitespace-nowrap">Strong signals</p>
          <p className="mt-1 text-[0.8125rem] whitespace-nowrap text-brick">1 under review</p>
        </div>
      </div>

      <div className="mt-5" aria-hidden>
        <div className="flex h-5 gap-[3px]">
          {Array.from({ length: TICKS }, (_, i) => (
            <span key={i} className={`flex-1 ${i < Math.round((SCORE / 100) * TICKS) ? "bg-ink" : "bg-sand"}`} />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[0.625rem] text-stone-deep">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      <ul className="mt-6">
        {signals.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 border-t border-line-light py-3 text-[0.875rem]">
            <span>{s.label}</span>
            <span className={`flex items-center gap-2 ${s.ok ? "text-sage" : "text-brick"}`}>
              {s.ok ? (
                <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                  <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              ) : (
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
              )}
              {s.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});

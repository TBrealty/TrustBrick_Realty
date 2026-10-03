import { memo } from "react";

// Hand-set sample series (₹ Cr, quarterly). Purely illustrative.
const series = [1.86, 1.89, 1.88, 1.93, 1.97, 1.99, 2.04, 2.06, 2.08, 2.13, 2.19, 2.26];
const W = 480;
const H = 150;
const MIN = 1.7;
const MAX = 2.45;

const x = (i: number) => (i / (series.length - 1)) * W;
const y = (v: number) => H - ((v - MIN) / (MAX - MIN)) * H;

const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
const band =
  series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v + 0.03 + i * 0.006).toFixed(1)}`).join(" ") +
  " " +
  series
    .map((v, i) => [i, v] as const)
    .reverse()
    .map(([i, v]) => `L${x(i).toFixed(1)} ${y(v - 0.03 - i * 0.006).toFixed(1)}`)
    .join(" ") +
  " Z";

const comps = [
  { name: "Comparable A", dist: "0.4 km", area: "1,180 sq ft", rate: "₹18,600" },
  { name: "Comparable B", dist: "0.7 km", area: "1,310 sq ft", rate: "₹17,900" },
  { name: "Comparable C", dist: "1.1 km", area: "1,250 sq ft", rate: "₹18,200" },
];

// Static content: memoised so parent re-renders (autoplay, visibility) never re-render the mockup.
export const ValueMockup = memo(function ValueMockup() {
  const last = series.length - 1;
  return (
    <div className="bg-paper p-6 text-ink sm:p-8">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Trustbrick Value™</p>
        <p className="eyebrow hidden text-stone-deep sm:block">Sample estimate</p>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-[0.8125rem] text-stone-deep">Estimated range</p>
          <p className="display mt-2 text-[3rem] leading-none tracking-[-0.03em] sm:text-[3.75rem]">
            ₹2.18 – 2.34 <span className="text-[0.55em]">Cr</span>
          </p>
        </div>
        <div className="pb-1">
          <p className="text-[0.75rem] text-stone-deep">Confidence</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-2.5 w-5 ${i < 3 ? "bg-ink" : "bg-sand"}`} />
              ))}
            </span>
            <span className="text-[0.875rem] font-medium">Moderate</span>
          </div>
        </div>
      </div>

      <div className="mt-7 border-y border-line-light py-5">
        <svg viewBox={`-4 -10 ${W + 8} ${H + 34}`} className="h-auto w-full overflow-visible" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1="0" x2={W} y1={(H / 3) * i} y2={(H / 3) * i} stroke="var(--line-light)" strokeDasharray="2 4" />
          ))}
          <path d={band} fill="var(--sand)" opacity="0.9" />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
          <line x1={x(last)} x2={x(last)} y1="-6" y2={H} stroke="var(--brick)" strokeWidth="1" />
          <circle cx={x(last)} cy={y(series[last])} r="4.5" fill="var(--brick)" />
          {["2023", "2024", "2025", "2026"].map((yr, i) => (
            <text key={yr} x={(W / 3) * i} y={H + 20} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} className="fill-stone-deep font-mono" fontSize="10">
              {yr}
            </text>
          ))}
        </svg>
      </div>

      <ul className="mt-2">
        {comps.map((c) => (
          <li key={c.name} className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-line-light py-2.5 text-[0.8125rem] last:border-0 sm:grid-cols-[1fr_4rem_6rem_auto]">
            <span>{c.name}</span>
            <span className="hidden text-stone-deep sm:block">{c.dist}</span>
            <span className="hidden text-stone-deep sm:block">{c.area}</span>
            <span className="text-right tabular-nums">
              {c.rate}
              <span className="text-stone-deep"> / sq ft</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});

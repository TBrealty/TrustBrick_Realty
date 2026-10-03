"use client";

import { useId, useMemo, useRef, useState } from "react";

/**
 * Single-series charts for the dashboards. One hue (brick, validated against the white card
 * surface), thin marks, recessive axes, a crosshair tooltip that follows pointer and keyboard,
 * and a table view so no value depends on hovering. See the dataviz notes in docs/portals.
 */

type Point = { bucket: string; count: number };
type Bucket = "hour" | "day" | "week" | "month";

const W = 640;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

function niceMax(max: number) {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) ?? 10 * pow;
  return Math.ceil(max / step) * step;
}

function labelFor(bucket: string, unit: Bucket, long = false) {
  const d = new Date(`${bucket}:00+05:30`);
  const opts: Intl.DateTimeFormatOptions =
    unit === "hour"
      ? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }
      : unit === "month"
        ? { month: "short", year: long ? "numeric" : "2-digit", timeZone: "Asia/Kolkata" }
        : { day: "numeric", month: "short", timeZone: "Asia/Kolkata" };
  const text = new Intl.DateTimeFormat("en-IN", opts).format(d);
  return unit === "week" && long ? `Week of ${text}` : text;
}

export function TrendChart({ title, points, unit, valueLabel = "new" }: { title: string; points: Point[]; unit: Bucket; valueLabel?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tableId = useId();
  const total = points.reduce((s, p) => s + p.count, 0);

  const geo = useMemo(() => {
    const max = niceMax(Math.max(0, ...points.map((p) => p.count)));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join("");
    const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
    return { max, x, y, line, area, ticks: [0, max / 2, max] };
  }, [points]);

  if (points.length === 0) return <p className="text-[0.8125rem] text-stone-deep">No data for this range.</p>;

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i;
    setActive(best);
  };
  const a = active === null ? null : points[active];
  const labelIdx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        {title}: {total.toLocaleString("en-IN")} in total. Use the table below for every value.
      </figcaption>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y outline-none"
          role="img"
          aria-label={`${title} chart`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
            if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          }}
        >
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line-light)" strokeWidth="1" />
              <text x={PAD.left - 6} y={geo.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-stone-deep text-[10px] tabular-nums">
                {Math.round(t).toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text key={i} x={geo.x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-stone-deep text-[10px]">
              {labelFor(points[i].bucket, unit)}
            </text>
          ))}
          <path d={geo.area} fill="var(--brick)" fillOpacity="0.1" />
          <path d={geo.line} fill="none" stroke="var(--brick)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {a && active !== null && (
            <g>
              <line x1={geo.x(active)} x2={geo.x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--stone)" strokeWidth="1" />
              <circle cx={geo.x(active)} cy={geo.y(a.count)} r="4.5" fill="var(--brick)" stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
        {a && active !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-[3px] border border-line-light bg-card px-2.5 py-1.5 text-[0.75rem] shadow-md"
            style={{ left: `${(geo.x(active) / W) * 100}%`, transform: `translateX(${active > points.length / 2 ? "-105%" : "5%"})` }}
          >
            <p className="font-semibold text-ink tabular-nums">{a.count.toLocaleString("en-IN")}</p>
            <p className="flex items-center gap-1.5 whitespace-nowrap text-stone-deep">
              <span className="inline-block h-0.5 w-3 bg-brick" aria-hidden />
              {valueLabel} · {labelFor(a.bucket, unit, true)}
            </p>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {a ? `${labelFor(a.bucket, unit, true)}: ${a.count}` : ""}
        </p>
      </div>
      <details className="mt-2 text-[0.75rem]">
        <summary className="cursor-pointer text-stone-deep hover:text-ink">View as table</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table id={tableId} className="wtable">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col" className="text-right">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.bucket}>
                  <td>{labelFor(p.bucket, unit, true)}</td>
                  <td className="text-right tabular-nums">{p.count.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Ranked magnitudes: one hue, bars ≤ 24px, value at the tip, full rows as the hover target. */
export function BarList({ rows, empty = "Nothing to show yet." }: { rows: { label: string; sublabel?: string; value: number }[]; empty?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length === 0) return <p className="text-[0.8125rem] text-stone-deep">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li
          key={`${r.label}-${i}`}
          className={`grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 rounded-[3px] px-1 py-0.5 text-[0.8125rem] sm:grid-cols-[minmax(0,11rem)_1fr] ${hover === i ? "bg-paper" : ""}`}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
        >
          <span className="truncate text-graphite" title={r.sublabel ? `${r.label}, ${r.sublabel}` : r.label}>
            {r.label}
            {r.sublabel && <span className="text-stone-deep"> · {r.sublabel}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 rounded-r-[4px] bg-brick transition-opacity" style={{ width: `${Math.max(2, (r.value / max) * 85)}%`, opacity: hover === null || hover === i ? 1 : 0.55 }} aria-hidden />
            <span className="text-ink tabular-nums">{r.value.toLocaleString("en-IN")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

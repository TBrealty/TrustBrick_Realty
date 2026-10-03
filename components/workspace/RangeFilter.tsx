"use client";

import { useState } from "react";
import { RANGE_PRESETS, type RangeKey } from "@/lib/range";

/**
 * The date range for a dashboard: presets first, custom range behind them. A plain GET
 * form, so the range lives in the URL and every figure on the page uses the same slice.
 */
export function RangeFilter({ value, from, to, extra }: { value: RangeKey; from: string; to: string; extra?: React.ReactNode }) {
  const [range, setRange] = useState<RangeKey>(value);
  return (
    <form
      className="mb-6 flex flex-wrap items-end gap-3"
      method="get"
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.type === "checkbox") t.form?.requestSubmit();
      }}
    >
      <div>
        <label htmlFor="range" className="mb-1.5 block text-[0.75rem] text-stone-deep">
          Date range
        </label>
        <select
          id="range"
          name="range"
          className="winput min-w-44"
          value={range}
          onChange={(e) => {
            const next = e.target.value as RangeKey;
            setRange(next);
            if (next !== "custom") e.target.form?.requestSubmit();
          }}
        >
          {Object.entries(RANGE_PRESETS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {range === "custom" && (
        <>
          <div>
            <label htmlFor="from" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              From
            </label>
            <input id="from" name="from" type="date" defaultValue={from} className="winput" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              To
            </label>
            <input id="to" name="to" type="date" defaultValue={to} className="winput" />
          </div>
        </>
      )}
      {extra}
      <button type="submit" className={`wbtn wbtn-secondary ${range === "custom" ? "" : "sr-only"}`}>
        Apply
      </button>
    </form>
  );
}

"use client";

import { useId, useState } from "react";

/** Square feet in one of each unit. Local units vary slightly by region; these are the standard values. */
export const AREA_UNITS = [
  { key: "sqft", label: "Square feet", short: "sq ft", sqft: 1 },
  { key: "sqyd", label: "Square yards (gaj)", short: "sq yd", sqft: 9 },
  { key: "sqm", label: "Square metres", short: "sq m", sqft: 10.7639 },
  { key: "cent", label: "Cents", short: "cents", sqft: 435.6 },
  { key: "guntha", label: "Guntha", short: "guntha", sqft: 1089 },
  { key: "acre", label: "Acres", short: "acres", sqft: 43560 },
  { key: "hectare", label: "Hectares", short: "ha", sqft: 107639 },
] as const;

type UnitKey = (typeof AREA_UNITS)[number]["key"];

const show = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-IN") : n >= 1 ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : n.toLocaleString("en-IN", { maximumSignificantDigits: 3 }));

/** Enter an area in any unit and read it in all the others. */
export function AreaConverter() {
  const [value, setValue] = useState(200);
  const [unit, setUnit] = useState<UnitKey>("sqyd");
  const id = useId();
  const sqft = value * (AREA_UNITS.find((u) => u.key === unit)?.sqft ?? 1);

  return (
    <div className="border border-line-light bg-card p-6 sm:p-7">
      <p className="text-[1.0625rem] font-medium">Area converter</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor={`${id}-v`} className="text-[0.8125rem] text-stone-deep">
            Area
          </label>
          <input
            id={`${id}-v`}
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1.5 h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] tabular-nums focus:border-ink focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`${id}-u`} className="text-[0.8125rem] text-stone-deep">
            In
          </label>
          <select
            id={`${id}-u`}
            value={unit}
            onChange={(e) => setUnit(e.target.value as UnitKey)}
            className="mt-1.5 h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
          >
            {AREA_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-light pt-4 sm:grid-cols-3" aria-live="polite">
        {AREA_UNITS.filter((u) => u.key !== unit).map((u) => (
          <div key={u.key}>
            <dt className="text-[0.75rem] text-stone-deep">{u.label}</dt>
            <dd className="mt-0.5 text-[0.9375rem] font-medium tabular-nums">
              {show(sqft / u.sqft)} <span className="font-normal text-stone-deep">{u.short}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

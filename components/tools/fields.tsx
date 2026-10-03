"use client";

import { useId } from "react";

/**
 * A number and a slider for the same value, labelled once. Typing is exact; the slider is
 * for getting close quickly. The hint (for example "₹1.2 Cr") reads the value back in words.
 */
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.875rem] font-medium">
          {label}
        </label>
        {hint && (
          <span className="text-[0.8125rem] text-stone-deep" aria-live="polite">
            {hint}
          </span>
        )}
      </div>
      <div className="mt-2 flex h-11 items-center rounded-[2px] border border-line-light bg-paper px-3 focus-within:border-ink">
        {prefix && <span className="mr-1.5 text-stone-deep">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? min : Number(e.target.value))}
          onBlur={(e) => onChange(clamp(Number(e.target.value) || min))}
          className="w-full min-w-0 bg-transparent text-[0.9375rem] tabular-nums outline-none"
        />
        {suffix && <span className="ml-1.5 shrink-0 text-stone-deep">{suffix}</span>}
      </div>
      <input
        type="range"
        aria-label={`${label}, slider`}
        value={clamp(value || min)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-brick"
      />
    </div>
  );
}

/** Keeps the tool's inputs in the address bar, so a result can be bookmarked or shared. */
export function writeQuery(values: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === false || v === "") continue;
    params.set(k, v === true ? "1" : String(v));
  }
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

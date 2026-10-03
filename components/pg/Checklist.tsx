"use client";

import { useId, useMemo, useSyncExternalStore } from "react";

export type ChecklistGroup = { title: string; items: [key: string, label: string, hint?: string][] };

const STORE = "trustbrick:pg-checklist";

// The ticks live in localStorage, read through useSyncExternalStore so the server render
// (nothing ticked) and the browser's saved state never disagree during hydration.
// If storage is blocked, they're kept in memory for the life of the page.
const listeners = new Set<() => void>();
let memory = "{}";
function readTicks(): string {
  try {
    return localStorage.getItem(STORE) ?? "{}";
  } catch {
    return memory;
  }
}
function writeTicks(value: Record<string, boolean>) {
  memory = JSON.stringify(value);
  try {
    localStorage.setItem(STORE, memory);
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A checklist to take on a PG visit. Ticks are kept on this device (not an account), so
 * it can be filled in on the spot and come back to; printing gives a paper copy.
 */
export function Checklist({ groups }: { groups: ChecklistGroup[] }) {
  const raw = useSyncExternalStore(subscribe, readTicks, () => "{}");
  const ticked = useMemo<Record<string, boolean>>(() => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [raw]);
  const id = useId();
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const done = groups.reduce((a, g) => a + g.items.filter(([k]) => ticked[k]).length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border border-line-light bg-card px-5 py-4 print:hidden">
        <div className="min-w-48 flex-1">
          <p className="text-[0.9375rem] font-medium" aria-live="polite">
            {done} of {total} checked
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className="h-full bg-sage transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="btn btn-dark btn-compact">
            <span>Print</span>
          </button>
          <button type="button" onClick={() => writeTicks({})} disabled={done === 0} className="btn btn-ghost-dark btn-compact disabled:opacity-40">
            <span>Clear ticks</span>
          </button>
        </div>
      </div>
      <p className="mt-2 text-[0.8125rem] text-stone-deep print:hidden">Your ticks are saved on this device only.</p>

      <div className="mt-8 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
        {groups.map((g, gi) => (
          <fieldset key={g.title} className="break-inside-avoid">
            <legend className="text-[1.125rem] font-medium">{g.title}</legend>
            <ul className="mt-3 space-y-3">
              {g.items.map(([key, label, hint]) => (
                <li key={key}>
                  <label htmlFor={`${id}-${gi}-${key}`} className="flex cursor-pointer items-start gap-3">
                    <input
                      id={`${id}-${gi}-${key}`}
                      type="checkbox"
                      checked={Boolean(ticked[key])}
                      onChange={(e) => writeTicks({ ...ticked, [key]: e.target.checked })}
                      className="mt-1 size-4 shrink-0 accent-ink"
                    />
                    <span>
                      <span className={`block text-[0.9375rem] ${ticked[key] ? "text-stone-deep line-through decoration-stone" : "text-ink"}`}>{label}</span>
                      {hint && <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-stone-deep">{hint}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

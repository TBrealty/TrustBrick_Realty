"use client";

import { useEffect, useId, useState } from "react";
import { type ThemeChoice as Choice, readChoice, setChoice, subscribe } from "./theme";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

/**
 * The full choice, including going back to following the device. Used where there is
 * room for it: the mobile menu and the footer. `aria-checked` is settled on mount,
 * like the switch; until then the group simply reads as unselected.
 */
export function ThemeChoicePicker({ className = "", label = "Theme" }: { className?: string; label?: string }) {
  const [choice, setLocal] = useState<Choice | null>(null);
  // There can be two of these on a page (the mobile menu and the footer), so the label id is unique.
  const labelId = useId();

  useEffect(() => {
    const read = () => setLocal(readChoice());
    read();
    return subscribe(read);
  }, []);

  return (
    <div className={className}>
      <p id={labelId} className="eyebrow mb-2.5 opacity-60">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex rounded-full border border-current/25 p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            suppressHydrationWarning
            onClick={() => setChoice(option.value)}
            className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] transition-colors duration-200 ${
              choice === option.value ? "bg-current/12 font-medium" : "opacity-70 hover:opacity-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

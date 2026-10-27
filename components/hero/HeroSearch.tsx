"use client";

import { useState } from "react";

/**
 * The hero's search: what you're after (a tab), where, and a free-text search, sent to that
 * kind's browse page (/buy?city=…&q=…). A plain GET form, so it works before JavaScript loads;
 * the tabs only change where it goes.
 */

const KINDS = [
  { id: "buy", label: "Buy", path: "/buy", placeholder: "Locality, project or landmark" },
  { id: "rent", label: "Rent", path: "/rent", placeholder: "Locality or landmark" },
  { id: "pg", label: "PG", path: "/pg", placeholder: "Locality, college or office" },
  { id: "stay", label: "Stay", path: "/stays", placeholder: "Where are you going?" },
  { id: "invest", label: "Invest", path: "/invest", placeholder: "Locality or project" },
] as const;

const SHORTCUTS = [
  { label: "Homes with 3D tours", href: "/rent?tour=1" },
  { label: "Ready to move", href: "/buy?status=ready" },
  { label: "PGs for women", href: "/pg?gender=women" },
  { label: "Homestays", href: "/stays" },
  { label: "New launches", href: "/buy?status=under_construction" },
];

export function HeroSearch({ locations }: { locations: { slug: string; name: string }[] }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("buy");
  const current = KINDS.find((k) => k.id === kind)!;

  return (
    <div className="w-full max-w-[52rem]">
      <form
        action={current.path}
        method="get"
        role="search"
        aria-label="Search properties"
        onSubmit={(e) => {
          // Leave empty fields out of the address, so a bare search lands on a clean page.
          for (const el of Array.from(e.currentTarget.elements) as HTMLInputElement[]) if (el.name && !el.value) el.disabled = true;
        }}
        className="rounded-[14px] bg-card p-2.5 text-ink shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)] sm:p-3"
      >
        <div role="radiogroup" aria-label="What you're looking for" className="flex gap-1 overflow-x-auto pb-2.5 [scrollbar-width:none] sm:pb-3">
          {KINDS.map((k) => {
            const on = k.id === kind;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-[0.9375rem] font-medium transition-colors duration-300 ${
                  on ? "bg-ink text-ivory" : "text-stone-deep hover:bg-sand hover:text-ink"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor="hero-location">
            Location
          </label>
          <select
            id="hero-location"
            name="city"
            defaultValue=""
            className="h-13 w-full rounded-[10px] border border-line-light bg-card px-3.5 text-[0.9375rem] text-ink"
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="hero-q">
            Search
          </label>
          <input
            id="hero-q"
            name="q"
            type="search"
            maxLength={80}
            autoComplete="off"
            placeholder={current.placeholder}
            className="h-13 w-full rounded-[10px] border border-line-light bg-card px-3.5 text-[0.9375rem] text-ink placeholder:text-stone"
          />
          <button type="submit" className="flex h-13 items-center justify-center gap-2 rounded-[10px] bg-brick px-6 text-[0.9375rem] font-semibold text-white transition-colors duration-300 hover:bg-brick-bright">
            <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none">
              <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
              <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Search
          </button>
        </div>
      </form>

      <ul aria-label="Popular searches" className="mt-4 flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => (
          <li key={s.href}>
            <a href={s.href} className="inline-flex rounded-full border border-on-contrast/25 px-3.5 py-1.5 text-[0.8125rem] text-on-contrast/85 transition-colors duration-300 hover:border-on-contrast/60 hover:text-on-contrast">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

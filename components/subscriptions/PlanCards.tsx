"use client";

import Link from "next/link";
import { useState } from "react";
import { CYCLE_LABELS, type PlanView, inr, yearlySaving } from "@/lib/subscriptions/terms";
import type { BillingCycle } from "@/lib/vocab";

export type PlanAction = { label: string; href: string } | { label: string; disabled: true };

/**
 * The plans side by side with a monthly / yearly switch. `actionFor` gives each card's button for
 * the chosen cycle (computed by the page, which knows who's looking). Features that aren't built
 * yet say so: nobody pays for something that isn't there.
 */
export function PlanCards({
  plans,
  actionFor,
  initialCycle = "yearly",
  currentCode,
  tone = "light",
}: {
  plans: PlanView[];
  actionFor: Record<string, Record<BillingCycle, PlanAction>>;
  initialCycle?: BillingCycle;
  currentCode?: string | null;
  tone?: "light" | "workspace";
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const saving = Math.max(0, ...plans.map(yearlySaving));
  const ws = tone === "workspace";

  return (
    <div>
      <div role="radiogroup" aria-label="Billing" className="mx-auto mb-8 flex w-fit items-center gap-1 rounded-full border border-line-light bg-card p-1 text-[0.875rem]">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cycle === c}
            onClick={() => setCycle(c)}
            className={`rounded-full px-4 py-1.5 transition-colors ${cycle === c ? "bg-ink text-paper" : "text-graphite hover:text-ink"}`}
          >
            {CYCLE_LABELS[c].label}
            {c === "yearly" && saving > 0 && <span className={`ml-1.5 text-[0.75rem] ${cycle === c ? "text-paper/80" : "text-sage-deep"}`}>save up to {saving}%</span>}
          </button>
        ))}
      </div>

      <ul className={`grid grid-cols-1 gap-4 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"} ${plans.length === 2 ? "mx-auto max-w-4xl" : ""}`}>
        {plans.map((p) => {
          const price = cycle === "monthly" ? p.monthlyPrice : p.yearlyPrice;
          const action = actionFor[p.code]?.[cycle];
          const current = currentCode === p.code;
          return (
            <li
              key={p.code}
              className={`relative flex flex-col rounded-[4px] border p-6 sm:p-7 ${p.highlighted ? "border-ink shadow-[0_18px_50px_-24px_rgb(13_17_25/0.45)]" : "border-line-light"} ${ws ? "bg-card" : "bg-card"}`}
            >
              {p.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-brick px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-wide text-paper uppercase">Most popular</span>}
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[1.25rem] font-semibold">{p.name}</h3>
                {current && <span className="rounded-full bg-sage/15 px-2 py-0.5 text-[0.75rem] text-sage-deep">Your plan</span>}
              </div>
              <p className="mt-1 text-[0.875rem] text-stone-deep">{p.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="text-[2.25rem] leading-none font-semibold tabular-nums">{p.free ? "₹0" : inr(price)}</span>
                <span className="text-[0.875rem] text-stone-deep">{p.free ? "forever" : CYCLE_LABELS[cycle].per}</span>
              </p>
              <p className="mt-1.5 min-h-5 text-[0.75rem] text-stone-deep">
                {p.free
                  ? "No card needed."
                  : cycle === "yearly"
                    ? `${inr(Math.round(p.yearlyPrice / 12))} a month, billed yearly${yearlySaving(p) > 0 ? ` · save ${yearlySaving(p)}%` : ""}. Plus GST.`
                    : "Plus GST. Cancel any time."}
              </p>
              {!p.free && p.trialDays > 0 && <p className="mt-2 text-[0.8125rem] font-medium text-sage-deep">{p.trialDays}-day free trial</p>}

              <ul className="mt-5 flex-1 space-y-2.5 border-t border-line-light pt-5 text-[0.875rem]">
                {p.features.map((f) => (
                  <li key={f.key} className="flex gap-2.5">
                    <span aria-hidden className={`mt-0.5 ${f.comingSoon ? "text-stone" : "text-sage-deep"}`}>
                      {f.comingSoon ? "○" : "✓"}
                    </span>
                    <span>
                      <span className={f.comingSoon ? "text-graphite" : "text-ink"}>{f.label}</span>
                      {f.comingSoon && <span className="ml-1.5 rounded-full bg-amber/12 px-1.5 py-0.5 align-middle text-[0.6875rem] text-amber">Coming soon</span>}
                      {f.detail && <span className="mt-0.5 block text-[0.8125rem] text-stone-deep">{f.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {action && "href" in action ? (
                  <Link href={action.href} className={`btn w-full justify-center ${p.highlighted ? "btn-dark" : "btn-ghost-dark"}`}>
                    <span>{action.label}</span>
                  </Link>
                ) : action ? (
                  <span className="btn btn-ghost-dark w-full justify-center opacity-60" aria-disabled="true">
                    <span>{action.label}</span>
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

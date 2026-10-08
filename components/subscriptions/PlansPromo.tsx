"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type PlansPromo as Promo, plansPromoAction } from "@/app/plans/actions";
import { PLANS_PROMO_COOKIE, inr, yearlySaving } from "@/lib/subscriptions/terms";

/**
 * The plans pop-up, once after each log-in. Logging in leaves a short-lived cookie; the first
 * page after reads it, clears it, and asks the server what to show: nothing for someone already
 * paying, the trial for someone who can take one, and "keep it" for someone on a trial.
 */
export function PlansPromo() {
  const [promo, setPromo] = useState<Promo | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The root layout stays mounted through the redirect after logging in, so look on every page change.
  const pathname = usePathname();

  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${PLANS_PROMO_COOKIE}=`))) return;
    document.cookie = `${PLANS_PROMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
    let cancelled = false;
    // A moment's pause, so the page the person was heading to appears first.
    const t = setTimeout(() => {
      plansPromoAction()
        .then((p) => {
          if (!cancelled && p) setPromo(p);
        })
        .catch(() => {});
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname]);

  useEffect(() => {
    if (promo && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [promo]);

  if (!promo) return null;
  const { plan } = promo;
  const choose = `${promo.manageHref}?${new URLSearchParams({ plan: plan.code, cycle: "yearly" })}#choose`;
  const saving = yearlySaving(plan);
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={() => setPromo(null)}
      onClick={(e) => {
        // A click on the backdrop closes it.
        if (e.target === dialog.current) close();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-[6px] border border-line-light bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/55 backdrop:backdrop-blur-[2px]"
    >
      <div className="surface-dark relative bg-contrast px-6 pt-6 pb-5 text-on-contrast sm:px-7">
        <button type="button" onClick={close} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-on-contrast/70 hover:bg-on-contrast/10 hover:text-on-contrast" aria-label="Close">
          ✕
        </button>
        <p className="eyebrow text-brick-bright">{promo.audience === "partner" ? "For agents & hosts" : "Trustbrick " + plan.name}</p>
        <h2 id={titleId} className="display mt-3 text-[clamp(1.75rem,5vw,2.25rem)] leading-[1.02]">
          {promo.trialing ? (
            <>
              Enjoying <em>{plan.name}?</em>
            </>
          ) : (
            <>
              {plan.tagline.replace(/\.$/, "")}
              <em>.</em>
            </>
          )}
        </h2>
        <p className="mt-3 text-[0.9375rem] text-on-contrast/75">
          {promo.trialing
            ? "Keep it after your trial: choose monthly or yearly."
            : promo.trialAvailable && plan.trialDays > 0
              ? `Try ${plan.name} free for ${plan.trialDays} days. No card needed.`
              : `${plan.name} from ${inr(Math.round(plan.yearlyPrice / 12))} a month, billed yearly.`}
        </p>
      </div>
      <div className="px-6 py-5 sm:px-7">
        <ul className="space-y-2 text-[0.9375rem]">
          {plan.features.map((f) => (
            <li key={f.key} className="flex gap-2.5">
              <span aria-hidden className={`mt-0.5 ${f.comingSoon ? "text-stone" : "text-sage-deep"}`}>
                {f.comingSoon ? "○" : "✓"}
              </span>
              <span>
                {f.label}
                {f.comingSoon && <span className="ml-1.5 rounded-full bg-amber/12 px-1.5 py-0.5 align-middle text-[0.6875rem] text-amber">Coming soon</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.8125rem] text-stone-deep">
          {inr(plan.monthlyPrice)} a month, or {inr(plan.yearlyPrice)} a year{saving > 0 ? ` (save ${saving}%)` : ""}. Plus GST.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href={choose} onClick={close} className="btn btn-dark flex-1 justify-center">
            <span>{promo.trialing ? `Keep ${plan.name}` : promo.trialAvailable && plan.trialDays > 0 ? "Start free trial" : `Choose ${plan.name}`}</span>
          </Link>
          <Link href={promo.audience === "partner" ? "/plans?for=partners" : "/plans?for=you"} onClick={close} className="btn btn-ghost-dark flex-1 justify-center">
            <span>See all plans</span>
          </Link>
        </div>
        <button type="button" onClick={close} className="mt-3 w-full text-center text-[0.8125rem] text-stone-deep underline-offset-2 hover:underline">
          Not now
        </button>
      </div>
    </dialog>
  );
}

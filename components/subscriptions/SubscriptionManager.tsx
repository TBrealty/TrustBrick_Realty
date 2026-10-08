import Link from "next/link";
import { PlanCards } from "@/components/subscriptions/PlanCards";
import { planActions } from "@/components/subscriptions/plan-actions";
import { ActionForm, ConfirmAction, Submit } from "@/components/workspace/forms";
import { StatusBadge } from "@/components/workspace/ui";
import type { ActionResult } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import type { SubscriptionOverview } from "@/lib/services/subscriptions";
import { CYCLE_LABELS, EVENT_LABELS, STATE_LABELS, inr, priceFor } from "@/lib/subscriptions/terms";
import type { BillingCycle, PlanAudience } from "@/lib/vocab";

type Action = (prev: ActionResult<unknown> | null, form: FormData) => Promise<ActionResult<unknown>>;
export type SubscriptionActions = { startTrial: Action; choose: Action; cancel: Action; resume: Action };


/**
 * A subscriber's own subscription page: where they stand, a confirmation for the plan they picked
 * (from the plans page or the cards below), the plans, and their history. `canManage` false shows
 * it read-only, e.g. to an agent whose brokerage admin manages it.
 */
export function SubscriptionManager({
  overview,
  audience,
  canManage,
  choice,
  actions,
  history,
  whose,
}: {
  overview: SubscriptionOverview;
  audience: PlanAudience;
  canManage: boolean;
  choice: { plan: string; cycle: BillingCycle } | null;
  actions: SubscriptionActions;
  history: { action: string; amount: number | null; paymentReference: string | null; note: string | null; at: string }[];
  whose: string;
}) {
  const s = overview.subscription;
  const live = s !== null && ["trialing", "pending_payment", "active", "past_due", "paused"].includes(s.state);
  const paused = s?.state === "paused";
  const chosen = choice ? overview.plans.find((p) => p.code === choice.plan && !p.free) : undefined;
  const sameAsCurrent = chosen && live && s!.plan.code === chosen.code && s!.billingCycle === choice!.cycle && s!.state !== "trialing";
  const cards = planActions(audience, overview.plans, {
    signedIn: true,
    partner: audience === "partner",
    canManage,
    currentCode: live ? s!.plan.code : null,
    live,
    trialAvailable: overview.trialAvailable,
  });

  return (
    <div className="space-y-8">
      <section aria-labelledby="current-plan" className="rounded-[4px] border border-line-light bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] text-stone-deep">{whose} plan</p>
            <h2 id="current-plan" className="mt-0.5 text-[1.5rem] font-semibold">
              {live ? s!.plan.name : overview.entitledPlan.name}
            </h2>
          </div>
          {s && live && <StatusBadge tone={STATE_LABELS[s.state].tone}>{STATE_LABELS[s.state].label}</StatusBadge>}
        </div>

        <div className="mt-3 text-[0.9375rem] leading-relaxed text-graphite">
          {!s || !live ? (
            <p>
              You&apos;re on Free.{s && s.state === "expired" ? ` Your ${s.plan.name} ${s.trialEndsAt && !s.currentPeriodEnd ? "trial" : "subscription"} has ended.` : ""}{" "}
              {overview.trialAvailable ? "Try a paid plan free for 14 days, no card needed." : "Choose a plan below to subscribe."}
              {s && s.state === "revoked" && (
                <span className="mt-3 block rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.875rem]">
                  Your {s.plan.name} subscription was revoked by Trustbrick{s.statusReason ? `: “${s.statusReason}”` : "."} Questions?{" "}
                  <Link href="/contact" className="underline">
                    Contact us
                  </Link>
                  .
                </span>
              )}
            </p>
          ) : paused ? (
            <div>
              <p>
                {s.plan.name} is <strong className="font-medium text-ink">paused by Trustbrick</strong>
                {s.pausedAt ? ` since ${formatDay(s.pausedAt)}` : ""}
                {s.pauseUntil ? `, and resumes on ${formatDay(s.pauseUntil)}` : ", until the team resumes it"}. The time it&apos;s paused is added back to your plan.
              </p>
              {s.statusReason && (
                <p className="mt-2 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3 py-2 text-[0.875rem]">
                  <span className="text-stone-deep">Reason:</span> “{s.statusReason}”
                </p>
              )}
              <p className="mt-2 text-[0.875rem]">
                Questions?{" "}
                <Link href="/contact" className="underline">
                  Contact us
                </Link>
                .
              </p>
            </div>
          ) : s.state === "trialing" ? (
            <p>
              Your free trial ends on <strong className="font-medium text-ink">{formatDay(s.trialEndsAt!)}</strong> ({s.trialDaysLeft ?? 0} day{s.trialDaysLeft === 1 ? "" : "s"} left). Choose monthly or yearly to keep{" "}
              {s.plan.name} after that.
            </p>
          ) : s.state === "pending_payment" ? (
            <p>
              You&apos;ve chosen <strong className="font-medium text-ink">{s.plan.name}</strong>, {CYCLE_LABELS[s.billingCycle].label.toLowerCase()}, at {inr(s.price)} plus GST. The
              Trustbrick team will contact you to arrange payment; your plan starts as soon as it&apos;s received.
              {s.trialDaysLeft !== null && s.trialEndsAt ? ` Your trial keeps running until ${formatDay(s.trialEndsAt)}.` : ""} Your reference is{" "}
              <span className="font-mono text-ink">{s.referenceId}</span>.
            </p>
          ) : s.state === "past_due" ? (
            <p className="text-brick">
              Your paid period ended on {formatDay(s.currentPeriodEnd!)} and we haven&apos;t received the renewal. {s.plan.name} keeps working for a few more days; the team will be in
              touch.
            </p>
          ) : (
            <p>
              {inr(s.price)} {CYCLE_LABELS[s.billingCycle].per}, plus GST. {s.cancelAtPeriodEnd ? "Ends" : "Paid until"}{" "}
              <strong className="font-medium text-ink">{formatDay(s.currentPeriodEnd!)}</strong>
              {s.cancelAtPeriodEnd ? ", and won't renew." : "."}
            </p>
          )}
        </div>

        {canManage && s && live && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line-light pt-4">
            {!paused && (
              <Link href="#plans" className="wbtn wbtn-secondary wbtn-sm">
                {s.state === "trialing" ? "Choose monthly or yearly" : "Change plan"}
              </Link>
            )}
            {s.state === "active" && s.cancelAtPeriodEnd ? (
              <ActionForm action={actions.resume}>
                <Submit variant="secondary">Keep my plan</Submit>
              </ActionForm>
            ) : (
              <ConfirmAction
                label="Cancel subscription"
                title={`Cancel ${s.plan.name}?`}
                description={
                  s.state === "active"
                    ? `It stays active until ${formatDay(s.currentPeriodEnd!)}, then you're back on Free. Nothing is deleted.`
                    : "It ends now and you're back on Free. Nothing is deleted."
                }
                action={actions.cancel}
                variant="danger"
                confirmLabel="Cancel subscription"
              />
            )}
          </div>
        )}
        {!canManage && <p className="mt-4 border-t border-line-light pt-3 text-[0.8125rem] text-stone-deep">Your organization&apos;s admin manages this subscription.</p>}
      </section>

      {canManage && chosen && choice && !paused && (
        <section id="choose" aria-labelledby="confirm-choice" className="scroll-mt-24 rounded-[4px] border-2 border-ink bg-card p-5 sm:p-6">
          <h2 id="confirm-choice" className="text-[1.125rem] font-semibold">
            {chosen.name}, {CYCLE_LABELS[choice.cycle].label.toLowerCase()}
          </h2>
          <p className="mt-1 text-[0.9375rem] text-graphite">
            {inr(priceFor(chosen, choice.cycle))} {CYCLE_LABELS[choice.cycle].per}, plus GST.
          </p>
          {sameAsCurrent ? (
            <p className="mt-4 text-[0.9375rem] text-stone-deep">That&apos;s already your plan.</p>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {overview.trialAvailable && chosen.trialDays > 0 && !live && (
                <ActionForm action={actions.startTrial}>
                  <input type="hidden" name="plan" value={chosen.code} />
                  <input type="hidden" name="cycle" value={choice.cycle} />
                  <Submit>Start {chosen.trialDays}-day free trial</Submit>
                </ActionForm>
              )}
              <ActionForm action={actions.choose}>
                <input type="hidden" name="plan" value={chosen.code} />
                <input type="hidden" name="cycle" value={choice.cycle} />
                <Submit variant={overview.trialAvailable && chosen.trialDays > 0 && !live ? "secondary" : "primary"}>
                  {s && s.state === "active" ? `Ask to switch to ${chosen.name}` : `Subscribe to ${chosen.name}`}
                </Submit>
              </ActionForm>
            </div>
          )}
          <p className="mt-4 text-[0.8125rem] text-stone-deep">
            {s && s.state === "active"
              ? "The team will arrange the switch and any difference in price with you."
              : "Online payment is coming soon. Until then, the team contacts you to arrange payment, and your plan starts once it's received."}
          </p>
        </section>
      )}

      <section id="plans" aria-labelledby="plans-title" className="scroll-mt-24">
        <h2 id="plans-title" className="mb-5 text-[1.125rem] font-semibold">
          Plans
        </h2>
        <PlanCards plans={overview.plans} actionFor={cards} currentCode={live ? s!.plan.code : null} initialCycle={choice?.cycle ?? s?.billingCycle ?? "yearly"} />
      </section>

      {history.length > 0 && (
        <section aria-labelledby="sub-history" className="rounded-[4px] border border-line-light bg-card p-5 sm:p-6">
          <h2 id="sub-history" className="text-[1rem] font-semibold">
            History
          </h2>
          <ul className="mt-3 divide-y divide-line-light text-[0.875rem]">
            {history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span>
                  {EVENT_LABELS[h.action] ?? h.action}
                  {h.note && <span className="text-stone-deep"> · {h.note}</span>}
                  {h.paymentReference && <span className="text-stone-deep"> · ref {h.paymentReference}</span>}
                </span>
                <span className="flex items-baseline gap-3 text-stone-deep">
                  {h.amount !== null && h.amount > 0 && <span className="font-medium text-ink tabular-nums">{inr(h.amount)}</span>}
                  {formatDay(h.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionAdminCard } from "@/components/subscriptions/SubscriptionAdminCard";
import { ActionForm, AutoSubmit, Checkbox, ConfirmAction, Select, Submit, TextInput } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, EmptyState, FilterSelect, PageHeader, Pagination, StatCard, StatusBadge, Tabs } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatDay } from "@/lib/format";
import { listPlans, listSubscriptions, subscriptionEvents, subscriptionFilters } from "@/lib/services/subscriptions";
import { CYCLE_LABELS, EVENT_LABELS, STATE_LABELS, inr } from "@/lib/subscriptions/terms";
import { parsePage } from "@/lib/services/pagination";
import { changePlanAction, extendTrialAction, grantAction, recordPaymentAction, updatePlanAction } from "./actions";

export const metadata: Metadata = { title: "Subscriptions" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS = [
  ["all", "All"],
  ["pending_payment", "Waiting for payment"],
  ["trialing", "On trial"],
  ["active", "Active"],
  ["past_due", "Payment overdue"],
  ["paused", "Paused"],
  ["ended", "Ended"],
] as const;

export default async function SubscriptionsPage({ searchParams }: Props) {
  const actor = await requirePermission("subscriptions.view", "/subscriptions", "platform");
  const params = await searchParams;
  const filters = subscriptionFilters.parse(params);
  const [result, plans] = await Promise.all([listSubscriptions(actor, filters, parsePage(params.page)), listPlans(undefined, { includeInactive: true })]);
  const manage = can(actor, "subscriptions.manage", "platform");
  const editPlans = can(actor, "settings.manage", "platform");
  const histories = new Map(await Promise.all(result.rows.map(async (s) => [s.id, await subscriptionEvents(actor, s.id)] as const)));
  const st = result.stats;
  const tab = (state: string) => {
    const q = new URLSearchParams();
    if (state !== "all") q.set("state", state);
    if (filters.audience) q.set("audience", filters.audience);
    return `/subscriptions${q.size ? `?${q}` : ""}`;
  };
  const paidPlans = plans.filter((p) => !p.free && p.isActive);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Plans for people and partners. No payments are taken online yet: when someone chooses a paid plan, contact them, take the payment, and record it here to start their plan."
        actions={
          <Link href="/plans" className="wbtn wbtn-ghost wbtn-sm" target="_blank">
            Public plans page ↗
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Waiting for payment" value={st.pending} href="/subscriptions?state=pending_payment" emphasis hint="Contact them to arrange it" />
        <StatCard label="On trial" value={st.trialing} href="/subscriptions?state=trialing" />
        <StatCard label="Active" value={st.active} href="/subscriptions?state=active" hint={st.byPlan.map((p) => `${p.name} ${p.active}`).join(" · ")} />
        <StatCard label="Payment overdue" value={st.pastDue} href="/subscriptions?state=past_due" />
        <StatCard label="Monthly revenue" value={inr(st.monthlyRevenue)} hint="Active plans; yearly counted at a twelfth" />
      </div>

      <Tabs label="Subscription state" items={TABS.map(([k, label]) => ({ href: tab(k), label, active: filters.state === k, count: k === "pending_payment" ? st.pending || undefined : undefined }))} />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Search subscriptions">
          {filters.state !== "all" && <input type="hidden" name="state" value={filters.state} />}
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="SUB-, USR- or ORG- reference, name or email" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="audience" label="Subscriber" value={filters.audience} options={[["customer", "People"], ["partner", "Partners"]]} />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        {result.rows.length === 0 ? (
          <EmptyState title="No subscriptions here">They appear as people start trials and choose plans.</EmptyState>
        ) : (
          <ul className="divide-y divide-line-light">
            {result.rows.map((s) => {
              const h = histories.get(s.id) ?? [];
              const live = ["trialing", "pending_payment", "active", "past_due"].includes(s.state);
              const samePlans = paidPlans.filter((p) => p.audience === s.plan.audience);
              return (
                <li key={s.id} className="grid grid-cols-1 gap-3 p-4 sm:p-5 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:gap-6">
                  <div className="min-w-0 text-[0.8125rem]">
                    <p className="text-[0.875rem] font-medium">{s.subscriber.name}</p>
                    {s.subscriber.email && (
                      <a href={`mailto:${s.subscriber.email}?subject=${encodeURIComponent(`Your Trustbrick ${s.plan.name} subscription (${s.referenceId})`)}`} className="block truncate underline">
                        {s.subscriber.email}
                      </a>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <ReferenceId value={s.referenceId} copy />
                      <ReferenceId value={s.subscriber.referenceId} href={s.subscriber.kind === "organization" ? `/organizations/${s.subscriber.referenceId}` : `/users/${s.subscriber.referenceId}`} copy={false} />
                    </div>
                  </div>
                  <div className="min-w-0 text-[0.875rem]">
                    <p>
                      <span className="font-medium">{s.plan.name}</span>
                      <span className="text-stone-deep">
                        {" "}
                        · {s.subscriber.kind === "organization" ? "Partner" : "Person"} · {CYCLE_LABELS[s.billingCycle].label} · {s.price === 0 ? "complimentary" : `${inr(s.price)} ${CYCLE_LABELS[s.billingCycle].per}`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.8125rem] text-stone-deep">
                      {s.state === "trialing" && s.trialEndsAt && `Trial ends ${formatDay(s.trialEndsAt)}`}
                      {s.state === "pending_payment" && `Chose ${formatDay(s.createdAt)}${s.trialDaysLeft !== null && s.trialEndsAt ? ` · trial runs to ${formatDay(s.trialEndsAt)}` : ""}`}
                      {(s.state === "active" || s.state === "past_due") && s.currentPeriodEnd && `${s.cancelAtPeriodEnd ? "Ends" : "Paid until"} ${formatDay(s.currentPeriodEnd)}`}
                      {(s.state === "cancelled" || s.state === "expired" || s.state === "revoked") && `Since ${formatDay(s.createdAt)}`}
                      {s.state === "paused" && s.pausedAt && `Paused since ${formatDay(s.pausedAt)}${s.pauseUntil ? `, resumes ${formatDay(s.pauseUntil)}` : ""}`}
                    </p>
                    {s.statusReason && (s.state === "paused" || s.state === "revoked") && <p className="mt-1 text-[0.8125rem] text-graphite">Remark: “{s.statusReason}”</p>}
                    {h.length > 0 && (
                      <details className="mt-1.5 text-[0.75rem] text-stone-deep">
                        <summary className="cursor-pointer">History ({h.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {h.map((e, i) => (
                            <li key={i}>
                              {formatDay(e.at)} · {EVENT_LABELS[e.action] ?? e.action}
                              {e.amount !== null && e.amount > 0 ? ` · ${inr(e.amount)}` : ""}
                              {e.paymentReference ? ` · ref ${e.paymentReference}` : ""}
                              {e.note ? ` · ${e.note}` : ""}
                              {e.actorName ? ` · ${e.actorName}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2 lg:flex-col lg:items-end">
                    <StatusBadge tone={STATE_LABELS[s.state].tone}>{STATE_LABELS[s.state].label}</StatusBadge>
                    {manage && live && s.state !== "paused" && (
                      <>
                        <ConfirmAction
                          label={s.state === "active" ? "Record renewal" : "Record payment"}
                          title={`Record a payment for ${s.plan.name}`}
                          description={
                            s.state === "active"
                              ? `Extends it by a ${s.billingCycle === "monthly" ? "month" : "year"} from ${s.currentPeriodEnd ? formatDay(s.currentPeriodEnd) : "now"}.`
                              : `Starts a ${s.billingCycle === "monthly" ? "month" : "year"} from today.`
                          }
                          action={recordPaymentAction}
                          hidden={{ ref: s.referenceId }}
                          variant="primary"
                          confirmLabel="Record payment"
                        >
                          <TextInput label="Amount received (₹, with GST)" name="amount" required inputMode="decimal" defaultValue={String(Math.round(s.price * 1.18))} />
                          <TextInput label="Payment reference" name="paymentReference" required placeholder="UTR, UPI or cheque number" />
                        </ConfirmAction>
                        {(s.state === "trialing" || (s.state === "pending_payment" && s.trialEndsAt)) && (
                          <ConfirmAction label="Extend trial" title="Extend the trial" action={extendTrialAction} hidden={{ ref: s.referenceId }} reason={{ required: true, label: "Why (at least 10 characters)" }}>
                            <TextInput label="By (days)" name="days" required inputMode="numeric" defaultValue="7" />
                          </ConfirmAction>
                        )}
                        <ConfirmAction label="Change plan" title="Change their plan" description="The new price applies from their next payment." action={changePlanAction} hidden={{ ref: s.referenceId }}>
                          <Select label="Plan" name="plan" required defaultValue={s.plan.code} options={samePlans.map((p) => ({ value: p.code, label: p.name }))} />
                          <Select label="Billing" name="cycle" required defaultValue={s.billingCycle} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
                          <TextInput label="Reason" name="reason" required placeholder="e.g. Asked to move to yearly" />
                        </ConfirmAction>
                      </>
                    )}
                    {manage && live && <SubscriptionAdminCard sub={s} canManage compact />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/subscriptions" />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {manage && (
          <Card title="Give a plan" description="Complimentary, e.g. for a launch partner. Active straight away for the months you choose, at no charge.">
            <ActionForm action={grantAction} resetOnSuccess className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput label="Subscriber" name="subscriber" required placeholder="USR- or ORG-…" className="font-mono" hint="A person's USR- reference, or a partner's ORG- reference." />
              <Select label="Plan" name="plan" required placeholder="Choose" options={paidPlans.map((p) => ({ value: p.code, label: `${p.name} (${p.audience === "partner" ? "partners" : "people"})` }))} />
              <TextInput label="Months" name="months" required inputMode="numeric" defaultValue="3" />
              <TextInput label="Reason" name="reason" required placeholder="e.g. Launch partner, agreed on the call" />
              <div className="flex justify-end sm:col-span-2">
                <Submit>Give plan</Submit>
              </div>
            </ActionForm>
          </Card>
        )}

        <Card title="Plans" description={editPlans ? "Prices are before GST. A change applies to new subscribers; existing ones keep their price." : "Prices are set by the SuperAdmin."}>
          <ul className="divide-y divide-line-light text-[0.875rem]">
            {plans.map((p) => (
              <li key={p.code} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-stone-deep"> · {p.audience === "partner" ? "Partners" : "People"}</span>
                  {!p.isActive && <span className="ml-2 rounded-full bg-ink/6 px-1.5 py-0.5 text-[0.6875rem]">Off sale</span>}
                  <span className="block text-[0.8125rem] text-stone-deep">
                    {p.free ? "Free" : `${inr(p.monthlyPrice)} a month · ${inr(p.yearlyPrice)} a year · ${p.trialDays ? `${p.trialDays}-day trial` : "no trial"}`}
                  </span>
                </span>
                {editPlans && !p.free && (
                  <ConfirmAction label="Edit" title={`Edit ${p.name}`} description="Existing subscribers keep their price until it changes on renewal." action={updatePlanAction} hidden={{ code: p.code }} password confirmLabel="Save plan">
                    <TextInput label="Monthly price (₹)" name="monthlyPrice" required inputMode="decimal" defaultValue={String(p.monthlyPrice)} />
                    <TextInput label="Yearly price (₹)" name="yearlyPrice" required inputMode="decimal" defaultValue={String(p.yearlyPrice)} />
                    <TextInput label="Free trial (days)" name="trialDays" required inputMode="numeric" defaultValue={String(p.trialDays)} hint="0 for no trial." />
                    <Checkbox label="On sale" name="isActive" defaultChecked={p.isActive} />
                    <TextInput label="Reason" name="reason" required placeholder="e.g. Launch pricing" />
                  </ConfirmAction>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

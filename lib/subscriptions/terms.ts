/**
 * Subscriptions, in rules and words. Shared by server and client. The state a subscription is
 * really in comes from its stored status and its dates: a trial or a paid period that has run out
 * is treated as over straight away, without waiting for anything to update the row.
 */
import type { BillingCycle, PlanAudience, SubscriptionStatus } from "@/lib/vocab";

/** Days a paid subscription keeps working after its period ends, while the payment is chased. */
export const GRACE_DAYS = 7;

export type PlanView = {
  id: string;
  code: string;
  audience: PlanAudience;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  features: { key: string; label: string; detail?: string; comingSoon?: boolean }[];
  limits: Record<string, number>;
  highlighted: boolean;
  isActive: boolean;
  free: boolean;
};

export type EffectiveState =
  | "trialing"
  /** A paid plan chosen and waiting for the first payment; a trial still running keeps working. */
  | "pending_payment"
  | "active"
  /** The paid period has ended and the renewal isn't in yet: still working for GRACE_DAYS. */
  | "past_due"
  /** Switched off for now by the team; the time it's paused is added back on resume. */
  | "paused"
  | "cancelled"
  /** Ended by the team. */
  | "revoked"
  | "expired";

export type SubscriptionDates = {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const DAY = 86_400_000;

export function effectiveState(s: SubscriptionDates, now = Date.now()): EffectiveState {
  const trialEnd = s.trialEndsAt ? Date.parse(s.trialEndsAt) : null;
  const periodEnd = s.currentPeriodEnd ? Date.parse(s.currentPeriodEnd) : null;
  switch (s.status) {
    case "trialing":
      return trialEnd !== null && trialEnd > now ? "trialing" : "expired";
    case "pending_payment":
      return "pending_payment";
    case "active":
      if (periodEnd === null || periodEnd > now) return "active";
      if (s.cancelAtPeriodEnd) return "cancelled";
      return now - periodEnd < GRACE_DAYS * DAY ? "past_due" : "expired";
    default:
      return s.status;
  }
}

/** Whether the plan's features work right now. */
export function isEntitled(s: SubscriptionDates, now = Date.now()): boolean {
  const state = effectiveState(s, now);
  if (state === "trialing" || state === "active" || state === "past_due") return true;
  // Choosing a paid plan during a trial doesn't cut the trial short.
  return state === "pending_payment" && s.trialEndsAt !== null && Date.parse(s.trialEndsAt) > now;
}

/** The end of a paid period that starts at `start`. */
export function periodEnd(start: Date, cycle: BillingCycle): Date {
  const d = new Date(start);
  if (cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
}

export const priceFor = (plan: Pick<PlanView, "monthlyPrice" | "yearlyPrice">, cycle: BillingCycle) => (cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice);

/** What a year costs paid monthly versus yearly, as a whole percentage saved. */
export function yearlySaving(plan: Pick<PlanView, "monthlyPrice" | "yearlyPrice">): number {
  const twelve = plan.monthlyPrice * 12;
  return twelve > 0 ? Math.round(((twelve - plan.yearlyPrice) / twelve) * 100) : 0;
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const STATE_LABELS: Record<EffectiveState, { label: string; tone: "success" | "info" | "warning" | "neutral" | "danger" }> = {
  trialing: { label: "Free trial", tone: "info" },
  pending_payment: { label: "Waiting for payment", tone: "warning" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Payment overdue", tone: "danger" },
  paused: { label: "Paused", tone: "warning" },
  revoked: { label: "Revoked", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Ended", tone: "neutral" },
};

export const CYCLE_LABELS: Record<BillingCycle, { label: string; per: string }> = {
  monthly: { label: "Monthly", per: "a month" },
  yearly: { label: "Yearly", per: "a year" },
};

/** Where each audience manages their subscription. */
export const MANAGE_PATH: Record<PlanAudience, string> = { customer: "/account/subscription", partner: "/subscription" };

/** The cookie that asks for the plans pop-up after a log-in: its value is who it's for. */
export const PLANS_PROMO_COOKIE = "tb_plans_promo";

/** History lines, as the subscriber reads them. */
export const EVENT_LABELS: Record<string, string> = {
  trial_started: "Free trial started",
  plan_chosen: "Plan chosen, waiting for payment",
  change_requested: "Change of plan requested",
  payment_received: "Payment received, plan active",
  renewed: "Renewed",
  cancel_scheduled: "Set to end with the paid period",
  resumed: "Cancellation undone",
  cancelled: "Cancelled",
  cancelled_by_team: "Cancelled by Trustbrick",
  trial_extended: "Trial extended",
  plan_changed: "Plan changed",
  granted: "Given by Trustbrick",
  paused: "Paused by Trustbrick",
  resumed_by_team: "Resumed by Trustbrick",
  auto_resumed: "Resumed (pause ended)",
  revoked: "Revoked by Trustbrick",
  paused_suspension: "Paused: account suspended",
  resumed_suspension: "Resumed: account reinstated",
};

/** Statuses a subscription can still change from (it hasn't ended). */
export const LIVE_STATES = ["trialing", "pending_payment", "active", "past_due", "paused"] as const;

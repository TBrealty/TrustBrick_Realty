/**
 * The money rules for stays paid online, as pure functions. Shared by server and client: the
 * numbers a guest or host sees before acting are the ones the server then records.
 *
 * - The guest pays the booking total; Trustbrick charges nothing on top.
 * - Trustbrick's commission is a percentage of what the guest pays (and keeps paid), with GST on
 *   the commission. The host receives the rest.
 * - A guest who cancels before the policy's cut-off gets everything back; after it, the policy's
 *   late percentage (50% for flexible and moderate, nothing for strict). A host or Trustbrick
 *   cancelling always refunds in full. Payment processing fees are Trustbrick's, never deducted.
 * - Commission is charged only on what's kept: a refund comes out of the host's share and
 *   Trustbrick's in proportion.
 * - The host is paid a day after check-in.
 */
import { CANCELLATION_LABELS } from "@/lib/stays/labels";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** How long a guest has to pay before an instant-book stay's dates are let go. */
export const CHECKOUT_HOLD_MINUTES = 15;
/** Hours after check-in that the host's payout is released. */
export const PAYOUT_DELAY_HOURS = 24;

export type Split = { gross: number; commission: number; gst: number; hostShare: number };

/** What the guest's payment comes to for each side. */
export function splitPayment(gross: number, commissionPercent: number, gstPercent: number): Split {
  const g = round2(Math.max(0, gross));
  const commission = round2((g * commissionPercent) / 100);
  const gst = round2((commission * gstPercent) / 100);
  return { gross: g, commission, gst, hostShare: round2(g - commission - gst) };
}

/** The moment of check-in, India time: the check-in date at the stay's check-in time. */
export function checkInMoment(checkIn: string, checkInTime = "14:00"): Date {
  return new Date(`${checkIn}T${checkInTime.slice(0, 5)}:00+05:30`);
}

export type Policy = keyof typeof CANCELLATION_LABELS;

/** Until when a guest can cancel for a full refund. */
export function cancellationCutoff(policy: Policy, checkIn: string, checkInTime?: string): Date {
  return new Date(checkInMoment(checkIn, checkInTime).getTime() - CANCELLATION_LABELS[policy].freeUntilHours * 3_600_000);
}

/** When the host's payout for a booking is released. */
export function payoutReleaseAt(checkIn: string, checkInTime?: string, delayHours = PAYOUT_DELAY_HOURS): Date {
  return new Date(checkInMoment(checkIn, checkInTime).getTime() + delayHours * 3_600_000);
}

export type RefundKind = "release" | "full" | "partial" | "none";

export type RefundQuote = {
  /** release: the payment was only held (a request), so the hold is let go and nothing was taken. */
  kind: RefundKind;
  refund: number;
  kept: number;
  cutoff: Date;
  /** What the guest is told. */
  summary: string;
};

/**
 * What a cancellation returns to the guest. `paid` is what the guest has paid and not yet had back;
 * `held` says the payment was only authorised (a request the host hasn't accepted).
 */
export function refundFor(i: {
  policy: Policy;
  paid: number;
  held: boolean;
  checkIn: string;
  checkInTime?: string;
  cancelledBy: "guest" | "host" | "admin" | "system";
  now?: Date;
}): RefundQuote {
  const cutoff = cancellationCutoff(i.policy, i.checkIn, i.checkInTime);
  const paid = round2(i.paid);
  if (i.held) return { kind: "release", refund: paid, kept: 0, cutoff, summary: "The hold on your payment is released; nothing was charged." };
  if (i.cancelledBy !== "guest") return { kind: "full", refund: paid, kept: 0, cutoff, summary: "You get everything back." };
  const now = i.now ?? new Date();
  if (now < cutoff) return { kind: "full", refund: paid, kept: 0, cutoff, summary: "You get everything back: you're cancelling before the free-cancellation cut-off." };
  const percent = CANCELLATION_LABELS[i.policy].lateRefundPercent;
  const refund = round2((paid * percent) / 100);
  if (refund <= 0) return { kind: "none", refund: 0, kept: paid, cutoff, summary: "No refund: the free-cancellation cut-off has passed." };
  return { kind: "partial", refund, kept: round2(paid - refund), cutoff, summary: `${percent}% back: the free-cancellation cut-off has passed.` };
}

/**
 * How a refund is shared out. The split is worked out again on what the guest keeps paid; the host's
 * share and Trustbrick's each fall by the difference. E.g. ₹1,700 at 12% + 18% GST, half refunded:
 * ₹850 back, ₹729.64 of it from the host's share and ₹120.36 from Trustbrick's.
 */
export function refundSplit(current: Split, refund: number, commissionPercent: number, gstPercent: number) {
  const amount = round2(Math.min(Math.max(refund, 0), current.gross));
  const after = splitPayment(current.gross - amount, commissionPercent, gstPercent);
  const hostShare = round2(current.hostShare - after.hostShare);
  return { amount, hostShare, platformShare: round2(amount - hostShare), after };
}

export type TimelineStep = { label: string; from: Date | null; to: Date | null; refundPercent: number };

/** The policy as dated steps, for the checkout page and the trip page. */
export function policyTimeline(policy: Policy, checkIn: string, checkInTime?: string, bookedAt = new Date()): TimelineStep[] {
  const cutoff = cancellationCutoff(policy, checkIn, checkInTime);
  const start = checkInMoment(checkIn, checkInTime);
  const late = CANCELLATION_LABELS[policy].lateRefundPercent;
  const steps: TimelineStep[] = [];
  if (bookedAt < cutoff) steps.push({ label: "Full refund", from: null, to: cutoff, refundPercent: 100 });
  steps.push({ label: late > 0 ? `${late}% refund` : "No refund", from: bookedAt < cutoff ? cutoff : null, to: start, refundPercent: late });
  return steps;
}

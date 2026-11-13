import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { type Policy, type RefundKind, payoutReleaseAt, refundFor, refundSplit, round2, splitPayment } from "@/lib/payments/rules";
import type { BookingStatus } from "@/lib/vocab";

/**
 * The money side of a booking paid online, inside the booking's own transaction: which payment
 * pays for it, the host's payout, and refunds. Nothing here calls the payment provider; that
 * happens after commit (lib/services/stays/payments.ts, settlePayments), driven by these rows.
 */

type Row = Record<string, unknown>;

export type BookingPayment = {
  id: string;
  referenceId: string;
  status: "authorized" | "captured" | "partially_refunded" | "refunded";
  amount: number;
  refundedAmount: number;
  commissionPercent: number;
  gstPercent: number;
  hostShare: number;
  vendorId: string | null;
};

/** The payment that pays for a booking (not an unwanted second one), if any. */
export async function bookingPayment(tx: Tx, bookingId: string, lock = false): Promise<BookingPayment | null> {
  const { rows } = await tx.execute(sql`
    SELECT id, reference_id, status, amount, refunded_amount, commission_percent, gst_percent, host_share, vendor_id
      FROM finance.payments
     WHERE booking_id = ${bookingId} AND status IN ('authorized', 'captured', 'partially_refunded', 'refunded') AND NOT unwanted
     ORDER BY created_at DESC LIMIT 1 ${lock ? sql`FOR UPDATE` : sql``}`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    status: r.status as BookingPayment["status"],
    amount: Number(r.amount),
    refundedAmount: Number(r.refunded_amount),
    commissionPercent: Number(r.commission_percent),
    gstPercent: Number(r.gst_percent),
    hostShare: Number(r.host_share),
    vendorId: (r.vendor_id as string) ?? null,
  };
}

/** The host's payout for a confirmed booking: what's kept, less commission and GST, a day after check-in. */
export async function schedulePayout(tx: Tx, bookingId: string, payment: BookingPayment) {
  const { rows } = await tx.execute(sql`
    SELECT organization_id, to_char(lower(dates), 'YYYY-MM-DD') AS check_in, to_char(check_in_time, 'HH24:MI') AS check_in_time
      FROM stays.bookings WHERE id = ${bookingId}`);
  const b = rows[0] as Row;
  const split = splitPayment(payment.amount - payment.refundedAmount, payment.commissionPercent, payment.gstPercent);
  await tx.execute(sql`
    INSERT INTO finance.payouts (id, booking_id, payment_id, organization_id, gross, commission, gst, amount, status, release_at)
    VALUES (gen_random_uuid(), ${bookingId}, ${payment.id}, ${String(b.organization_id)}, ${split.gross}, ${split.commission}, ${split.gst}, ${split.hostShare},
            ${split.gross > 0 ? "scheduled" : "cancelled"}, ${payoutReleaseAt(String(b.check_in), String(b.check_in_time)).toISOString()}::timestamptz)
    ON CONFLICT (booking_id) DO NOTHING`);
}

export type RecordedRefund = { referenceId: string; amount: number; hostShare: number; platformShare: number };

/**
 * Records money going back to the guest: the refund (sent to the provider after commit), the
 * payment's refunded total, and the host's payout, recalculated on what the guest keeps paid.
 */
export async function recordRefund(
  tx: Tx,
  i: { payment: BookingPayment; bookingId: string; amount: number; initiatedBy: "guest" | "host" | "admin" | "system"; reason: string; actorUserId: string | null },
): Promise<RecordedRefund | null> {
  const p = i.payment;
  const paidLeft = round2(p.amount - p.refundedAmount);
  const amount = round2(Math.min(i.amount, paidLeft));
  if (amount <= 0) return null;
  const payout = await tx.execute(sql`SELECT id, status, gross, commission, gst, amount FROM finance.payouts WHERE booking_id = ${i.bookingId} FOR UPDATE`);
  const po = payout.rows[0] as Row | undefined;
  const current = po
    ? { gross: Number(po.gross), commission: Number(po.commission), gst: Number(po.gst), hostShare: Number(po.amount) }
    : splitPayment(paidLeft, p.commissionPercent, p.gstPercent);
  const split = refundSplit(current, amount, p.commissionPercent, p.gstPercent);
  const created = await tx.execute(sql`
    INSERT INTO finance.refunds (id, payment_id, booking_id, amount, host_share, platform_share, reason, initiated_by, actor_user_id)
    VALUES (gen_random_uuid(), ${p.id}, ${i.bookingId}, ${split.amount}, ${split.hostShare}, ${split.platformShare}, ${i.reason}, ${i.initiatedBy}, ${i.actorUserId})
    RETURNING reference_id`);
  const refunded = round2(p.refundedAmount + split.amount);
  await tx.execute(sql`
    UPDATE finance.payments SET refunded_amount = ${refunded}, status = ${refunded >= p.amount ? "refunded" : "partially_refunded"}, updated_at = now()
     WHERE id = ${p.id}`);
  if (po && ["scheduled", "on_hold", "failed"].includes(String(po.status))) {
    const after = split.after;
    await tx.execute(sql`
      UPDATE finance.payouts SET gross = ${after.gross}, commission = ${after.commission}, gst = ${after.gst}, amount = ${after.hostShare},
             status = ${after.gross > 0 ? sql`status` : sql`'cancelled'`}, updated_at = now()
       WHERE id = ${String(po.id)}`);
  }
  return { referenceId: String((created.rows[0] as Row).reference_id), amount: split.amount, hostShare: split.hostShare, platformShare: split.platformShare };
}

export type MoneyOutcome = { refund: { kind: RefundKind; amount: number; referenceId: string | null } | null };

/**
 * What a booking's change of status does to its money. Accepting schedules the host's payout
 * (the held payment is taken after commit). Declining, expiring or cancelling a request releases
 * the hold. Cancelling a confirmed booking refunds under the policy: everything when the host or
 * Trustbrick cancels, by the dates when the guest does.
 */
export async function moneyOnTransition(
  tx: Tx,
  i: {
    bookingId: string;
    from?: BookingStatus;
    to: BookingStatus;
    cancelledBy: string | null;
    policy: Policy;
    checkIn: string;
    checkInTime: string;
    actorUserId: string | null;
  },
): Promise<MoneyOutcome> {
  const payment = await bookingPayment(tx, i.bookingId, true);
  if (!payment) return { refund: null };
  if (i.to === "confirmed") {
    await schedulePayout(tx, i.bookingId, payment);
    return { refund: null };
  }
  if (!["declined", "expired", "cancelled"].includes(i.to)) return { refund: null };
  // Only held: released after commit (settlePayments voids holds on bookings that ended).
  if (payment.status === "authorized") return { refund: { kind: "release", amount: payment.amount, referenceId: null } };

  const paidLeft = round2(payment.amount - payment.refundedAmount);
  const payout = await tx.execute(sql`SELECT 1 FROM finance.payouts WHERE booking_id = ${i.bookingId}`);
  // A request (no payout yet) that was paid outright gets everything back; so does any booking the guest didn't cancel.
  const by = (i.cancelledBy ?? (i.to === "declined" ? "host" : "system")) as "guest" | "host" | "admin" | "system";
  const quote =
    payout.rows.length === 0 || i.to !== "cancelled"
      ? { kind: "full" as const, refund: paidLeft }
      : refundFor({ policy: i.policy, paid: paidLeft, held: false, checkIn: i.checkIn, checkInTime: i.checkInTime, cancelledBy: by });
  if (quote.refund <= 0) return { refund: { kind: "none", amount: 0, referenceId: null } };
  const reason =
    by === "guest"
      ? quote.kind === "full"
        ? "Cancelled by the guest before the free-cancellation cut-off."
        : "Cancelled by the guest after the free-cancellation cut-off."
      : by === "host"
        ? i.to === "declined"
          ? "The host declined the request."
          : "Cancelled by the host."
        : by === "admin"
          ? "Cancelled by Trustbrick."
          : "The booking ended before it began.";
  const refund = await recordRefund(tx, { payment, bookingId: i.bookingId, amount: quote.refund, initiatedBy: by, reason, actorUserId: i.actorUserId });
  return { refund: refund ? { kind: quote.kind, amount: refund.amount, referenceId: refund.referenceId } : null };
}

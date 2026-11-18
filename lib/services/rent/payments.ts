import "server-only";
import { sql } from "drizzle-orm";
import { type DbOrTx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { noticeMessage } from "@/lib/email/templates";
import { AppError, conflict, notFound } from "@/lib/errors";
import { formatDay, formatMoney } from "@/lib/format";
import { log } from "@/lib/log";
import { driverFor, paymentDriver } from "@/lib/payments";
import { type Checkout, type ProviderEvent, ProviderError } from "@/lib/payments/driver";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import type { RentChargeStatus, RentPaymentStatus, SettlementStatus } from "@/lib/vocab";
import { notify, notifyPermissionHolders } from "../notifications";
import { type Row, TODAY_IST, absoluteUrl, day, iso, num, rentOnline } from "./common";
import { endDueTenancies } from "./tenancies";
import { refreshSettlements } from "./settlement-holds";

/**
 * Rent paid online (lib/db/schema/rent.ts). Trustbrick collects it as a payment aggregator:
 *
 *   charge (due) ──tenant pays──▶ payment (paid) ──▶ settlement ──back office pays──▶ landlord's bank
 *
 * - Each month's rent is a charge, created a week before it's due while "Collect rent online" is on.
 * - A payment counts only on the provider's word (a signed webhook, or its API when we ask). A
 *   second payment for a charge already paid is refunded in full, automatically.
 * - Each paid rent becomes a settlement owed to the landlord: on hold until their ownership is
 *   approved and their bank account verified (and 48 hours after it changes), then due from the
 *   back office by the next working day. The tenant pays nothing extra: Trustbrick bears the fees.
 *
 * Provider calls never happen inside a database transaction: the transaction records what's owed
 * (a refund) and the rent job carries it out, retrying until it succeeds.
 */

const MAX_ATTEMPTS = 6;
/** How long an unpaid order stays open at the provider. */
const ORDER_MINUTES = 30;
/** A charge is created this many days before it's due. */
const LEAD_DAYS = 7;
/** Rent that fell due longer ago than this, before collection was on, isn't collected online. */
const LOOKBACK_DAYS = 25;

export const CHARGE_STATUS_LABELS: Record<RentChargeStatus, string> = { due: "Due", paid: "Paid", cancelled: "Cancelled" };
export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  on_hold: "On hold",
  ready: "To be paid",
  paid: "Paid to the bank",
  failed: "Returned by the bank",
  cancelled: "Cancelled",
};

/** Our refund ID for a rent payment: one full refund each, so it can't be sent twice. */
export const refundIdFor = (paymentReferenceId: string) => `RRF-${paymentReferenceId.slice(4)}`;
export const isRentOrder = (orderId: string | undefined) => Boolean(orderId?.startsWith("RPY-"));
export const isRentRefund = (refundId: string | undefined) => Boolean(refundId?.startsWith("RRF-"));

// ── The tenant ───────────────────────────────────────────────────────────────

export type ChargeView = {
  referenceId: string;
  dueDate: string;
  amount: number;
  status: RentChargeStatus;
  overdue: boolean;
  paidAt: string | null;
  payment: { referenceId: string; method: string | null; paidAt: string } | null;
};

const chargeView = (r: Row): ChargeView => ({
  referenceId: String(r.reference_id),
  dueDate: day(r.due_date)!,
  amount: num(r.amount),
  status: r.status as RentChargeStatus,
  overdue: r.status === "due" && Boolean(r.overdue),
  paidAt: iso(r.paid_at),
  payment: r.payment_ref ? { referenceId: String(r.payment_ref), method: (r.payment_method as string) ?? null, paidAt: iso(r.payment_paid_at)! } : null,
});

/** A tenancy's rent: what's due, then what's been paid, newest first. */
export async function chargesForTenancy(tenancyReferenceId: string, tx: DbOrTx = db): Promise<ChargeView[]> {
  const { rows } = await tx.execute(sql`
    SELECT c.reference_id, c.due_date, c.amount, c.status, c.paid_at, c.due_date < ${TODAY_IST} AS overdue,
           p.reference_id AS payment_ref, p.method AS payment_method, p.paid_at AS payment_paid_at
      FROM rent.charges c JOIN rent.tenancies t ON t.id = c.tenancy_id
      LEFT JOIN rent.payments p ON p.charge_id = c.id AND p.status IN ('paid', 'refunded') AND NOT p.unwanted
     WHERE t.reference_id = ${tenancyReferenceId} AND c.status <> 'cancelled'
     ORDER BY (c.status = 'due') DESC, c.due_date DESC
     LIMIT 36`);
  return (rows as Row[]).map(chargeView);
}

export type CheckoutStart = { paymentReferenceId: string; amount: number; checkout: Checkout };

/** The tenant presses Pay on a month's rent: our record first, then the provider's order. */
export async function startRentCheckout(tenant: { userId: string; email: string; name: string }, chargeReferenceId: string): Promise<CheckoutStart> {
  const ref = normalizeReferenceId(chargeReferenceId);
  if (!isReferenceId(ref, "RNT")) throw notFound();
  if (!(await rentOnline())) throw conflict("Paying rent online isn't available right now.");
  const driver = paymentDriver();
  if (!driver) throw conflict("Paying rent online isn't available right now.");
  const prepared = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT c.id, c.reference_id, c.status, c.amount, c.due_date, t.id AS tenancy_id, t.landlord_user_id, t.tenant_phone, u.phone AS user_phone,
             coalesce(l.title, 'Rent') AS title
        FROM rent.charges c JOIN rent.tenancies t ON t.id = c.tenancy_id JOIN identity.users u ON u.id = t.tenant_user_id
        LEFT JOIN marketplace.listings l ON l.id = t.listing_id
       WHERE c.reference_id = ${ref} AND t.tenant_user_id = ${tenant.userId} FOR UPDATE OF c`);
    const c = rows[0] as Row | undefined;
    if (!c) throw notFound();
    if (c.status !== "due") throw conflict(c.status === "paid" ? "This rent is already paid." : "This rent was cancelled.");
    // A payment the provider is still deciding on: don't open a second one for the same month.
    const pending = await tx.execute(sql`
      SELECT 1 FROM rent.payments WHERE charge_id = ${String(c.id)} AND status = 'created' AND created_at > now() - interval '2 minutes'`);
    if (pending.rows.length) throw conflict("A payment for this rent was just started. Wait a minute to see if it went through.");
    const created = await tx.execute(sql`
      INSERT INTO rent.payments (id, reference_id, provider_order_id, charge_id, tenancy_id, tenant_user_id, landlord_user_id, amount, provider)
      SELECT gen_random_uuid(), r, r, ${String(c.id)}, ${String(c.tenancy_id)}, ${tenant.userId}, ${String(c.landlord_user_id)}, ${num(c.amount)}, ${driver.name}
        FROM (SELECT platform.gen_reference_id('RPY') AS r) x
      RETURNING id, reference_id`);
    const p = created.rows[0] as Row;
    return {
      paymentId: String(p.id),
      paymentRef: String(p.reference_id),
      amount: num(c.amount),
      phone: String(c.user_phone ?? c.tenant_phone ?? "9999999999"),
      note: `Rent for ${c.title}, due ${formatDay(day(c.due_date)!)} (${c.reference_id})`,
    };
  });

  let order: { providerOrderId: string; sessionId: string };
  try {
    order = await driver.createOrder({
      orderId: prepared.paymentRef,
      amount: prepared.amount,
      capture: "auto",
      customer: { id: tenant.userId, name: tenant.name, email: tenant.email, phone: prepared.phone },
      returnUrl: absoluteUrl(`/pay/return?payment=${prepared.paymentRef}`),
      notifyUrl: absoluteUrl(`/api/webhooks/payments/${driver.name}`),
      expiresAt: new Date(Date.now() + ORDER_MINUTES * 60_000),
      split: null,
      note: prepared.note,
    });
  } catch (e) {
    log.error("rent.order_failed", { payment: prepared.paymentRef, error: String(e) });
    await db.execute(sql`UPDATE rent.payments SET status = 'failed', failure_reason = 'The payment provider didn''t open the order.', failed_at = now(), updated_at = now() WHERE id = ${prepared.paymentId}`);
    throw new AppError("CONFLICT", e instanceof ProviderError ? e.publicMessage : "We couldn't open the payment window. Try again in a minute.");
  }
  await db.execute(sql`UPDATE rent.payments SET session_id = ${order.sessionId}, updated_at = now() WHERE id = ${prepared.paymentId}`);
  return { paymentReferenceId: prepared.paymentRef, amount: prepared.amount, checkout: driver.checkout(order.providerOrderId, order.sessionId) };
}

export type RentCheckoutStatus = {
  /** confirming: no word from the provider yet. paid: done. failed: try again. returned: paid twice or too late, so refunded. */
  state: "confirming" | "paid" | "failed" | "returned";
  paymentReferenceId: string;
  chargeReferenceId: string;
  title: string;
  dueDate: string;
  amount: number;
  method: string | null;
  failureReason: string | null;
  landlordName: string;
};

/**
 * The result screen's view of one rent payment. While there's no word yet, it asks the provider
 * (server to server, as trustworthy as a webhook) and applies what it hears.
 */
export async function rentCheckoutStatus(userId: string, paymentReferenceId: string, askProvider = true): Promise<RentCheckoutStatus> {
  const ref = normalizeReferenceId(paymentReferenceId);
  if (!isReferenceId(ref, "RPY")) throw notFound();
  const load = async () => {
    const { rows } = await db.execute(sql`
      SELECT p.reference_id, p.status, p.amount, p.method, p.failure_reason, p.provider, p.provider_order_id, p.unwanted, c.reference_id AS charge_ref, c.due_date,
             coalesce(l.title, 'Rent') AS title, lu.name AS landlord_name
        FROM rent.payments p JOIN rent.charges c ON c.id = p.charge_id JOIN rent.tenancies t ON t.id = p.tenancy_id
        LEFT JOIN marketplace.listings l ON l.id = t.listing_id JOIN identity.users lu ON lu.id = p.landlord_user_id
       WHERE p.reference_id = ${ref} AND p.tenant_user_id = ${userId}`);
    return rows[0] as Row | undefined;
  };
  let r = await load();
  if (!r) throw notFound();
  if (askProvider && r.status === "created") {
    const driver = driverFor(r.provider as "fake" | "cashfree");
    if (driver) {
      try {
        const order = await driver.getOrder(String(r.provider_order_id));
        if (order.state === "paid") {
          await applyRentEvent({ eventId: `poll_${ref}`, type: "ORDER_STATUS", kind: "payment_succeeded", orderId: String(r.provider_order_id), paymentId: order.paymentId ?? undefined, method: order.method, amount: order.amount });
          r = (await load())!;
        }
      } catch (e) {
        log.warn("rent.poll_failed", { payment: ref, error: String(e) });
      }
    }
  }
  const status = r.status as RentPaymentStatus;
  return {
    state: r.unwanted ? "returned" : status === "paid" ? "paid" : status === "failed" ? "failed" : status === "refunded" ? "returned" : "confirming",
    paymentReferenceId: String(r.reference_id),
    chargeReferenceId: String(r.charge_ref),
    title: String(r.title),
    dueDate: day(r.due_date)!,
    amount: num(r.amount),
    method: (r.method as string) ?? null,
    failureReason: (r.failure_reason as string) ?? null,
    landlordName: String(r.landlord_name),
  };
}

// ── Provider events ──────────────────────────────────────────────────────────

/** Applies one fact from the provider about a rent payment or refund. Safe to apply twice. */
export async function applyRentEvent(event: ProviderEvent) {
  switch (event.kind) {
    case "payment_succeeded":
      return rentPaymentSucceeded(event);
    case "payment_authorized":
      // Rent is taken at once, never held: a hold here is unexpected, so a person looks.
      if (event.orderId) {
        await db.execute(sql`UPDATE rent.payments SET needs_attention = true, attention_note = 'The provider reported a held payment for rent.', updated_at = now() WHERE provider_order_id = ${event.orderId}`);
      }
      return;
    case "payment_failed":
    case "payment_dropped":
      if (!event.orderId) return;
      await db.execute(sql`
        UPDATE rent.payments SET status = 'failed', failure_reason = ${event.failureReason ?? "The payment didn't go through."}, method = coalesce(${event.method ?? null}, method),
               failed_at = now(), updated_at = now()
         WHERE provider_order_id = ${event.orderId} AND status = 'created'`);
      return;
    case "refund_processed":
    case "refund_failed":
      return rentRefundResult(event);
    default:
      return;
  }
}

async function rentPaymentSucceeded(event: ProviderEvent) {
  if (!event.orderId) return;
  const outcome = await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT p.id, p.reference_id, p.status, p.amount, p.charge_id, p.tenant_user_id, p.landlord_user_id, t.reference_id AS tenancy_ref, t.created_by,
             coalesce(l.title, 'the property') AS title, pr.reference_id AS property_ref
        FROM rent.payments p JOIN rent.tenancies t ON t.id = p.tenancy_id JOIN real_estate.properties pr ON pr.id = t.property_id
        LEFT JOIN marketplace.listings l ON l.id = t.listing_id
       WHERE p.provider_order_id = ${event.orderId!} FOR UPDATE OF p`);
    const p = found.rows[0] as Row | undefined;
    if (!p) throw new Error(`no rent payment for order ${event.orderId}`);
    if (!["created", "failed"].includes(String(p.status))) return null; // Already applied.
    if (event.amount !== undefined && Math.abs(event.amount - num(p.amount)) > 0.009) throw new Error(`amount mismatch on ${p.reference_id}: ${event.amount} vs ${p.amount}`);
    const paymentId = String(p.id);
    const charge = (await tx.execute(sql`SELECT id, reference_id, status, due_date FROM rent.charges WHERE id = ${String(p.charge_id)} FOR UPDATE`)).rows[0] as Row;
    const another = await tx.execute(sql`SELECT 1 FROM rent.payments WHERE charge_id = ${String(charge.id)} AND id <> ${paymentId} AND status = 'paid' AND NOT unwanted`);
    const accepted = charge.status === "due" && another.rows.length === 0;
    const reason = another.rows.length || charge.status === "paid" ? "This month's rent was already paid; this payment is returned in full." : "This rent was cancelled before your payment arrived; it's returned in full.";
    await tx.execute(sql`
      UPDATE rent.payments SET status = 'paid', paid_at = now(), provider_payment_id = ${event.paymentId ?? null}, method = ${event.method ?? null}, failure_reason = NULL,
             unwanted = ${!accepted}, ${accepted ? sql`` : sql`refund_status = 'pending', refund_reason = ${reason},`} updated_at = now()
       WHERE id = ${paymentId}`);
    const dueText = formatDay(day(charge.due_date)!);
    if (!accepted) {
      await notify(tx, [String(p.tenant_user_id)], { type: "rent_paid", title: `Your payment ${p.reference_id} is being returned`, body: reason, link: "/account/rent" });
      return { paymentId, refund: true, receipt: null };
    }
    await tx.execute(sql`UPDATE rent.charges SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = ${String(charge.id)}`);
    const settlement = await tx.execute(sql`
      INSERT INTO rent.settlements (id, payment_id, landlord_user_id, amount) VALUES (gen_random_uuid(), ${paymentId}, ${String(p.landlord_user_id)}, ${num(p.amount)}) RETURNING id`);
    await refreshSettlements(tx, { settlementId: String((settlement.rows[0] as Row).id) });
    await notify(tx, [String(p.tenant_user_id)], { type: "rent_paid", title: `Rent paid: ${formatMoney(num(p.amount))} for ${p.title}`, body: `For the rent due ${dueText}. Your receipt is ready.`, link: `/account/rent/receipts/${p.reference_id}` });
    await notify(tx, [String(p.landlord_user_id)], {
      type: "rent_paid",
      title: `Rent received: ${formatMoney(num(p.amount))} for ${p.title}`,
      body: "Trustbrick will pay it into your bank account.",
      link: `/my-properties/${p.property_ref}`,
    });
    const email = (await tx.execute(sql`SELECT email, name FROM identity.users WHERE id = ${String(p.tenant_user_id)}`)).rows[0] as Row;
    return {
      paymentId,
      refund: false,
      receipt: { to: String(email.email), name: String(email.name), ref: String(p.reference_id), amount: num(p.amount), title: String(p.title), due: dueText, method: event.method ?? null },
    };
  });
  if (!outcome) return;
  if (outcome.receipt) {
    const r = outcome.receipt;
    try {
      await sendEmail(
        noticeMessage(r.to, {
          subject: `Rent paid: ${formatMoney(r.amount)} for ${r.title}`,
          heading: "Your rent is paid",
          lines: [`Hi ${r.name.split(" ")[0]},`, `We received ${formatMoney(r.amount)} for the rent of ${r.title} due ${r.due}${r.method ? `, paid by ${r.method.toUpperCase()}` : ""}.`, `Payment ${r.ref}. Your receipt is in your account.`],
          action: { label: "View your receipt", url: absoluteUrl(`/account/rent/receipts/${r.ref}`) },
        }),
      );
    } catch (e) {
      log.warn("rent.receipt_email_failed", { error: String(e) });
    }
  }
  if (outcome.refund) await sendRentRefunds({ paymentId: outcome.paymentId });
}

async function rentRefundResult(event: ProviderEvent) {
  if (!event.refundId) return;
  const paymentRef = `RPY-${event.refundId.slice(4)}`;
  if (event.kind === "refund_processed") {
    await db.execute(sql`
      UPDATE rent.payments SET refund_status = 'processed', status = 'refunded', refunded_at = coalesce(refunded_at, now()),
             provider_refund_id = coalesce(${event.providerRefundId ?? null}, provider_refund_id), updated_at = now()
       WHERE reference_id = ${paymentRef} AND refund_status IS DISTINCT FROM 'processed'`);
  } else {
    await db.execute(sql`
      UPDATE rent.payments SET refund_status = 'failed', needs_attention = true, attention_note = ${event.failureReason ?? "The provider couldn't process the refund."}, updated_at = now()
       WHERE reference_id = ${paymentRef}`);
  }
}

/** Sends refunds that are owed (an unwanted payment, or one a person refunded). Retried by the job. */
export async function sendRentRefunds(filter: { paymentId?: string } = {}): Promise<{ sent: number; failed: number }> {
  const summary = { sent: 0, failed: 0 };
  const { rows } = await db.execute(sql`
    SELECT id FROM rent.payments WHERE refund_status = 'pending' AND status = 'paid' AND refund_attempts < ${MAX_ATTEMPTS} ${filter.paymentId ? sql`AND id = ${filter.paymentId}` : sql``}
     ORDER BY updated_at LIMIT 50`);
  for (const { id } of rows as { id: string }[]) {
    // Locked for the provider call, so this job and a person's action never send it twice.
    const claimed = await db.execute(sql`
      UPDATE rent.payments SET refund_attempts = refund_attempts + 1, updated_at = now()
       WHERE id = ${id} AND refund_status = 'pending' AND status = 'paid' RETURNING reference_id, provider, provider_order_id, amount, refund_reason, refund_attempts`);
    const p = claimed.rows[0] as Row | undefined;
    if (!p) continue;
    const driver = driverFor(p.provider as "fake" | "cashfree");
    if (!driver) continue;
    try {
      const r = await driver.refund({ providerOrderId: String(p.provider_order_id), refundId: refundIdFor(String(p.reference_id)), amount: num(p.amount), vendorShare: 0, vendorId: null, reason: String(p.refund_reason ?? "Refund") });
      await db.execute(sql`
        UPDATE rent.payments SET provider_refund_id = ${r.providerRefundId},
               ${r.state === "processed" ? sql`refund_status = 'processed', status = 'refunded', refunded_at = now(),` : sql`refund_status = 'pending',`} updated_at = now()
         WHERE id = ${id}`);
      // A pending refund at the provider settles by webhook; don't ask again.
      if (r.state === "pending") await db.execute(sql`UPDATE rent.payments SET refund_attempts = ${MAX_ATTEMPTS} WHERE id = ${id}`);
      summary.sent++;
    } catch (e) {
      summary.failed++;
      log.warn("rent.refund_failed", { payment: p.reference_id, error: String(e) });
      if (Number(p.refund_attempts) >= MAX_ATTEMPTS) {
        await db.transaction(async (tx) => {
          await tx.execute(sql`UPDATE rent.payments SET needs_attention = true, attention_note = ${`Refund failed ${MAX_ATTEMPTS} times: ${String(e).slice(0, 300)}`}, updated_at = now() WHERE id = ${id}`);
          await notifyPermissionHolders(tx, "rent.manage", { type: "payments_attention", title: `A rent refund (${p.reference_id}) keeps failing`, link: "/rent-collection?tab=payments" });
        });
      }
    }
  }
  return summary;
}

// ── The rent job ─────────────────────────────────────────────────────────────

/** Creates each month's charge a week before it's due, for active tenancies. */
export async function createDueCharges(tx: DbOrTx = db): Promise<number> {
  const { rows } = await tx.execute(sql`
    INSERT INTO rent.charges (id, tenancy_id, due_date, amount)
    SELECT gen_random_uuid(), t.id, d::date, t.monthly_rent
      FROM rent.tenancies t
      CROSS JOIN LATERAL generate_series(t.first_due_date::timestamp, (${TODAY_IST} + ${LEAD_DAYS}::int)::timestamp, interval '1 month') d
     WHERE t.status = 'active' AND (t.end_date IS NULL OR d::date < t.end_date) AND d::date >= ${TODAY_IST} - ${LOOKBACK_DAYS}::int
    ON CONFLICT (tenancy_id, due_date) DO NOTHING
    RETURNING id`);
  return rows.length;
}

type Reminder = { kind: "before" | "due" | "late"; chargeRef: string; amount: number; dueDate: string; tenantId: string; tenantEmail: string; tenantName: string; landlordId: string; title: string };

/**
 * Reminds tenants of rent: three days before it's due, on the day, and three days late (when the
 * landlord is told too). Each is sent once: the row is claimed before anything goes out.
 */
export async function sendRentReminders(): Promise<number> {
  const reminders: Reminder[] = [];
  for (const kind of ["before", "due", "late"] as const) {
    const column = kind === "before" ? sql`reminded_before_at` : kind === "due" ? sql`reminded_due_at` : sql`reminded_late_at`;
    const window =
      kind === "before"
        ? sql`c.due_date - 3 <= ${TODAY_IST} AND c.due_date > ${TODAY_IST}`
        : kind === "due"
          ? sql`c.due_date <= ${TODAY_IST} AND c.due_date > ${TODAY_IST} - 3`
          : sql`c.due_date <= ${TODAY_IST} - 3`;
    const { rows } = await db.execute(sql`
      UPDATE rent.charges c SET ${column} = now(), updated_at = now()
        FROM rent.tenancies t JOIN identity.users u ON u.id = t.tenant_user_id
       WHERE t.id = c.tenancy_id AND c.status = 'due' AND c.${column} IS NULL AND ${window}
         AND (${kind === "late"} OR c.reminded_late_at IS NULL)
      RETURNING c.reference_id, c.amount, c.due_date, t.tenant_user_id, t.landlord_user_id, u.email, u.name,
                coalesce((SELECT l.title FROM marketplace.listings l WHERE l.id = t.listing_id), 'your home') AS title`);
    for (const r of rows as Row[]) {
      reminders.push({
        kind,
        chargeRef: String(r.reference_id),
        amount: num(r.amount),
        dueDate: day(r.due_date)!,
        tenantId: String(r.tenant_user_id),
        tenantEmail: String(r.email),
        tenantName: String(r.name),
        landlordId: String(r.landlord_user_id),
        title: String(r.title),
      });
    }
  }
  for (const r of reminders) {
    const due = formatDay(r.dueDate);
    const title = r.kind === "before" ? `Rent of ${formatMoney(r.amount)} is due on ${due}` : r.kind === "due" ? `Rent of ${formatMoney(r.amount)} is due today` : `Your rent of ${formatMoney(r.amount)} is overdue`;
    try {
      await db.transaction(async (tx) => {
        await notify(tx, [r.tenantId], { type: "rent_due", title, body: `For ${r.title}. Pay it online in a minute.`, link: "/account/rent" });
        if (r.kind === "late") await notify(tx, [r.landlordId], { type: "rent_due", title: `${r.tenantName}'s rent for ${r.title} is overdue`, body: `${formatMoney(r.amount)}, due ${due}. We've reminded them.` });
      });
      await sendEmail(
        noticeMessage(r.tenantEmail, {
          subject: title,
          heading: r.kind === "late" ? "Your rent is overdue" : "Your rent is due",
          lines: [`Hi ${r.tenantName.split(" ")[0]},`, `The rent for ${r.title}, ${formatMoney(r.amount)}, ${r.kind === "before" ? `is due on ${due}` : r.kind === "due" ? "is due today" : `was due on ${due}`}.`, "Pay it online by UPI, debit card or net banking. There's no fee."],
          action: { label: "Pay your rent", url: absoluteUrl("/account/rent") },
        }),
      );
    } catch (e) {
      log.warn("rent.reminder_failed", { charge: r.chargeRef, error: String(e) });
    }
  }
  return reminders.length;
}

export type RentJobSummary = { charges: number; reminders: number; ended: number; holdsChanged: number; refunds: { sent: number; failed: number } };

/**
 * The rent job, run with the payments job: ends tenancies whose end date came, creates charges and
 * reminders (only while collection is on), refreshes settlement holds, and sends owed refunds.
 */
export async function runRentJob(): Promise<RentJobSummary> {
  const ended = await endDueTenancies();
  const online = await rentOnline();
  const charges = online ? await createDueCharges() : 0;
  const reminders = online ? await sendRentReminders() : 0;
  const holdsChanged = await refreshSettlements(db);
  const refunds = await sendRentRefunds();
  // Cancel orders that were opened and never answered, so they don't look in progress for ever.
  await db.execute(sql`
    UPDATE rent.payments SET status = 'failed', failure_reason = 'The payment wasn''t finished.', failed_at = now(), updated_at = now()
     WHERE status = 'created' AND created_at < now() - interval '1 day'`);
  return { charges, reminders, ended, holdsChanged, refunds };
}

/**
 * Daily: asks the provider about recent rent payments we haven't heard back on. A payment it has
 * but we missed (a lost webhook) is applied; any other difference is flagged for a person.
 */
export async function reconcileRent(days = 3): Promise<{ checked: number; fixed: number; flagged: number }> {
  const out = { checked: 0, fixed: 0, flagged: 0 };
  const { rows } = await db.execute(sql`
    SELECT reference_id, provider, provider_order_id, status, amount FROM rent.payments
     WHERE created_at > now() - ${`${days} days`}::interval AND status IN ('created', 'failed', 'paid') AND NOT needs_attention`);
  for (const p of rows as Row[]) {
    const driver = driverFor(p.provider as "fake" | "cashfree");
    if (!driver) continue;
    out.checked++;
    try {
      const order = await driver.getOrder(String(p.provider_order_id));
      if (order.state === "paid" && p.status !== "paid") {
        await applyRentEvent({ eventId: `reconcile_${p.reference_id}`, type: "RECONCILE", kind: "payment_succeeded", orderId: String(p.provider_order_id), paymentId: order.paymentId ?? undefined, method: order.method, amount: order.amount });
        out.fixed++;
      } else if (p.status === "paid" && order.state !== "paid") {
        await db.execute(sql`UPDATE rent.payments SET needs_attention = true, attention_note = ${`The provider reports this order as ${order.state}.`}, updated_at = now() WHERE reference_id = ${String(p.reference_id)}`);
        out.flagged++;
      }
    } catch (e) {
      log.warn("rent.reconcile_failed", { payment: p.reference_id, error: String(e) });
    }
  }
  return out;
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export type RentReceipt = {
  paymentReferenceId: string;
  chargeReferenceId: string;
  tenancyReferenceId: string;
  amount: number;
  method: string | null;
  paidAt: string;
  dueDate: string;
  periodLabel: string;
  status: RentPaymentStatus;
  refunded: boolean;
  tenantName: string;
  landlordName: string;
  landlordPan: string | null;
  propertyTitle: string;
  propertyAddress: string;
};

/** A rent receipt, for the tenant who paid. Shows the landlord's PAN, which an HRA claim needs. */
export async function rentReceipt(userId: string, paymentReferenceId: string, readPan: (sealed: string) => string): Promise<RentReceipt> {
  const ref = normalizeReferenceId(paymentReferenceId);
  if (!isReferenceId(ref, "RPY")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT p.reference_id, p.amount, p.method, p.paid_at, p.status, p.unwanted, c.reference_id AS charge_ref, c.due_date, t.reference_id AS tenancy_ref, t.tenant_name,
           lu.name AS landlord_name, lp.pan_sealed, coalesce(l.title, 'Home') AS title, concat_ws(', ', nullif(a.line1, ''), nullif(a.line2, ''), pc.name, a.postal_code) AS address
      FROM rent.payments p JOIN rent.charges c ON c.id = p.charge_id JOIN rent.tenancies t ON t.id = p.tenancy_id
      JOIN identity.users lu ON lu.id = p.landlord_user_id LEFT JOIN rent.landlord_profiles lp ON lp.user_id = p.landlord_user_id
      JOIN real_estate.properties pr ON pr.id = t.property_id JOIN geography.addresses a ON a.id = pr.address_id JOIN geography.places pc ON pc.id = a.place_id
      LEFT JOIN marketplace.listings l ON l.id = t.listing_id
     WHERE p.reference_id = ${ref} AND p.tenant_user_id = ${userId} AND p.status IN ('paid', 'refunded') AND NOT p.unwanted`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const due = day(r.due_date)!;
  let pan: string | null = null;
  if (r.pan_sealed) {
    try {
      pan = readPan(String(r.pan_sealed));
    } catch {
      pan = null;
    }
  }
  return {
    paymentReferenceId: String(r.reference_id),
    chargeReferenceId: String(r.charge_ref),
    tenancyReferenceId: String(r.tenancy_ref),
    amount: num(r.amount),
    method: (r.method as string) ?? null,
    paidAt: iso(r.paid_at)!,
    dueDate: due,
    periodLabel: new Date(`${due}T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
    status: r.status as RentPaymentStatus,
    refunded: r.status === "refunded",
    tenantName: String(r.tenant_name),
    landlordName: String(r.landlord_name),
    landlordPan: pan,
    propertyTitle: String(r.title),
    propertyAddress: String(r.address),
  };
}

// ── The landlord ─────────────────────────────────────────────────────────────

export type SettlementView = {
  referenceId: string;
  paymentReferenceId: string;
  amount: number;
  status: SettlementStatus;
  statusLabel: string;
  holdReason: string | null;
  dueBy: string | null;
  paidAt: string | null;
  utr: string | null;
  paidTo: string | null;
  rentDue: string;
  tenantName: string;
  title: string;
  propertyReferenceId: string;
  createdAt: string;
};

export const toSettlementView = (r: Row): SettlementView => ({
  referenceId: String(r.reference_id),
  paymentReferenceId: String(r.payment_ref),
  amount: num(r.amount),
  status: r.status as SettlementStatus,
  statusLabel: SETTLEMENT_STATUS_LABELS[r.status as SettlementStatus],
  holdReason: (r.hold_reason as string) ?? (r.status === "failed" ? ((r.failure_reason as string) ?? null) : null),
  dueBy: day(r.due_by),
  paidAt: iso(r.paid_at),
  utr: (r.utr as string) ?? null,
  paidTo: r.paid_to_method === "upi" ? "UPI" : r.paid_to_last4 ? `Account ending ${r.paid_to_last4}` : null,
  rentDue: day(r.due_date)!,
  tenantName: String(r.tenant_name),
  title: String(r.title),
  propertyReferenceId: String(r.property_ref),
  createdAt: iso(r.created_at)!,
});

export const SETTLEMENT_COLUMNS = sql`
  s.reference_id, s.amount, s.status, s.hold_reason, s.failure_reason, s.due_by, s.paid_at, s.utr, s.paid_to_method, s.paid_to_last4, s.created_at, s.held_by_admin,
  p.reference_id AS payment_ref, c.due_date, t.tenant_name, pr.reference_id AS property_ref, coalesce(l.title, 'A property') AS title`;
export const SETTLEMENT_JOINS = sql`
  JOIN rent.payments p ON p.id = s.payment_id JOIN rent.charges c ON c.id = p.charge_id JOIN rent.tenancies t ON t.id = p.tenancy_id
  JOIN real_estate.properties pr ON pr.id = t.property_id LEFT JOIN marketplace.listings l ON l.id = t.listing_id`;

/** The landlord's "Rent received": each rent paid, and when it reached their bank. */
export async function landlordSettlements(landlordUserId: string, propertyReferenceId?: string, limit = 100): Promise<SettlementView[]> {
  const { rows } = await db.execute(sql`
    SELECT ${SETTLEMENT_COLUMNS} FROM rent.settlements s ${SETTLEMENT_JOINS}
     WHERE s.landlord_user_id = ${landlordUserId} ${propertyReferenceId ? sql`AND pr.reference_id = ${propertyReferenceId}` : sql``}
     ORDER BY s.created_at DESC LIMIT ${limit}`);
  return (rows as Row[]).map(toSettlementView);
}

export async function landlordRentTotals(landlordUserId: string): Promise<{ paidOut: number; waiting: number; onHold: number }> {
  const { rows } = await db.execute(sql`
    SELECT coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0) AS paid_out,
           coalesce(sum(amount) FILTER (WHERE status IN ('ready', 'failed')), 0) AS waiting,
           coalesce(sum(amount) FILTER (WHERE status = 'on_hold'), 0) AS on_hold
      FROM rent.settlements WHERE landlord_user_id = ${landlordUserId}`);
  const r = rows[0] as Row;
  return { paidOut: num(r.paid_out), waiting: num(r.waiting), onHold: num(r.on_hold) };
}

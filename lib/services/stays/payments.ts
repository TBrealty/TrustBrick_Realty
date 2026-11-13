import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { bookingScope } from "@/lib/authz/scope";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { bookingMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { formatDay, formatMoney } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { driverFor, paymentDriver } from "@/lib/payments";
import { type Checkout, type PaymentDriver, ProviderError, type ProviderEvent } from "@/lib/payments/driver";
import { CHECKOUT_HOLD_MINUTES, type Policy, payoutReleaseAt, policyTimeline, refundFor, round2, splitPayment } from "@/lib/payments/rules";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { CANCELLATION_LABELS, REQUEST_HOURS } from "@/lib/stays/labels";
import type { BookingStatus, PaymentStatus, PayoutAccountStatus, PayoutStatus, RefundStatus } from "@/lib/vocab";
import { type RequestContext, NO_REQUEST, audit } from "../audit";
import { canAcceptTerms, getGstPercent, ratesFor } from "../commission";
import { notify, notifyPermissionHolders } from "../notifications";
import { type Page, pageParams } from "../pagination";
import { announceBooking, bookingSchema, emailNewBooking, expireStaleRequests, isOverlap, paymentsOnline, placeBooking, writeEvent } from "./bookings";
import { type BookingPayment, bookingPayment, recordRefund, schedulePayout } from "./payment-ledger";

/**
 * Online payments for stays (docs: the build plan in lib/payments/driver.ts).
 *
 *   Pay ──▶ pending_payment (15-min hold) ──paid──▶ confirmed (instant) ──▶ payout a day after check-in
 *                                         └─held──▶ requested ──accept──▶ captured, confirmed
 *                                                             └─decline/expire──▶ hold released
 *
 * Money facts come only from the provider: its signed webhooks, or its API when we ask. Provider
 * calls never happen inside a database transaction: the transaction records what is owed (a hold
 * to release, a refund, a payout) and settlePayments() carries it out, straight away and again
 * from the payments job until it succeeds.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => Number(v ?? 0);
const url = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const SUCCESS = sql`('authorized', 'captured', 'partially_refunded', 'refunded')`;
const MAX_ATTEMPTS = 6;

/** Is online payment switched on, with a provider to take it? */
export { paymentsOnline };

// ── Payout accounts ──────────────────────────────────────────────────────────

export type PayoutAccount = {
  method: "bank" | "upi";
  holderName: string;
  bankName: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  upiMasked: string | null;
  status: PayoutAccountStatus;
  statusReason: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};

export async function payoutAccountFor(organizationId: string, tx: DbOrTx = db): Promise<PayoutAccount | null> {
  const { rows } = await tx.execute(sql`SELECT * FROM finance.payout_accounts WHERE organization_id = ${organizationId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    method: r.method as "bank" | "upi",
    holderName: String(r.holder_name),
    bankName: (r.bank_name as string) ?? null,
    accountLast4: (r.account_last4 as string) ?? null,
    ifsc: (r.ifsc as string) ?? null,
    upiMasked: (r.upi_masked as string) ?? null,
    status: r.status as PayoutAccountStatus,
    statusReason: (r.status_reason as string) ?? null,
    verifiedAt: iso(r.verified_at),
    updatedAt: iso(r.updated_at)!,
  };
}

/** Whether a stay's host can take bookings paid online: they need a verified payout account. */
export async function stayTakesOnlineBookings(organizationId: string): Promise<{ online: boolean; ready: boolean }> {
  const online = await paymentsOnline();
  if (!online) return { online: false, ready: true };
  const account = await payoutAccountFor(organizationId);
  return { online: true, ready: account?.status === "active" };
}

/** For a stay's page: are bookings paid online, and is this stay's host ready to be paid? */
export async function stayPaymentState(listingReferenceId: string): Promise<{ online: boolean; ready: boolean }> {
  if (!(await paymentsOnline())) return { online: false, ready: true };
  const { rows } = await db.execute(sql`
    SELECT pa.status FROM marketplace.listings l LEFT JOIN finance.payout_accounts pa ON pa.organization_id = l.organization_id WHERE l.reference_id = ${listingReferenceId}`);
  return { online: true, ready: (rows[0] as Row | undefined)?.status === "active" };
}

/** The first four letters of an IFSC name the bank. The common ones, for showing the account back. */
const BANKS: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  BKID: "Bank of India",
  IOBA: "Indian Overseas Bank",
  YESB: "Yes Bank",
  INDB: "IndusInd Bank",
  FDRL: "Federal Bank",
  IDFB: "IDFC First Bank",
  CBIN: "Central Bank of India",
  MAHB: "Bank of Maharashtra",
  KARB: "Karnataka Bank",
  SIBL: "South Indian Bank",
  RATN: "RBL Bank",
  AUBL: "AU Small Finance Bank",
};

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

export const payoutAccountSchema = z
  .object({
    method: z.enum(["bank", "upi"]).catch("bank"),
    holderName: z.string().trim().min(3, "Enter the name on the account").max(100),
    accountNumber: z.string().optional(),
    confirmAccountNumber: z.string().optional(),
    ifsc: z.string().optional(),
    upi: z.string().optional(),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(PAN, "Enter a PAN like ABCDE1234F"),
    agree: z.preprocess((v) => v === "on" || v === true, z.literal(true, { message: "Agree to how payouts work" })),
  })
  .superRefine((v, ctx) => {
    if (v.method === "bank") {
      const n = (v.accountNumber ?? "").replace(/\s/g, "");
      if (!/^\d{9,18}$/.test(n)) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter an account number of 9 to 18 digits" });
      else if (n !== (v.confirmAccountNumber ?? "").replace(/\s/g, "")) ctx.addIssue({ code: "custom", path: ["confirmAccountNumber"], message: "The account numbers don't match" });
      if (!IFSC.test((v.ifsc ?? "").trim().toUpperCase())) ctx.addIssue({ code: "custom", path: ["ifsc"], message: "Enter an IFSC like HDFC0001234" });
    } else if (!VPA.test((v.upi ?? "").trim())) {
      ctx.addIssue({ code: "custom", path: ["upi"], message: "Enter a UPI ID like name@okhdfcbank" });
    }
  });

/** Who may set the organization's payout account: the same people who accept its commission terms. */
export const canManagePayoutAccount = canAcceptTerms;

const maskVpa = (vpa: string) => {
  const [user, handle] = vpa.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, user.length - 2))}@${handle}`;
};

/**
 * Adds or replaces where the organization's payouts go. The bank details and PAN go to the provider,
 * which verifies them (a ₹1 test deposit, a name match) and holds them; Trustbrick keeps only what
 * it shows back.
 */
export async function savePayoutAccount(actor: Actor, raw: unknown, ctx: RequestContext): Promise<PayoutAccount> {
  if (!canManagePayoutAccount(actor)) throw new AppError("FORBIDDEN", "Only your organization's admin can set where payouts go.");
  const parsed = payoutAccountSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const driver = paymentDriver();
  if (!driver) throw conflict("Payouts aren't set up on this server yet.");
  const limited = await limit([{ key: `payout-account:org:${actor.organization.id}`, rule: RULES.bookingByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  const phoneRow = await db.execute(sql`
    SELECT coalesce((SELECT phone FROM stays.host_profiles WHERE user_id = ${actor.userId}), (SELECT phone FROM orgs.agent_profiles WHERE user_id = ${actor.userId}),
                    (SELECT phone FROM identity.users WHERE id = ${actor.userId})) AS phone`);
  const phone = String((phoneRow.rows[0] as Row | undefined)?.phone ?? "");
  const accountNumber = (v.accountNumber ?? "").replace(/\s/g, "");
  const ifsc = (v.ifsc ?? "").trim().toUpperCase();
  const vpa = (v.upi ?? "").trim();

  let result: Awaited<ReturnType<PaymentDriver["createVendor"]>>;
  try {
    result = await driver.createVendor({
      vendorId: actor.organization.referenceId,
      name: actor.organization.name,
      email: actor.email,
      phone,
      pan: v.pan,
      ...(v.method === "bank" ? { bank: { holder: v.holderName, accountNumber, ifsc } } : { upi: { holder: v.holderName, vpa } }),
    });
  } catch (e) {
    log.error("payments.vendor_failed", { org: actor.organization.referenceId, error: String(e) });
    throw new AppError("CONFLICT", e instanceof ProviderError ? e.publicMessage : "We couldn't reach the payment provider. Try again in a minute.");
  }

  const shown =
    v.method === "bank"
      ? { bankName: BANKS[ifsc.slice(0, 4)] ?? `Bank (${ifsc.slice(0, 4)})`, accountLast4: accountNumber.slice(-4), ifsc, upiMasked: null }
      : { bankName: null, accountLast4: null, ifsc: null, upiMasked: maskVpa(vpa) };
  await db.transaction(async (tx) => {
    const before = await payoutAccountFor(actor.organization.id, tx);
    await tx.execute(sql`
      INSERT INTO finance.payout_accounts (id, organization_id, provider, provider_vendor_id, method, holder_name, bank_name, account_last4, ifsc, upi_masked, status, status_reason, verified_at, created_by)
      VALUES (gen_random_uuid(), ${actor.organization.id}, ${driver.name}, ${result.vendorId}, ${v.method}, ${v.holderName}, ${shown.bankName}, ${shown.accountLast4}, ${shown.ifsc}, ${shown.upiMasked},
              ${result.status}, ${result.reason}, ${result.status === "active" ? sql`now()` : sql`NULL`}, ${actor.userId})
      ON CONFLICT (organization_id) DO UPDATE SET provider = EXCLUDED.provider, provider_vendor_id = EXCLUDED.provider_vendor_id, method = EXCLUDED.method,
             holder_name = EXCLUDED.holder_name, bank_name = EXCLUDED.bank_name, account_last4 = EXCLUDED.account_last4, ifsc = EXCLUDED.ifsc, upi_masked = EXCLUDED.upi_masked,
             status = EXCLUDED.status, status_reason = EXCLUDED.status_reason, verified_at = EXCLUDED.verified_at, created_by = EXCLUDED.created_by, updated_at = now()`);
    await audit(
      tx,
      actor,
      {
        event: "PAYOUT_ACCOUNT_SAVED",
        target: { type: "organization", id: actor.organization.id, referenceId: actor.organization.referenceId },
        organizationId: actor.organization.id,
        before: before ? { method: before.method, bank: before.bankName, last4: before.accountLast4 ?? before.upiMasked, status: before.status } : undefined,
        after: { method: v.method, bank: shown.bankName, last4: shown.accountLast4 ?? shown.upiMasked, status: result.status },
      },
      ctx,
    );
    // Payouts waiting for an account go out on their dates again.
    if (result.status === "active") {
      await tx.execute(sql`
        UPDATE finance.payouts SET status = 'scheduled', hold_reason = NULL, updated_at = now()
         WHERE organization_id = ${actor.organization.id} AND status = 'on_hold' AND hold_reason = ${NO_ACCOUNT}`);
    }
  });
  if (result.status === "active") void settlePayments({ organizationId: actor.organization.id });
  return (await payoutAccountFor(actor.organization.id))!;
}

const NO_ACCOUNT = "Waiting for a verified payout account.";

// ── Checkout ─────────────────────────────────────────────────────────────────

export type CheckoutStart = {
  bookingReferenceId: string;
  paymentReferenceId: string;
  amount: number;
  instantBook: boolean;
  /** Until when an instant-book stay's dates are held for this guest. */
  holdExpiresAt: string | null;
  checkout: Checkout;
};

type GuestRef = { userId: string; email: string };

/**
 * A guest presses Pay: the booking is written as pending_payment (holding an instant-book stay's
 * dates for 15 minutes) and an order is opened at the provider for the server-calculated total.
 */
export async function startCheckout(guest: GuestRef, listingReferenceId: string, raw: unknown, ctx: RequestContext): Promise<CheckoutStart> {
  if (!(await paymentsOnline())) throw conflict("Online payment isn't available right now.");
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const limited = await limit([{ key: `booking:user:${guest.userId}`, rule: RULES.bookingByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  const placed = await db
    .transaction(async (tx) => {
      const p = await placeBooking(tx, guest, listingReferenceId, parsed.data, "online");
      const account = await payoutAccountFor(p.stay.organizationId, tx);
      if (account?.status !== "active") throw conflict("This stay isn't taking bookings yet: the host is still setting up how they're paid.");
      return p;
    })
    .catch((error) => {
      if (isOverlap(error)) throw conflict("Someone is booking those dates right now. Choose different dates, or try again in 15 minutes.");
      throw error;
    });
  void ctx;
  return openOrder(placed.bookingId, guest);
}

/** Pay again for a checkout whose payment failed or was abandoned, while its hold lasts. */
export async function resumeCheckout(guest: GuestRef, bookingReferenceId: string): Promise<CheckoutStart> {
  if (!isReferenceId(bookingReferenceId, "BKG")) throw notFound();
  await expireStaleRequests(db, sql`b.reference_id = ${bookingReferenceId}`);
  const { rows } = await db.execute(sql`SELECT id, status FROM stays.bookings WHERE reference_id = ${bookingReferenceId} AND guest_user_id = ${guest.userId}`);
  const b = rows[0] as Row | undefined;
  if (!b) throw notFound();
  if (b.status !== "pending_payment") throw conflict(b.status === "abandoned" ? "The time to pay ran out, so the dates were let go. Start again from the stay's page." : "This booking is already paid.");
  if (!(await paymentsOnline())) throw conflict("Online payment isn't available right now.");
  return openOrder(String(b.id), guest);
}

/** Opens a payment attempt for a pending booking: our record first, then the provider's order. */
async function openOrder(bookingId: string, guest: GuestRef): Promise<CheckoutStart> {
  const driver = paymentDriver();
  if (!driver) throw conflict("Online payment isn't available right now.");
  const prepared = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT b.id, b.reference_id, b.status, b.total, b.organization_id, b.instant_book, b.expires_at, b.guest_name, b.guest_phone, l.title,
             to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, pa.provider_vendor_id, pa.status AS account_status
        FROM stays.bookings b
        JOIN marketplace.listings l ON l.id = b.listing_id
        LEFT JOIN finance.payout_accounts pa ON pa.organization_id = b.organization_id
       WHERE b.id = ${bookingId} FOR UPDATE OF b`);
    const b = rows[0] as Row;
    if (b.status !== "pending_payment") throw conflict("This booking is already paid.");
    if (b.account_status !== "active") throw conflict("This stay isn't taking bookings yet: the host is still setting up how they're paid.");
    // Every attempt gets the full hold again, so a guest retrying a failed card isn't rushed.
    await tx.execute(sql`UPDATE stays.bookings SET expires_at = greatest(expires_at, now() + ${`${CHECKOUT_HOLD_MINUTES} minutes`}::interval), updated_at = now() WHERE id = ${bookingId}`);
    const percent = (await ratesFor(String(b.organization_id), tx)).stay.percent;
    const gstPercent = await getGstPercent(tx);
    const split = splitPayment(num(b.total), percent, gstPercent);
    const created = await tx.execute(sql`
      INSERT INTO finance.payments (id, reference_id, provider_order_id, booking_id, guest_user_id, organization_id, amount, capture, provider, commission_percent, gst_percent, host_share, vendor_id)
      SELECT gen_random_uuid(), r, r, ${bookingId}, ${guest.userId}, ${String(b.organization_id)}, ${num(b.total)}, ${b.instant_book ? "auto" : "manual"}, ${driver.name},
             ${percent}, ${gstPercent}, ${split.hostShare}, ${String(b.provider_vendor_id)}
        FROM (SELECT platform.gen_reference_id('PAY') AS r) x
      RETURNING id, reference_id, capture`);
    const p = created.rows[0] as Row;
    const expires = await tx.execute(sql`SELECT expires_at FROM stays.bookings WHERE id = ${bookingId}`);
    return {
      paymentId: String(p.id),
      paymentRef: String(p.reference_id),
      capture: p.capture as "auto" | "manual",
      bookingRef: String(b.reference_id),
      amount: num(b.total),
      hostShare: split.hostShare,
      vendorId: String(b.provider_vendor_id),
      instantBook: Boolean(b.instant_book),
      expiresAt: new Date(String((expires.rows[0] as Row).expires_at)),
      name: String(b.guest_name),
      phone: String(b.guest_phone),
      title: String(b.title),
      checkIn: String(b.check_in),
    };
  });

  let order: { providerOrderId: string; sessionId: string };
  try {
    order = await driver.createOrder({
      orderId: prepared.paymentRef,
      amount: prepared.amount,
      capture: prepared.capture,
      customer: { id: guest.userId, name: prepared.name, email: guest.email, phone: prepared.phone },
      returnUrl: url(`/pay/return?payment=${prepared.paymentRef}`),
      notifyUrl: url(`/api/webhooks/payments/${driver.name}`),
      expiresAt: prepared.expiresAt,
      split: { vendorId: prepared.vendorId, amount: prepared.hostShare },
      note: `${prepared.title}, from ${formatDay(prepared.checkIn)} (${prepared.bookingRef})`,
    });
  } catch (e) {
    log.error("payments.order_failed", { payment: prepared.paymentRef, error: String(e) });
    await db.execute(sql`UPDATE finance.payments SET status = 'failed', failure_reason = 'The payment provider didn''t open the order.', failed_at = now(), updated_at = now() WHERE id = ${prepared.paymentId}`);
    throw new AppError("CONFLICT", e instanceof ProviderError ? e.publicMessage : "We couldn't open the payment window. Try again in a minute.");
  }
  await db.execute(sql`UPDATE finance.payments SET session_id = ${order.sessionId}, updated_at = now() WHERE id = ${prepared.paymentId}`);
  return {
    bookingReferenceId: prepared.bookingRef,
    paymentReferenceId: prepared.paymentRef,
    amount: prepared.amount,
    instantBook: prepared.instantBook,
    holdExpiresAt: prepared.instantBook ? prepared.expiresAt.toISOString() : null,
    checkout: driver.checkout(order.providerOrderId, order.sessionId),
  };
}

// ── What the guest sees after paying ─────────────────────────────────────────

export type CheckoutStatus = {
  /** confirming: no word from the provider yet. booked / requested: done. failed: try again while the hold lasts. expired: too late. */
  state: "confirming" | "booked" | "requested" | "failed" | "expired";
  paymentReferenceId: string;
  bookingReferenceId: string;
  listingReferenceId: string;
  title: string;
  amount: number;
  method: string | null;
  failureReason: string | null;
  holdExpiresAt: string | null;
  requestExpiresAt: string | null;
  checkIn: string;
  checkOut: string;
  hostName: string;
};

/**
 * The result screen's view of one payment. While there's no word yet, it asks the provider
 * directly (server to server, so as trustworthy as a webhook) and applies what it hears.
 */
export async function checkoutStatus(userId: string, paymentReferenceId: string, askProvider = true): Promise<CheckoutStatus> {
  const ref = normalizeReferenceId(paymentReferenceId);
  if (!isReferenceId(ref, "PAY")) throw notFound();
  const load = async () => {
    const { rows } = await db.execute(sql`
      SELECT p.reference_id, p.status, p.amount, p.method, p.failure_reason, p.provider, p.provider_order_id, p.created_at, p.unwanted,
             b.reference_id AS booking_ref, b.status AS booking_status, b.expires_at, l.reference_id AS listing_ref, l.title, hu.name AS host_name,
             to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out
        FROM finance.payments p JOIN stays.bookings b ON b.id = p.booking_id JOIN marketplace.listings l ON l.id = b.listing_id JOIN identity.users hu ON hu.id = b.host_user_id
       WHERE p.reference_id = ${ref} AND p.guest_user_id = ${userId}`);
    return rows[0] as Row | undefined;
  };
  await expireStaleRequests(db, sql`b.id = (SELECT booking_id FROM finance.payments WHERE reference_id = ${ref})`);
  let r = await load();
  if (!r) throw notFound();
  if (askProvider && r.status === "created") {
    const driver = driverFor(r.provider as "fake" | "cashfree");
    if (driver) {
      try {
        const order = await driver.getOrder(String(r.provider_order_id));
        if (order.state === "paid" || order.state === "authorized") {
          await applyProviderEvent({ eventId: `poll_${ref}`, type: "ORDER_STATUS", kind: order.state === "paid" ? "payment_succeeded" : "payment_authorized", orderId: String(r.provider_order_id), paymentId: order.paymentId ?? undefined, method: order.method, amount: order.amount });
          r = (await load())!;
        }
      } catch (e) {
        log.warn("payments.poll_failed", { payment: ref, error: String(e) });
      }
    }
  }
  const status = r.status as PaymentStatus;
  const booking = r.booking_status as BookingStatus;
  const waiting = booking === "pending_payment";
  const state: CheckoutStatus["state"] = r.unwanted
    ? "expired"
    : status === "created"
      ? waiting
        ? "confirming"
        : "expired"
      : status === "failed"
        ? waiting
          ? "failed"
          : "expired"
        : booking === "requested"
          ? "requested"
          : ["confirmed", "checked_in", "completed", "no_show", "cancelled"].includes(booking)
            ? "booked"
            : "expired";
  return {
    state,
    paymentReferenceId: String(r.reference_id),
    bookingReferenceId: String(r.booking_ref),
    listingReferenceId: String(r.listing_ref),
    title: String(r.title),
    amount: num(r.amount),
    method: (r.method as string) ?? null,
    failureReason: (r.failure_reason as string) ?? null,
    holdExpiresAt: booking === "pending_payment" ? iso(r.expires_at) : null,
    requestExpiresAt: booking === "requested" ? iso(r.expires_at) : null,
    checkIn: String(r.check_in),
    checkOut: String(r.check_out),
    hostName: String(r.host_name),
  };
}

// ── Provider events ──────────────────────────────────────────────────────────

/**
 * A webhook from the provider: checked, recorded once, then applied. Answers 200 when done or
 * already done, 401 for a bad signature, 500 when applying failed (the provider sends it again).
 */
export async function receiveWebhook(provider: string, rawBody: string, headers: Headers): Promise<{ status: number; message: string }> {
  const driver = provider === "fake" || provider === "cashfree" ? driverFor(provider) : null;
  if (!driver) return { status: 404, message: "Not found" };
  if (!driver.verifyWebhook(rawBody, headers)) {
    log.warn("payments.webhook_bad_signature", { provider });
    return { status: 401, message: "Bad signature" };
  }
  let event: ProviderEvent;
  try {
    event = driver.parseWebhook(rawBody);
  } catch {
    return { status: 400, message: "Unreadable" };
  }
  const inserted = await db.execute(sql`
    INSERT INTO finance.provider_events (id, provider, event_id, type, payload) VALUES (gen_random_uuid(), ${provider}, ${event.eventId}, ${event.type}, ${rawBody}::jsonb)
    ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`);
  let id = (inserted.rows[0] as Row | undefined)?.id as string | undefined;
  if (!id) {
    const seen = await db.execute(sql`SELECT id, processed_at FROM finance.provider_events WHERE provider = ${provider} AND event_id = ${event.eventId}`);
    const s = seen.rows[0] as Row;
    if (s.processed_at) return { status: 200, message: "Already processed" };
    id = String(s.id);
  }
  try {
    await applyProviderEvent(event);
    await db.execute(sql`UPDATE finance.provider_events SET processed_at = now(), error = NULL WHERE id = ${id}`);
    return { status: 200, message: "OK" };
  } catch (e) {
    log.error("payments.webhook_failed", { provider, event: event.eventId, error: String(e) });
    await db.execute(sql`UPDATE finance.provider_events SET error = ${String(e).slice(0, 1000)} WHERE id = ${id}`);
    return { status: 500, message: "Not processed" };
  }
}

/** Applies one fact from the provider. Safe to apply twice. */
export async function applyProviderEvent(event: ProviderEvent) {
  switch (event.kind) {
    case "payment_succeeded":
    case "payment_authorized":
      return paymentSucceeded(event);
    case "payment_failed":
    case "payment_dropped":
      return paymentFailed(event);
    case "refund_processed":
    case "refund_failed":
      return refundResult(event);
    case "transfer_paid":
    case "transfer_failed":
      return transferResult(event);
    case "vendor_status":
      return vendorStatus(event);
    default:
      return;
  }
}

async function paymentSucceeded(event: ProviderEvent) {
  if (!event.orderId) return;
  const outcome = await db.transaction(async (tx) => {
    const found = await tx.execute(sql`SELECT id, booking_id, status, amount, capture, reference_id FROM finance.payments WHERE provider_order_id = ${event.orderId!} FOR UPDATE`);
    const p = found.rows[0] as Row | undefined;
    if (!p) throw new Error(`no payment for order ${event.orderId}`);
    if (!["created", "failed"].includes(String(p.status))) return null; // Already applied.
    if (event.amount !== undefined && Math.abs(event.amount - num(p.amount)) > 0.009) throw new Error(`amount mismatch on ${p.reference_id}: ${event.amount} vs ${p.amount}`);
    const paymentId = String(p.id);
    const bookingId = String(p.booking_id);
    const captured = event.kind === "payment_succeeded";
    const lockedBooking = await tx.execute(sql`
      SELECT id, reference_id, status, instant_book, listing_id, guest_user_id, to_char(lower(dates), 'YYYY-MM-DD') AS check_in, to_char(upper(dates), 'YYYY-MM-DD') AS check_out
        FROM stays.bookings WHERE id = ${bookingId} FOR UPDATE`);
    const b = lockedBooking.rows[0] as Row;

    // Which state the booking can move to: it must still be waiting, or (paid just after its hold lapsed) still free.
    // Another payment already paying for it makes this one unwanted (marked in the same update, for the unique index).
    const another = await tx.execute(sql`SELECT 1 FROM finance.payments WHERE booking_id = ${bookingId} AND id <> ${paymentId} AND status IN ${SUCCESS} AND NOT unwanted`);
    await tx.execute(sql`
      UPDATE finance.payments SET status = ${captured ? "captured" : "authorized"}, provider_payment_id = ${event.paymentId ?? null}, method = ${event.method ?? null},
             failure_reason = NULL, unwanted = ${another.rows.length > 0}, ${captured ? sql`captured_at = now(), authorized_at = coalesce(authorized_at, now())` : sql`authorized_at = now()`}, updated_at = now()
       WHERE id = ${paymentId}`);
    let accepted = another.rows.length === 0 && ["pending_payment", "abandoned"].includes(String(b.status));
    let reason = another.rows.length ? "You paid twice for this booking; this payment is returned in full." : "Your payment arrived after the booking had ended.";
    const to: BookingStatus = b.instant_book ? "confirmed" : "requested";
    if (accepted) {
      try {
        await tx.transaction(async (sp) => {
          if (b.status === "abandoned" || !b.instant_book) {
            // Re-check the dates: confirmed bookings and blocks win.
            const clash = await sp.execute(sql`
              SELECT EXISTS (SELECT 1 FROM stays.bookings x WHERE x.listing_id = ${String(b.listing_id)} AND x.id <> ${bookingId}
                               AND (x.status IN ('confirmed', 'checked_in', 'completed') OR (x.status = 'pending_payment' AND x.instant_book AND x.expires_at > now()))
                               AND x.dates && daterange(${String(b.check_in)}::date, ${String(b.check_out)}::date))
                  OR EXISTS (SELECT 1 FROM stays.stay_blocks k WHERE k.listing_id = ${String(b.listing_id)} AND k.dates && daterange(${String(b.check_in)}::date, ${String(b.check_out)}::date)) AS taken`);
            if ((clash.rows[0] as Row).taken) throw new Error("dates_taken");
          }
          const expires =
            to === "requested" ? sql`least(now() + ${`${REQUEST_HOURS} hours`}::interval, ((${String(b.check_in)}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))` : sql`NULL`;
          await sp.execute(sql`
            UPDATE stays.bookings SET status = ${to}, status_reason = NULL, expires_at = ${expires}, ${to === "confirmed" ? sql`confirmed_at = now(),` : sql``} updated_at = now()
             WHERE id = ${bookingId}`);
        });
      } catch (e) {
        if (!(e instanceof Error && e.message === "dates_taken") && !isOverlap(e)) throw e;
        accepted = false;
        reason = "Those dates were taken before your payment arrived; it's returned in full.";
      }
    }

    if (!accepted) {
      // Nothing to pay for: give it back. A hold is released by settlePayments; money taken is refunded.
      await tx.execute(sql`UPDATE finance.payments SET unwanted = true, attention_note = ${reason}, updated_at = now() WHERE id = ${paymentId}`);
      if (captured) {
        const unwanted = await tx.execute(sql`SELECT id, reference_id, amount, refunded_amount, commission_percent, gst_percent, host_share, vendor_id FROM finance.payments WHERE id = ${paymentId}`);
        const u = unwanted.rows[0] as Row;
        const pay: BookingPayment = {
          id: paymentId,
          referenceId: String(u.reference_id),
          status: "captured",
          amount: num(u.amount),
          refundedAmount: 0,
          commissionPercent: num(u.commission_percent),
          gstPercent: num(u.gst_percent),
          hostShare: num(u.host_share),
          vendorId: (u.vendor_id as string) ?? null,
        };
        // Refund the whole order, the host's held share included; no payout is touched.
        await tx.execute(sql`
          INSERT INTO finance.refunds (id, payment_id, booking_id, amount, host_share, platform_share, reason, initiated_by)
          VALUES (gen_random_uuid(), ${paymentId}, ${bookingId}, ${pay.amount}, ${pay.hostShare}, ${round2(pay.amount - pay.hostShare)}, ${reason}, 'system')`);
        await tx.execute(sql`UPDATE finance.payments SET refunded_amount = amount, status = 'refunded', updated_at = now() WHERE id = ${paymentId}`);
      }
      await notify(tx, [String(b.guest_user_id)], { type: "payment_update", title: `Your payment for ${b.reference_id} is being returned`, body: reason, link: `/account/trips/${b.reference_id}` });
      return { bookingId, announce: null };
    }

    await writeEvent(tx, bookingId, b.status as BookingStatus, to, "paid", String(b.guest_user_id), "guest", null);
    if (to === "confirmed") {
      const pay = await bookingPayment(tx, bookingId);
      if (pay) await schedulePayout(tx, bookingId, pay);
    }
    const announced = await announceBooking(tx, bookingId, NO_REQUEST, { payment: String(p.reference_id), method: event.method ?? null });
    return { bookingId, announce: announced };
  });
  if (!outcome) return;
  if (outcome.announce) emailNewBooking(outcome.announce);
  await settlePayments({ bookingId: outcome.bookingId });
}

async function paymentFailed(event: ProviderEvent) {
  if (!event.orderId) return;
  await db.execute(sql`
    UPDATE finance.payments SET status = 'failed', failure_reason = ${event.failureReason ?? "The payment didn't go through."}, method = coalesce(${event.method ?? null}, method),
           failed_at = now(), updated_at = now()
     WHERE provider_order_id = ${event.orderId} AND status = 'created'`);
}

async function refundResult(event: ProviderEvent) {
  if (!event.refundId) return;
  if (event.kind === "refund_processed") {
    await db.execute(sql`
      UPDATE finance.refunds SET status = 'processed', provider_refund_id = coalesce(${event.providerRefundId ?? null}, provider_refund_id), processed_at = now(), failure_reason = NULL, updated_at = now()
       WHERE reference_id = ${event.refundId} AND status <> 'processed'`);
  } else {
    await failRefund(event.refundId, event.failureReason ?? "The provider couldn't process the refund.");
  }
}

async function transferResult(event: ProviderEvent) {
  const payoutRef = event.payoutId ?? null;
  if (!payoutRef) return;
  if (event.kind === "transfer_paid") {
    await db.transaction(async (tx) => {
      const { rows } = await tx.execute(sql`SELECT id FROM finance.payouts WHERE reference_id = ${payoutRef} AND status = 'processing' FOR UPDATE`);
      const r = rows[0] as Row | undefined;
      if (r) await markPayoutPaid(tx, String(r.id), event.utr ?? null);
    });
  } else {
    await db.execute(sql`UPDATE finance.payouts SET status = 'failed', failure_reason = ${event.failureReason ?? "The bank returned the transfer."}, updated_at = now() WHERE reference_id = ${payoutRef}`);
  }
}

async function vendorStatus(event: ProviderEvent) {
  if (!event.vendorId || !event.vendorStatus) return;
  await db.execute(sql`
    UPDATE finance.payout_accounts SET status = ${event.vendorStatus}, status_reason = ${event.vendorReason ?? null},
           verified_at = CASE WHEN ${event.vendorStatus} = 'active' THEN coalesce(verified_at, now()) ELSE verified_at END, updated_at = now()
     WHERE provider_vendor_id = ${event.vendorId}`);
}

// ── Settling with the provider ───────────────────────────────────────────────

export type SettleSummary = { captured: number; released: number; refunded: number; paidOut: number; held: number; failed: number };

type SettleScope = { bookingId?: string; organizationId?: string };

/**
 * Carries out what the database says is owed: takes held payments for accepted bookings, releases
 * holds on bookings that ended, sends refunds, and pays hosts whose payout date has come. Each item
 * is locked while it's handled, so this job and a person's action never do the same thing twice.
 * Never throws: failures are recorded, retried later, and flagged after a few tries.
 */
export async function settlePayments(scope: SettleScope = {}): Promise<SettleSummary> {
  const summary: SettleSummary = { captured: 0, released: 0, refunded: 0, paidOut: 0, held: 0, failed: 0 };
  const driver = paymentDriver();
  if (!driver) return summary;
  const onBooking = (alias: string) => (scope.bookingId ? sql`${sql.raw(alias)}.booking_id = ${scope.bookingId}` : sql`TRUE`);
  const onOrg = (alias: string) => (scope.organizationId ? sql`${sql.raw(alias)}.organization_id = ${scope.organizationId}` : sql`TRUE`);
  try {
    await expireStaleRequests(db, scope.bookingId ? sql`b.id = ${scope.bookingId}` : sql`TRUE`);

    // Held payments: taken once the host accepts, released once the booking has ended.
    const holds = await db.execute(sql`
      SELECT p.id FROM finance.payments p JOIN stays.bookings b ON b.id = p.booking_id
       WHERE p.status = 'authorized' AND p.provider = ${driver.name} AND ${onBooking("p")} AND ${onOrg("p")}
         AND (p.unwanted OR b.status IN ('confirmed', 'checked_in', 'completed', 'no_show', 'declined', 'expired', 'cancelled', 'abandoned'))
       LIMIT 200`);
    for (const h of holds.rows as Row[]) {
      const r = await settleHold(driver, String(h.id));
      if (r === "captured") summary.captured++;
      else if (r === "released") summary.released++;
      else if (r === "failed") summary.failed++;
    }

    const refunds = await db.execute(sql`
      SELECT r.id FROM finance.refunds r JOIN finance.payments p ON p.id = r.payment_id
       WHERE r.status = 'pending' AND r.provider_refund_id IS NULL AND p.provider = ${driver.name} AND ${onBooking("r")} AND ${onOrg("p")}
         AND (r.attempts = 0 OR r.updated_at < now() - interval '4 minutes')
       ORDER BY r.created_at LIMIT 200`);
    for (const r of refunds.rows as Row[]) {
      const done = await sendRefund(driver, String(r.id));
      if (done === "sent") summary.refunded++;
      else if (done === "failed") summary.failed++;
    }

    const due = await db.execute(sql`
      SELECT po.id FROM finance.payouts po JOIN finance.payments p ON p.id = po.payment_id
       WHERE po.status = 'scheduled' AND po.release_at <= now() AND p.provider = ${driver.name} AND ${onBooking("po")} AND ${onOrg("po")}
       ORDER BY po.release_at LIMIT 200`);
    for (const d of due.rows as Row[]) {
      const done = await releasePayoutNow(driver, String(d.id));
      if (done === "paid") summary.paidOut++;
      else if (done === "held") summary.held++;
      else if (done === "failed") summary.failed++;
    }
  } catch (e) {
    log.error("payments.settle_failed", { error: String(e) });
  }
  return summary;
}

async function settleHold(driver: PaymentDriver, paymentId: string): Promise<"captured" | "released" | "skipped" | "failed"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT p.id, p.reference_id, p.provider_order_id, p.amount, p.unwanted, b.status AS booking_status, b.reference_id AS booking_ref, b.guest_user_id
        FROM finance.payments p JOIN stays.bookings b ON b.id = p.booking_id
       WHERE p.id = ${paymentId} AND p.status = 'authorized' FOR UPDATE OF p SKIP LOCKED`);
    const p = rows[0] as Row | undefined;
    if (!p) return "skipped";
    const take = !p.unwanted && ["confirmed", "checked_in", "completed", "no_show"].includes(String(p.booking_status));
    try {
      if (take) {
        await driver.capture(String(p.provider_order_id), num(p.amount));
        await tx.execute(sql`UPDATE finance.payments SET status = 'captured', captured_at = now(), updated_at = now() WHERE id = ${paymentId}`);
        return "captured";
      }
      await driver.voidAuthorization(String(p.provider_order_id));
      await tx.execute(sql`UPDATE finance.payments SET status = 'voided', voided_at = now(), updated_at = now() WHERE id = ${paymentId}`);
      return "released";
    } catch (e) {
      log.error("payments.hold_failed", { payment: p.reference_id, capture: take, error: String(e) });
      await flag(tx, paymentId, take ? `Couldn't take the held payment: ${String(e).slice(0, 200)}` : `Couldn't release the hold: ${String(e).slice(0, 200)}`);
      return "failed";
    }
  });
}

async function sendRefund(driver: PaymentDriver, refundId: string): Promise<"sent" | "skipped" | "failed"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT r.id, r.reference_id, r.amount, r.host_share, r.reason, r.attempts, p.provider_order_id, p.vendor_id, p.id AS payment_id
        FROM finance.refunds r JOIN finance.payments p ON p.id = r.payment_id
       WHERE r.id = ${refundId} AND r.status = 'pending' AND r.provider_refund_id IS NULL FOR UPDATE OF r SKIP LOCKED`);
    const r = rows[0] as Row | undefined;
    if (!r) return "skipped";
    try {
      const out = await driver.refund({ providerOrderId: String(r.provider_order_id), refundId: String(r.reference_id), amount: num(r.amount), vendorShare: num(r.host_share), vendorId: (r.vendor_id as string) ?? null, reason: String(r.reason) });
      await tx.execute(sql`
        UPDATE finance.refunds SET provider_refund_id = ${out.providerRefundId}, attempts = attempts + 1, failure_reason = NULL,
               status = ${out.state === "processed" ? "processed" : "pending"}, processed_at = ${out.state === "processed" ? sql`now()` : sql`NULL`}, updated_at = now()
         WHERE id = ${refundId}`);
      return "sent";
    } catch (e) {
      const attempts = num(r.attempts) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS || (e instanceof ProviderError && !e.retryable);
      log.error("payments.refund_failed", { refund: r.reference_id, attempts, error: String(e) });
      await tx.execute(sql`
        UPDATE finance.refunds SET attempts = ${attempts}, failure_reason = ${String(e).slice(0, 500)}, status = ${giveUp ? "failed" : "pending"}, updated_at = now() WHERE id = ${refundId}`);
      if (giveUp) await flag(tx, String(r.payment_id), `Refund ${r.reference_id} failed: ${String(e).slice(0, 200)}`);
      return "failed";
    }
  });
}

async function failRefund(refundRef: string, reason: string) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`UPDATE finance.refunds SET status = 'failed', failure_reason = ${reason}, updated_at = now() WHERE reference_id = ${refundRef} RETURNING payment_id`);
    const r = rows[0] as Row | undefined;
    if (r) await flag(tx, String(r.payment_id), `Refund ${refundRef} failed: ${reason}`);
  });
}

async function releasePayoutNow(driver: PaymentDriver, payoutId: string): Promise<"paid" | "processing" | "held" | "skipped" | "failed"> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT po.id, po.reference_id, po.amount, po.attempts, p.provider_order_id, p.status AS payment_status, pa.status AS account_status, pa.provider_vendor_id
        FROM finance.payouts po JOIN finance.payments p ON p.id = po.payment_id
        LEFT JOIN finance.payout_accounts pa ON pa.organization_id = po.organization_id
       WHERE po.id = ${payoutId} AND po.status = 'scheduled' AND po.release_at <= now() FOR UPDATE OF po SKIP LOCKED`);
    const po = rows[0] as Row | undefined;
    if (!po) return "skipped";
    if (!["captured", "partially_refunded"].includes(String(po.payment_status))) return "skipped"; // The money isn't taken yet.
    if (po.account_status !== "active") {
      await tx.execute(sql`UPDATE finance.payouts SET status = 'on_hold', hold_reason = ${NO_ACCOUNT}, updated_at = now() WHERE id = ${payoutId}`);
      return "held";
    }
    if (num(po.amount) <= 0) {
      await markPayoutPaid(tx, payoutId, null);
      return "paid";
    }
    try {
      const out = await driver.releaseToVendor({ providerOrderId: String(po.provider_order_id), vendorId: String(po.provider_vendor_id), amount: num(po.amount), payoutId: String(po.reference_id) });
      await tx.execute(sql`UPDATE finance.payouts SET provider_transfer_id = ${out.transferId}, attempts = attempts + 1, failure_reason = NULL, status = 'processing', updated_at = now() WHERE id = ${payoutId}`);
      if (out.state === "paid") {
        await markPayoutPaid(tx, payoutId, out.utr);
        return "paid";
      }
      return "processing";
    } catch (e) {
      const attempts = num(po.attempts) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS || (e instanceof ProviderError && !e.retryable);
      log.error("payments.payout_failed", { payout: po.reference_id, attempts, error: String(e) });
      await tx.execute(sql`
        UPDATE finance.payouts SET attempts = ${attempts}, failure_reason = ${String(e).slice(0, 500)}, status = ${giveUp ? "failed" : "scheduled"},
               release_at = ${giveUp ? sql`release_at` : sql`now() + interval '15 minutes'`}, updated_at = now()
         WHERE id = ${payoutId}`);
      if (giveUp) await notifyPermissionHolders(tx, "payments.manage", { type: "payments_attention", title: `Payout ${po.reference_id} failed`, body: String(e).slice(0, 200), link: "/payments?tab=attention" });
      return "failed";
    }
  });
}

/** A payout reached the host: recorded with the bank's reference, and Trustbrick's commission entered as kept back. */
async function markPayoutPaid(tx: Tx, payoutId: string, utr: string | null) {
  const { rows } = await tx.execute(sql`
    UPDATE finance.payouts SET status = 'paid', utr = ${utr}, paid_at = now(), updated_at = now() WHERE id = ${payoutId}
    RETURNING id, reference_id, booking_id, organization_id, gross, commission, gst, amount`);
  const po = rows[0] as Row;
  const info = await tx.execute(sql`
    SELECT b.reference_id, b.listing_id, b.host_user_id, p.commission_percent, p.gst_percent
      FROM stays.bookings b JOIN finance.payments p ON p.id = (SELECT payment_id FROM finance.payouts WHERE id = ${payoutId}) WHERE b.id = ${String(po.booking_id)}`);
  const b = info.rows[0] as Row;
  if (num(po.gross) > 0) {
    await tx.execute(sql`
      INSERT INTO finance.commission_entries (id, organization_id, listing_id, booking_id, kind, service, deal_value, basis, rate_percent, amount, gst_percent, gst_amount, total,
                                              description, status, collection, payment_reference, status_changed_at, payout_id)
      SELECT gen_random_uuid(), ${String(po.organization_id)}, ${String(b.listing_id)}, ${String(po.booking_id)}, 'charge', 'stay', ${num(po.gross)}, 'deal_value', ${num(b.commission_percent)},
             ${num(po.commission)}, ${num(b.gst_percent)}, ${num(po.gst)}, ${round2(num(po.commission) + num(po.gst))},
             ${`Stay ${b.reference_id}, kept from payout ${po.reference_id}`}, 'paid', 'gateway', ${String(po.reference_id)}, now(), ${payoutId}
       WHERE NOT EXISTS (SELECT 1 FROM finance.commission_entries e WHERE e.booking_id = ${String(po.booking_id)} AND e.kind = 'charge')`);
  }
  await notify(tx, [String(b.host_user_id)], {
    type: "payment_update",
    title: `Payout of ${formatMoney(num(po.amount))} sent for ${b.reference_id}`,
    body: utr ? `Bank reference ${utr}. It usually reaches your account the same day.` : "It usually reaches your account the same day.",
    link: "/payouts",
  });
}

async function flag(tx: Tx, paymentId: string, note: string) {
  const { rows } = await tx.execute(sql`
    UPDATE finance.payments SET needs_attention = true, attention_note = ${note.slice(0, 500)}, updated_at = now() WHERE id = ${paymentId} AND NOT needs_attention RETURNING reference_id`);
  const r = rows[0] as Row | undefined;
  if (r) await notifyPermissionHolders(tx, "payments.manage", { type: "payments_attention", title: `Payment ${r.reference_id} needs a look`, body: note.slice(0, 200), link: `/payments?tab=attention&q=${r.reference_id}` });
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Daily: compares recent payments with the provider's records. A payment the provider has but we
 * missed (a lost webhook) is applied; any other difference is flagged for a person.
 */
export async function reconcilePayments(days = 3): Promise<{ checked: number; fixed: number; flagged: number }> {
  const driver = paymentDriver();
  const out = { checked: 0, fixed: 0, flagged: 0 };
  if (!driver) return out;
  const { rows } = await db.execute(sql`
    SELECT id, reference_id, provider_order_id, status, amount FROM finance.payments
     WHERE provider = ${driver.name} AND created_at > now() - ${`${days} days`}::interval AND status IN ('created', 'failed', 'authorized', 'captured', 'partially_refunded', 'refunded')
     ORDER BY created_at LIMIT 1000`);
  for (const r of rows as Row[]) {
    out.checked++;
    try {
      const order = await driver.getOrder(String(r.provider_order_id));
      const ours = String(r.status);
      const theirsPaid = order.state === "paid" || order.state === "authorized";
      if (theirsPaid && (ours === "created" || ours === "failed")) {
        await applyProviderEvent({ eventId: `recon_${r.reference_id}`, type: "RECONCILIATION", kind: order.state === "paid" ? "payment_succeeded" : "payment_authorized", orderId: String(r.provider_order_id), paymentId: order.paymentId ?? undefined, method: order.method, amount: order.amount });
        out.fixed++;
      } else if (!theirsPaid && order.state !== "voided" && ["authorized", "captured", "partially_refunded", "refunded"].includes(ours)) {
        await db.transaction((tx) => flag(tx, String(r.id), `Reconciliation: we have it as ${ours}, the provider as ${order.state}.`));
        out.flagged++;
      } else if (Math.abs(order.amount - num(r.amount)) > 0.009) {
        await db.transaction((tx) => flag(tx, String(r.id), `Reconciliation: amounts differ (ours ${r.amount}, provider ${order.amount}).`));
        out.flagged++;
      }
    } catch (e) {
      log.warn("payments.reconcile_failed", { payment: r.reference_id, error: String(e) });
    }
  }
  return out;
}

// ── The guest's view ─────────────────────────────────────────────────────────

export type RefundView = { referenceId: string; amount: number; status: RefundStatus; reason: string; createdAt: string; processedAt: string | null };

export type TripPayment = {
  referenceId: string;
  status: PaymentStatus;
  amount: number;
  refunded: number;
  method: string | null;
  providerPaymentId: string | null;
  paidAt: string | null;
  refunds: RefundView[];
  /** A receipt exists once money was taken. */
  receipt: boolean;
};

export type CancelPreview = { kind: "release" | "full" | "partial" | "none"; refund: number; kept: number; summary: string; cutoff: string };

/** The payment section of a guest's trip page, and what cancelling would return. */
export async function tripMoney(userId: string, bookingReferenceId: string): Promise<{ payment: TripPayment | null; cancel: CancelPreview | null; timeline: { label: string; from: string | null; to: string | null; refundPercent: number }[]; pendingPayment: { holdExpiresAt: string | null } | null }> {
  const { rows } = await db.execute(sql`
    SELECT b.id, b.status, b.payment_mode, b.cancellation_policy, b.created_at, b.expires_at, to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(b.check_in_time, 'HH24:MI') AS check_in_time
      FROM stays.bookings b WHERE b.reference_id = ${bookingReferenceId} AND b.guest_user_id = ${userId}`);
  const b = rows[0] as Row | undefined;
  if (!b || b.payment_mode !== "online") return { payment: null, cancel: null, timeline: [], pendingPayment: null };
  const bookingId = String(b.id);
  const policy = b.cancellation_policy as Policy;
  const timeline = policyTimeline(policy, String(b.check_in), String(b.check_in_time), new Date(String(b.created_at))).map((s) => ({ ...s, from: s.from?.toISOString() ?? null, to: s.to?.toISOString() ?? null }));
  if (b.status === "pending_payment") return { payment: null, cancel: null, timeline, pendingPayment: { holdExpiresAt: iso(b.expires_at) } };
  const p = await db.execute(sql`
    SELECT id, reference_id, status, amount, refunded_amount, method, provider_payment_id, captured_at, authorized_at FROM finance.payments
     WHERE booking_id = ${bookingId} AND status IN ${SUCCESS} AND NOT unwanted ORDER BY created_at DESC LIMIT 1`);
  const pr = p.rows[0] as Row | undefined;
  if (!pr) return { payment: null, cancel: null, timeline, pendingPayment: null };
  const refunds = await db.execute(sql`SELECT reference_id, amount, status, reason, created_at, processed_at FROM finance.refunds WHERE payment_id = ${String(pr.id)} ORDER BY created_at`);
  const status = pr.status as PaymentStatus;
  const paidLeft = round2(num(pr.amount) - num(pr.refunded_amount));
  const cancellable = ["requested", "confirmed"].includes(String(b.status)) && todayInIndia() < String(b.check_in);
  const q = cancellable
    ? refundFor({ policy, paid: paidLeft, held: status === "authorized", checkIn: String(b.check_in), checkInTime: String(b.check_in_time), cancelledBy: "guest" })
    : null;
  // A request the host hasn't accepted is always free to cancel.
  const preview = q && b.status === "requested" && q.kind !== "release" ? { ...q, kind: "full" as const, refund: paidLeft, kept: 0, summary: "You get everything back." } : q;
  return {
    payment: {
      referenceId: String(pr.reference_id),
      status,
      amount: num(pr.amount),
      refunded: num(pr.refunded_amount),
      method: (pr.method as string) ?? null,
      providerPaymentId: (pr.provider_payment_id as string) ?? null,
      paidAt: iso(pr.captured_at ?? pr.authorized_at),
      refunds: (refunds.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), amount: num(r.amount), status: r.status as RefundStatus, reason: String(r.reason), createdAt: iso(r.created_at)!, processedAt: iso(r.processed_at) })),
      receipt: status !== "authorized",
    },
    cancel: preview ? { kind: preview.kind, refund: preview.refund, kept: preview.kept, summary: preview.summary, cutoff: preview.cutoff.toISOString() } : null,
    timeline,
    pendingPayment: null,
  };
}

export type Receipt = {
  receiptNumber: string;
  issuedAt: string;
  guest: { name: string; email: string; phone: string };
  booking: { referenceId: string; checkIn: string; checkOut: string; nights: number; guests: number; checkInTime: string; checkOutTime: string };
  stay: { title: string; address: string; hostName: string };
  lines: { label: string; amount: number }[];
  total: number;
  refunds: { referenceId: string; amount: number; status: RefundStatus; at: string }[];
  netPaid: number;
  payment: { referenceId: string; method: string | null; providerPaymentId: string | null; provider: string; paidAt: string };
};

/** A receipt for a guest's payment: what they paid, for what, and anything returned. */
export async function receiptFor(userId: string, bookingReferenceId: string): Promise<Receipt> {
  if (!isReferenceId(bookingReferenceId, "BKG")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT b.reference_id, b.nights, b.adults, b.children, b.guest_name, b.guest_phone, b.subtotal, b.cleaning_fee, b.total, b.nightly_breakdown,
           to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out,
           to_char(b.check_in_time, 'HH24:MI') AS check_in_time, to_char(b.check_out_time, 'HH24:MI') AS check_out_time,
           l.title, hu.name AS host_name, gu.email AS guest_email, loc.name AS locality, city.name AS city, a.line1, a.postal_code,
           p.id AS payment_id, p.reference_id AS payment_ref, p.method, p.provider_payment_id, p.provider, p.captured_at, p.status AS payment_status
      FROM stays.bookings b
      JOIN marketplace.listings l ON l.id = b.listing_id
      JOIN real_estate.properties pr ON pr.id = b.property_id
      JOIN geography.addresses a ON a.id = pr.address_id
      JOIN geography.places loc ON loc.id = a.place_id
      LEFT JOIN geography.places city ON city.id = loc.parent_id
      JOIN identity.users hu ON hu.id = b.host_user_id
      JOIN identity.users gu ON gu.id = b.guest_user_id
      JOIN finance.payments p ON p.booking_id = b.id AND p.status IN ('captured', 'partially_refunded', 'refunded') AND NOT p.unwanted
     WHERE b.reference_id = ${bookingReferenceId} AND b.guest_user_id = ${userId}
     ORDER BY p.created_at DESC LIMIT 1`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound("There's no receipt for this booking yet: nothing has been charged.");
  const refunds = await db.execute(sql`SELECT reference_id, amount, status, created_at FROM finance.refunds WHERE payment_id = ${String(r.payment_id)} AND status <> 'failed' ORDER BY created_at`);
  const nightly = (r.nightly_breakdown as { date: string; price: number }[]) ?? [];
  const groups = new Map<number, number>();
  for (const n of nightly) groups.set(n.price, (groups.get(n.price) ?? 0) + 1);
  const lines = [...groups.entries()].map(([price, count]) => ({ label: `${formatMoney(price)} × ${count} night${count === 1 ? "" : "s"}`, amount: round2(price * count) }));
  if (num(r.cleaning_fee) > 0) lines.push({ label: "Cleaning fee", amount: num(r.cleaning_fee) });
  const refundRows = (refunds.rows as Row[]).map((x) => ({ referenceId: String(x.reference_id), amount: num(x.amount), status: x.status as RefundStatus, at: iso(x.created_at)! }));
  const refunded = refundRows.reduce((s, x) => s + x.amount, 0);
  return {
    receiptNumber: String(r.payment_ref).replace(/^PAY-/, "RCT-"),
    issuedAt: iso(r.captured_at)!,
    guest: { name: String(r.guest_name), email: String(r.guest_email), phone: String(r.guest_phone) },
    booking: {
      referenceId: String(r.reference_id),
      checkIn: String(r.check_in),
      checkOut: String(r.check_out),
      nights: num(r.nights),
      guests: num(r.adults) + num(r.children),
      checkInTime: String(r.check_in_time),
      checkOutTime: String(r.check_out_time),
    },
    stay: { title: String(r.title), address: [r.line1, r.locality, r.city, r.postal_code].filter(Boolean).join(", "), hostName: String(r.host_name) },
    lines,
    total: num(r.total),
    refunds: refundRows,
    netPaid: round2(num(r.total) - refunded),
    payment: { referenceId: String(r.payment_ref), method: (r.method as string) ?? null, providerPaymentId: (r.provider_payment_id as string) ?? null, provider: String(r.provider), paidAt: iso(r.captured_at)! },
  };
}

// ── The host's view ──────────────────────────────────────────────────────────

export type BookingMoney = {
  paid: number;
  refunded: number;
  /** What the guest paid and keeps paid. */
  kept: number;
  commissionPercent: number;
  commission: number;
  gstPercent: number;
  gst: number;
  youReceive: number;
  /** held: the guest's payment is on hold until you accept. */
  state: "held" | "paid";
  payout: { referenceId: string; status: PayoutStatus; releaseAt: string; paidAt: string | null; utr: string | null; holdReason: string | null } | null;
};

/** The money box on a host's booking page. Call it only after the booking was found in the actor's scope. */
export async function bookingMoney(bookingReferenceId: string): Promise<BookingMoney | null> {
  const { rows } = await db.execute(sql`
    SELECT b.id, b.payment_mode, to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(b.check_in_time, 'HH24:MI') AS check_in_time,
           p.status, p.amount, p.refunded_amount, p.commission_percent, p.gst_percent,
           po.reference_id AS payout_ref, po.status AS payout_status, po.release_at, po.paid_at, po.utr, po.hold_reason, po.gross, po.commission, po.gst, po.amount AS payout_amount
      FROM stays.bookings b
      JOIN finance.payments p ON p.booking_id = b.id AND p.status IN ${SUCCESS} AND NOT p.unwanted
      LEFT JOIN finance.payouts po ON po.booking_id = b.id
     WHERE b.reference_id = ${bookingReferenceId} AND b.payment_mode = 'online'
     ORDER BY p.created_at DESC LIMIT 1`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const paid = num(r.amount);
  const refunded = num(r.refunded_amount);
  const split = r.payout_ref
    ? { gross: num(r.gross), commission: num(r.commission), gst: num(r.gst), hostShare: num(r.payout_amount) }
    : splitPayment(paid - refunded, num(r.commission_percent), num(r.gst_percent));
  return {
    paid,
    refunded,
    kept: split.gross,
    commissionPercent: num(r.commission_percent),
    commission: split.commission,
    gstPercent: num(r.gst_percent),
    gst: split.gst,
    youReceive: split.hostShare,
    state: r.status === "authorized" ? "held" : "paid",
    payout: r.payout_ref
      ? {
          referenceId: String(r.payout_ref),
          status: r.payout_status as PayoutStatus,
          releaseAt: iso(r.release_at)!,
          paidAt: iso(r.paid_at),
          utr: (r.utr as string) ?? null,
          holdReason: (r.hold_reason as string) ?? null,
        }
      : r.status === "authorized"
        ? null
        : { referenceId: "", status: "scheduled", releaseAt: payoutReleaseAt(String(r.check_in), String(r.check_in_time)).toISOString(), paidAt: null, utr: null, holdReason: null },
  };
}

export type PayoutRow = {
  referenceId: string;
  booking: { referenceId: string; guestName: string; checkIn: string; checkOut: string; title: string; status: BookingStatus };
  gross: number;
  paid: number;
  refunded: number;
  commission: number;
  gst: number;
  amount: number;
  status: PayoutStatus;
  releaseAt: string;
  paidAt: string | null;
  utr: string | null;
  holdReason: string | null;
  failureReason: string | null;
};

/** Whose payouts the actor sees: like the commission ledger, the organization's for its admin or a sole host, their own bookings' otherwise. */
function payoutScope(actor: Actor): SQL {
  const scope = assertCan(actor, "commission.view");
  if (scope === "platform") return sql`TRUE`;
  if (scope === "org" || actor.organization.orgType === "personal") return sql`po.organization_id = ${actor.organization.id}`;
  return sql`(po.organization_id = ${actor.organization.id} AND EXISTS (SELECT 1 FROM stays.bookings b WHERE b.id = po.booking_id AND ${bookingScope(actor, "bookings.view")}))`;
}

const PAYOUT_COLUMNS = sql`
  po.reference_id, po.gross, po.commission, po.gst, po.amount, po.status, po.release_at, po.paid_at, po.utr, po.hold_reason, po.failure_reason,
  p.amount AS paid, p.refunded_amount, b.reference_id AS booking_ref, b.guest_name, b.status AS booking_status, l.title,
  to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out`;
const PAYOUT_JOINS = sql`
  JOIN finance.payments p ON p.id = po.payment_id
  JOIN stays.bookings b ON b.id = po.booking_id
  JOIN marketplace.listings l ON l.id = b.listing_id`;

const toPayoutRow = (r: Row): PayoutRow => ({
  referenceId: String(r.reference_id),
  booking: { referenceId: String(r.booking_ref), guestName: String(r.guest_name), checkIn: String(r.check_in), checkOut: String(r.check_out), title: String(r.title), status: r.booking_status as BookingStatus },
  gross: num(r.gross),
  paid: num(r.paid),
  refunded: num(r.refunded_amount),
  commission: num(r.commission),
  gst: num(r.gst),
  amount: num(r.amount),
  status: r.status as PayoutStatus,
  releaseAt: iso(r.release_at)!,
  paidAt: iso(r.paid_at),
  utr: (r.utr as string) ?? null,
  holdReason: (r.hold_reason as string) ?? null,
  failureReason: (r.failure_reason as string) ?? null,
});

export type HostPayouts = {
  account: PayoutAccount | null;
  canManageAccount: boolean;
  online: boolean;
  totals: { receivedThisMonth: number; upcoming: number; onHold: number; upcomingCount: number };
  rows: PayoutRow[];
};

/** A host's Payouts page. */
export async function hostPayouts(actor: Actor): Promise<HostPayouts> {
  const scope = payoutScope(actor);
  const [rows, totals, account, online] = await Promise.all([
    db.execute(sql`SELECT ${PAYOUT_COLUMNS} FROM finance.payouts po ${PAYOUT_JOINS} WHERE ${scope} ORDER BY po.release_at DESC LIMIT 100`),
    db.execute(sql`
      SELECT coalesce(sum(po.amount) FILTER (WHERE po.status = 'paid' AND date_trunc('month', po.paid_at AT TIME ZONE 'Asia/Kolkata') = date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')), 0) AS received,
             coalesce(sum(po.amount) FILTER (WHERE po.status IN ('scheduled', 'processing')), 0) AS upcoming,
             count(*) FILTER (WHERE po.status IN ('scheduled', 'processing'))::int AS upcoming_count,
             coalesce(sum(po.amount) FILTER (WHERE po.status IN ('on_hold', 'failed')), 0) AS on_hold
        FROM finance.payouts po WHERE ${scope}`),
    payoutAccountFor(actor.organization.id),
    paymentsOnline(),
  ]);
  const t = totals.rows[0] as Row;
  return {
    account,
    canManageAccount: canManagePayoutAccount(actor),
    online,
    totals: { receivedThisMonth: num(t.received), upcoming: num(t.upcoming), onHold: num(t.on_hold), upcomingCount: num(t.upcoming_count) },
    rows: (rows.rows as Row[]).map(toPayoutRow),
  };
}

// ── Trustbrick's view ────────────────────────────────────────────────────────

export const PAYMENT_TABS = {
  all: { label: "All", where: sql`TRUE` },
  held: { label: "Held", where: sql`p.status = 'authorized' AND NOT p.unwanted` },
  refunds: { label: "Refunds", where: sql`p.refunded_amount > 0` },
  failed: { label: "Failed", where: sql`p.status = 'failed'` },
  attention: {
    label: "Needs attention",
    where: sql`(p.needs_attention OR EXISTS (SELECT 1 FROM finance.payouts x WHERE x.payment_id = p.id AND x.status IN ('failed', 'on_hold'))
                OR EXISTS (SELECT 1 FROM finance.refunds x WHERE x.payment_id = p.id AND x.status = 'failed'))`,
  },
} as const;
export type PaymentTab = keyof typeof PAYMENT_TABS;

export const paymentFilters = z.object({
  tab: z.enum(Object.keys(PAYMENT_TABS) as [PaymentTab, ...PaymentTab[]]).catch("all"),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type PaymentFilters = z.infer<typeof paymentFilters>;

export type AdminPaymentRow = {
  referenceId: string;
  status: PaymentStatus;
  amount: number;
  refunded: number;
  method: string | null;
  provider: string;
  providerPaymentId: string | null;
  failureReason: string | null;
  needsAttention: boolean;
  attentionNote: string | null;
  unwanted: boolean;
  createdAt: string;
  booking: { referenceId: string; status: BookingStatus; checkIn: string; checkOut: string; title: string; guestName: string; guestEmail: string; organization: string };
  payout: { referenceId: string; status: PayoutStatus; amount: number; commission: number; gst: number; releaseAt: string; utr: string | null; holdReason: string | null; failureReason: string | null } | null;
  refunds: { referenceId: string; amount: number; status: RefundStatus; reason: string; failureReason: string | null }[];
};

export async function listPayments(actor: Actor, filters: PaymentFilters, page: number): Promise<Page<AdminPaymentRow> & { counts: Record<PaymentTab, number> }> {
  assertCan(actor, "payments.view", "platform");
  const where: SQL[] = [PAYMENT_TABS[filters.tab].where];
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(p.reference_id = ${ref} OR b.reference_id = ${ref} OR p.provider_payment_id = ${filters.q} OR b.guest_name ILIKE ${like} OR gu.email ILIKE ${like} OR l.title ILIKE ${like}
                    OR EXISTS (SELECT 1 FROM finance.payouts x WHERE x.payment_id = p.id AND x.reference_id = ${ref})
                    OR EXISTS (SELECT 1 FROM finance.refunds x WHERE x.payment_id = p.id AND x.reference_id = ${ref}))`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const joins = sql`JOIN stays.bookings b ON b.id = p.booking_id JOIN marketplace.listings l ON l.id = b.listing_id JOIN identity.users gu ON gu.id = b.guest_user_id JOIN orgs.organizations o ON o.id = p.organization_id`;
  const { limit: take, offset } = pageParams(page);
  const [rows, count, counts] = await Promise.all([
    db.execute(sql`
      SELECT p.reference_id, p.status, p.amount, p.refunded_amount, p.method, p.provider, p.provider_payment_id, p.failure_reason, p.needs_attention, p.attention_note, p.unwanted, p.created_at, p.id,
             b.reference_id AS booking_ref, b.status AS booking_status, b.guest_name, gu.email AS guest_email, l.title, o.name AS org_name,
             to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out,
             po.reference_id AS payout_ref, po.status AS payout_status, po.amount AS payout_amount, po.commission AS payout_commission, po.gst AS payout_gst, po.release_at, po.utr, po.hold_reason, po.failure_reason AS payout_failure
        FROM finance.payments p ${joins} LEFT JOIN finance.payouts po ON po.payment_id = p.id
       WHERE ${whereSql} ORDER BY p.created_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM finance.payments p ${joins} WHERE ${whereSql}`),
    db.execute(sql`SELECT ${sql.join(
      (Object.keys(PAYMENT_TABS) as PaymentTab[]).map((t) => sql`count(*) FILTER (WHERE ${PAYMENT_TABS[t].where})::int AS ${sql.raw(t)}`),
      sql`, `,
    )} FROM finance.payments p`),
  ]);
  const ids = (rows.rows as Row[]).map((r) => String(r.id));
  const refunds = ids.length
    ? await db.execute(sql`SELECT payment_id, reference_id, amount, status, reason, failure_reason FROM finance.refunds WHERE payment_id = ANY(${sql.param(ids)}::uuid[]) ORDER BY created_at`)
    : { rows: [] };
  const c = counts.rows[0] as Row;
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      status: r.status as PaymentStatus,
      amount: num(r.amount),
      refunded: num(r.refunded_amount),
      method: (r.method as string) ?? null,
      provider: String(r.provider),
      providerPaymentId: (r.provider_payment_id as string) ?? null,
      failureReason: (r.failure_reason as string) ?? null,
      needsAttention: Boolean(r.needs_attention),
      attentionNote: (r.attention_note as string) ?? null,
      unwanted: Boolean(r.unwanted),
      createdAt: iso(r.created_at)!,
      booking: {
        referenceId: String(r.booking_ref),
        status: r.booking_status as BookingStatus,
        checkIn: String(r.check_in),
        checkOut: String(r.check_out),
        title: String(r.title),
        guestName: String(r.guest_name),
        guestEmail: String(r.guest_email),
        organization: String(r.org_name),
      },
      payout: r.payout_ref
        ? {
            referenceId: String(r.payout_ref),
            status: r.payout_status as PayoutStatus,
            amount: num(r.payout_amount),
            commission: num(r.payout_commission),
            gst: num(r.payout_gst),
            releaseAt: iso(r.release_at)!,
            utr: (r.utr as string) ?? null,
            holdReason: (r.hold_reason as string) ?? null,
            failureReason: (r.payout_failure as string) ?? null,
          }
        : null,
      refunds: (refunds.rows as Row[])
        .filter((x) => String(x.payment_id) === String(r.id))
        .map((x) => ({ referenceId: String(x.reference_id), amount: num(x.amount), status: x.status as RefundStatus, reason: String(x.reason), failureReason: (x.failure_reason as string) ?? null })),
    })),
    total: num((count.rows[0] as Row).n),
    page,
    pageSize: take,
    counts: Object.fromEntries(Object.keys(PAYMENT_TABS).map((k) => [k, num(c[k])])) as Record<PaymentTab, number>,
  };
}

/** The totals across the top of the admin Payments page, for this month. */
export async function paymentsOverview(actor: Actor) {
  assertCan(actor, "payments.view", "platform");
  const month = sql`date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')`;
  const { rows } = await db.execute(sql`
    SELECT
      (SELECT coalesce(sum(amount), 0) FROM finance.payments WHERE status IN ('captured', 'partially_refunded', 'refunded') AND NOT unwanted AND date_trunc('month', captured_at AT TIME ZONE 'Asia/Kolkata') = ${month}) AS collected,
      (SELECT coalesce(sum(amount), 0) FROM finance.refunds WHERE status <> 'failed' AND date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata') = ${month}) AS refunded,
      (SELECT coalesce(sum(commission + gst), 0) FROM finance.payouts WHERE status = 'paid' AND date_trunc('month', paid_at AT TIME ZONE 'Asia/Kolkata') = ${month}) AS commission,
      (SELECT coalesce(sum(amount), 0) FROM finance.payouts WHERE status IN ('scheduled', 'processing', 'on_hold')) AS owed_to_hosts,
      (SELECT coalesce(sum(amount), 0) FROM finance.payments WHERE status = 'authorized' AND NOT unwanted) AS held,
      (SELECT count(*) FROM finance.payments p WHERE ${PAYMENT_TABS.attention.where})::int AS attention`);
  const r = rows[0] as Row;
  return {
    collected: num(r.collected),
    refunded: num(r.refunded),
    commission: num(r.commission),
    owedToHosts: num(r.owed_to_hosts),
    held: num(r.held),
    attention: num(r.attention),
    online: await paymentsOnline(),
  };
}

// ── Trustbrick's actions ─────────────────────────────────────────────────────

const reasonText = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

const refundSchema = z.object({
  amount: z.coerce.number({ message: "Enter an amount" }).positive("Enter an amount above zero"),
  reason: reasonText,
});

/**
 * Trustbrick refunds some or all of a payment (goodwill, a dispute). It comes out of the host's
 * share and Trustbrick's in proportion, so only before the host has been paid.
 */
export async function adminRefund(actor: Actor, paymentReferenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "payments.manage", "platform");
  const parsed = refundSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const ref = normalizeReferenceId(paymentReferenceId);
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT booking_id FROM finance.payments WHERE reference_id = ${ref}`);
    const r = rows[0] as Row | undefined;
    if (!r) throw notFound();
    const payment = await bookingPayment(tx, String(r.booking_id), true);
    if (!payment || payment.referenceId !== ref) throw conflict("Only a payment that pays for a booking can be refunded here.");
    if (payment.status === "authorized") throw conflict("This payment is only held. Cancel the booking to release it.");
    const payout = await tx.execute(sql`SELECT status FROM finance.payouts WHERE booking_id = ${String(r.booking_id)}`);
    const ps = (payout.rows[0] as Row | undefined)?.status;
    if (ps === "paid" || ps === "processing") throw conflict("The host has already been paid for this booking, so a refund can't come out of their share. Record it as an adjustment instead.");
    const left = round2(payment.amount - payment.refundedAmount);
    if (parsed.data.amount > left + 0.001) throw invalid(`At most ${formatMoney(left)} is left to refund.`, { amount: `At most ${formatMoney(left)}` });
    const refund = await recordRefund(tx, { payment, bookingId: String(r.booking_id), amount: parsed.data.amount, initiatedBy: "admin", reason: parsed.data.reason, actorUserId: actor.userId });
    if (!refund) throw conflict("Nothing is left to refund.");
    await audit(tx, actor, { event: "PAYMENT_REFUNDED", target: { type: "payment", referenceId: ref }, after: { refund: refund.referenceId, amount: refund.amount }, metadata: { reason: parsed.data.reason } }, ctx);
    const g = await tx.execute(sql`SELECT guest_user_id, reference_id FROM stays.bookings WHERE id = ${String(r.booking_id)}`);
    const gb = g.rows[0] as Row;
    await notify(tx, [String(gb.guest_user_id)], { type: "payment_update", title: `${formatMoney(refund.amount)} is being refunded to you`, body: parsed.data.reason, link: `/account/trips/${gb.reference_id}` });
    return { bookingId: String(r.booking_id), refund };
  });
  await settlePayments({ bookingId: result.bookingId });
  return result.refund;
}

async function payoutByRef(tx: Tx, referenceId: string) {
  const { rows } = await tx.execute(sql`SELECT id, status, booking_id, organization_id FROM finance.payouts WHERE reference_id = ${normalizeReferenceId(referenceId)} FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return r;
}

/** Stops a payout going out (a complaint, a dispute) until someone releases it. */
export async function holdPayout(actor: Actor, payoutReferenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "payments.manage", "platform");
  const reason = reasonText.safeParse(rawReason);
  if (!reason.success) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });
  await db.transaction(async (tx) => {
    const po = await payoutByRef(tx, payoutReferenceId);
    if (!["scheduled", "failed"].includes(String(po.status))) throw conflict("Only a payout that hasn't gone out can be held.");
    await tx.execute(sql`UPDATE finance.payouts SET status = 'on_hold', hold_reason = ${reason.data}, updated_at = now() WHERE id = ${String(po.id)}`);
    await audit(tx, actor, { event: "PAYOUT_HELD", target: { type: "payout", referenceId: payoutReferenceId }, organizationId: String(po.organization_id), before: { status: po.status }, after: { status: "on_hold" }, metadata: { reason: reason.data } }, ctx);
  });
}

/** Lets a held or failed payout go out (now, if its date has passed). */
export async function releasePayout(actor: Actor, payoutReferenceId: string, ctx: RequestContext) {
  assertCan(actor, "payments.manage", "platform");
  const organizationId = await db.transaction(async (tx) => {
    const po = await payoutByRef(tx, payoutReferenceId);
    if (!["on_hold", "failed"].includes(String(po.status))) throw conflict("This payout isn't held or failed.");
    await tx.execute(sql`UPDATE finance.payouts SET status = 'scheduled', hold_reason = NULL, failure_reason = NULL, attempts = 0, updated_at = now() WHERE id = ${String(po.id)}`);
    await audit(tx, actor, { event: po.status === "failed" ? "PAYOUT_RETRIED" : "PAYOUT_RELEASED", target: { type: "payout", referenceId: payoutReferenceId }, organizationId: String(po.organization_id), before: { status: po.status }, after: { status: "scheduled" } }, ctx);
    return String(po.organization_id);
  });
  await settlePayments({ organizationId });
}

/** Sends a failed refund again. */
export async function retryRefund(actor: Actor, refundReferenceId: string, ctx: RequestContext) {
  assertCan(actor, "payments.manage", "platform");
  const bookingId = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      UPDATE finance.refunds SET status = 'pending', attempts = 0, provider_refund_id = NULL, failure_reason = NULL, updated_at = now()
       WHERE reference_id = ${normalizeReferenceId(refundReferenceId)} AND status = 'failed' RETURNING booking_id, payment_id`);
    const r = rows[0] as Row | undefined;
    if (!r) throw conflict("Only a failed refund can be sent again.");
    await audit(tx, actor, { event: "PAYMENT_REFUNDED", target: { type: "refund", referenceId: refundReferenceId }, metadata: { retried: true } }, ctx);
    return String(r.booking_id);
  });
  await settlePayments({ bookingId });
}

/** Clears a payment's "needs attention" flag once someone has looked. */
export async function resolveAttention(actor: Actor, paymentReferenceId: string, rawNote: unknown, ctx: RequestContext) {
  assertCan(actor, "payments.manage", "platform");
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, 500) : "";
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`UPDATE finance.payments SET needs_attention = false, updated_at = now() WHERE reference_id = ${normalizeReferenceId(paymentReferenceId)} AND needs_attention RETURNING attention_note`);
    const r = rows[0] as Row | undefined;
    if (!r) throw conflict("This payment isn't flagged.");
    await audit(tx, actor, { event: "PAYMENT_ATTENTION_RESOLVED", target: { type: "payment", referenceId: paymentReferenceId }, before: { note: r.attention_note }, metadata: note ? { note } : {} }, ctx);
  });
}

/** Payment emails that don't come from a booking decision: the hold released on an unpaid request, a refund processed. */
export function emailRefund(to: string, bookingRef: string, title: string, amount: number) {
  void sendEmail(
    bookingMessage(to, {
      subject: `Refund of ${formatMoney(amount)}: ${title}`,
      heading: `${formatMoney(amount)} is on its way back`,
      lines: [`For your booking ${bookingRef}. Refunds usually reach your account in 5–7 working days.`],
      action: { label: "View your trip", url: url(`/account/trips/${bookingRef}`) },
    }),
  ).catch((e) => log.error("email.refund_failed", { error: String(e) }));
}

/** Can the actor see the platform Payments page? */
export const canViewPayments = (actor: Actor) => can(actor, "payments.view", "platform");
/** Policy wording for a stay, for pages that show the cancellation rules with money. */
export const policyWords = (policy: Policy) => CANCELLATION_LABELS[policy];

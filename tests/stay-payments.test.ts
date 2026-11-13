import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { fakeWebhook } from "@/lib/payments/fake";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { cancelTrip, createBooking, expireStaleRequests, transitionBooking } from "@/lib/services/stays/bookings";
import {
  adminRefund,
  bookingMoney,
  checkoutStatus,
  holdPayout,
  hostPayouts,
  listPayments,
  receiptFor,
  receiveWebhook,
  reconcilePayments,
  releasePayout,
  resumeCheckout,
  savePayoutAccount,
  settlePayments,
  startCheckout,
  tripMoney,
} from "@/lib/services/stays/payments";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { ctx, makeAdmin, makeHost, makeUser, one } from "./support/factory";
import { readyStay } from "./support/listings";

type Row = Record<string, unknown>;
const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const day = (offset: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const details = (checkIn: string, checkOut: string) => ({ checkIn, checkOut, adults: "2", children: "0", name: "Paying Guest", phone: "98765 22222", agree: "on" });
const guestOf = (u: { id: string; email: string }) => ({ userId: u.id, email: u.email });
const personOf = (u: { id: string; referenceId: string }) => ({ kind: "person" as const, userId: u.id, referenceId: u.referenceId, role: "guest" });

/** The fake provider tells us how the payment went, through the real webhook endpoint logic. */
async function pay(paymentRef: string, outcome: "card" | "upi" | "declined" | "dropped" = "card") {
  const p = await one<{ capture: "auto" | "manual"; amount: string }>(sql`SELECT capture, amount FROM finance.payments WHERE reference_id = ${paymentRef}`);
  const hook = fakeWebhook(paymentRef, outcome, p.capture, Number(p.amount));
  return receiveWebhook("fake", hook.body, hook.headers);
}
const booking = (ref: string) => one<Row>(sql`SELECT * FROM stays.bookings WHERE reference_id = ${ref}`);
const payment = (ref: string) => one<Row>(sql`SELECT * FROM finance.payments WHERE reference_id = ${ref}`);
const payoutOf = (bookingRef: string) => one<Row>(sql`SELECT po.* FROM finance.payouts po JOIN stays.bookings b ON b.id = po.booking_id WHERE b.reference_id = ${bookingRef}`);

let host: Actor;
let hostOrgId: string;
let ops: Actor;
let instantStay: string;
let requestStay: string;
let guest: Awaited<ReturnType<typeof makeUser>>;
let guest2: Awaited<ReturnType<typeof makeUser>>;

// Other test files book stays paid at the property.
afterAll(async () => {
  await db.execute(sql`DELETE FROM platform.system_settings WHERE key = 'payments.stays_online'`);
});

// Many bookings in a row would trip the hourly booking limit: each test starts fresh.
beforeEach(async () => {
  await db.execute(sql`DELETE FROM identity.rate_limits WHERE key LIKE 'action:booking:%' OR key LIKE 'action:payout-account:%'`);
});

beforeAll(async () => {
  const h = await makeHost("Paid Host", { verified: true });
  host = await h.actor();
  hostOrgId = h.org.id;
  const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  guest = await makeUser("Paying Guest");
  guest2 = await makeUser("Other Paying Guest");
  // ₹5,000 a night and ₹800 cleaning: two nights come to ₹10,800.
  instantStay = await readyStay(host, { title: "Instant villa, paid online", price: 5000, cleaningFee: 800, minNights: 1, instantBook: true });
  requestStay = await readyStay(host, { title: "Request cottage, paid online", price: 4000, cleaningFee: 0, minNights: 1 });
  for (const ref of [instantStay, requestStay]) {
    await transitionListing(host, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
  }
  await db.execute(sql`INSERT INTO platform.system_settings (key, value) VALUES ('payments.stays_online', 'true'::jsonb) ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb`);
});

describe("before the host can be paid", () => {
  it("guests can't pay for a stay whose host has no verified payout account", async () => {
    expect(await code(startCheckout(guestOf(guest), instantStay, details(day(40), day(42)), ctx))).toBe("CONFLICT");
    // Nor book it the old way, paying at the property.
    expect(await code(createBooking(guestOf(guest), instantStay, details(day(40), day(42)), ctx))).toBe("CONFLICT");
  });

  it("the host adds a bank account; the provider keeps the details, Trustbrick only the last four digits", async () => {
    const bank = { method: "bank", holderName: "Paid Host", accountNumber: "123456789012", confirmAccountNumber: "123456789012", ifsc: "HDFC0001234", pan: "ABCDE1234F", agree: "on" };
    expect(await code(savePayoutAccount(host, { ...bank, pan: "1234" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(savePayoutAccount(host, { ...bank, confirmAccountNumber: "123456789013" }, ctx))).toBe("VALIDATION_ERROR");
    // The fake bank refuses accounts ending 0000.
    const failing = await savePayoutAccount(host, { ...bank, accountNumber: "123456780000", confirmAccountNumber: "123456780000" }, ctx);
    expect(failing.status).toBe("action_required");
    const ok = await savePayoutAccount(host, bank, ctx);
    expect(ok).toMatchObject({ status: "active", bankName: "HDFC Bank", accountLast4: "9012", ifsc: "HDFC0001234" });
    const stored = await one<Row>(sql`SELECT row_to_json(a)::text AS j FROM finance.payout_accounts a WHERE organization_id = ${hostOrgId}`);
    expect(String(stored.j)).not.toContain("123456789012");
    expect(String(stored.j)).not.toContain("ABCDE1234F");
    const audited = await one<Row>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type = 'PAYOUT_ACCOUNT_SAVED' AND (before::text LIKE '%123456789012%' OR after::text LIKE '%123456789012%' OR after::text LIKE '%ABCDE1234F%')`);
    expect(audited.n).toBe(0);
  });
});

describe("instant book", () => {
  let paymentRef: string;
  let bookingRef: string;

  it("pressing Pay holds the dates for 15 minutes and opens an order for the server's total", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(30), day(32)), ctx);
    paymentRef = start.paymentReferenceId;
    bookingRef = start.bookingReferenceId;
    expect(start).toMatchObject({ amount: 10800, instantBook: true });
    expect(start.checkout).toMatchObject({ kind: "redirect" });
    expect(start.holdExpiresAt).not.toBeNull();
    expect(await booking(bookingRef)).toMatchObject({ status: "pending_payment", payment_mode: "online", instant_book: true });
    expect(await payment(paymentRef)).toMatchObject({ status: "created", capture: "auto", commission_percent: "12.00", host_share: "9270.72" });
    // Another guest can't pay for the same nights meanwhile.
    expect(await code(startCheckout(guestOf(guest2), instantStay, details(day(31), day(33)), ctx))).toBe("VALIDATION_ERROR");
    // And the host doesn't see an unpaid checkout.
    expect((await checkoutStatus(guest.id, paymentRef)).state).toBe("confirming");
  });

  it("a signed webhook confirms it; the same webhook twice changes nothing; a forged one is refused", async () => {
    const hook = fakeWebhook(paymentRef, "card", "auto", 10800);
    expect(await receiveWebhook("fake", hook.body, new Headers({ "x-webhook-timestamp": "1", "x-webhook-signature": "forged" }))).toMatchObject({ status: 401 });
    expect(await receiveWebhook("fake", hook.body, hook.headers)).toMatchObject({ status: 200, message: "OK" });
    expect(await receiveWebhook("fake", hook.body, hook.headers)).toMatchObject({ status: 200, message: "Already processed" });
    expect(await booking(bookingRef)).toMatchObject({ status: "confirmed" });
    expect(await payment(paymentRef)).toMatchObject({ status: "captured", method: "card" });
    expect(await payoutOf(bookingRef)).toMatchObject({ status: "scheduled", gross: "10800.00", commission: "1296.00", gst: "233.28", amount: "9270.72" });
    expect((await checkoutStatus(guest.id, paymentRef)).state).toBe("booked");
    expect(await bookingMoney(bookingRef)).toMatchObject({ paid: 10800, commission: 1296, gst: 233.28, youReceive: 9270.72, state: "paid" });
    const receipt = await receiptFor(guest.id, bookingRef);
    expect(receipt).toMatchObject({ total: 10800, netPaid: 10800 });
    expect(receipt.lines.map((l) => l.amount)).toEqual([10000, 800]);
    // Someone else's receipt isn't theirs to see.
    expect(await code(receiptFor(guest2.id, bookingRef))).toBe("NOT_FOUND");
  });

  it("checking in doesn't invoice commission: it's kept back from the payout a day later", async () => {
    // Move the stay into the past so check-in and the payout date have come.
    await db.execute(sql`UPDATE stays.bookings SET dates = daterange(${day(-1)}::date, ${day(1)}::date) WHERE reference_id = ${bookingRef}`);
    await transitionBooking(host, bookingRef, "check_in", null, ctx);
    expect((await one<Row>(sql`SELECT count(*)::int AS n FROM finance.commission_entries e JOIN stays.bookings b ON b.id = e.booking_id WHERE b.reference_id = ${bookingRef}`)).n).toBe(0);
    await db.execute(sql`UPDATE finance.payouts SET release_at = now() - interval '1 minute' WHERE booking_id = (SELECT id FROM stays.bookings WHERE reference_id = ${bookingRef})`);
    const summary = await settlePayments();
    expect(summary.paidOut).toBeGreaterThanOrEqual(1);
    const po = await payoutOf(bookingRef);
    expect(po).toMatchObject({ status: "paid" });
    expect(String(po.utr)).toMatch(/^FAKEUTR/);
    const charge = await one<Row>(sql`SELECT e.* FROM finance.commission_entries e JOIN stays.bookings b ON b.id = e.booking_id WHERE b.reference_id = ${bookingRef}`);
    expect(charge).toMatchObject({ kind: "charge", status: "paid", collection: "gateway", amount: "1296.00", gst_amount: "233.28", payment_reference: po.reference_id });
    const page = await hostPayouts(host);
    expect(page.rows.find((r) => r.booking.referenceId === bookingRef)).toMatchObject({ status: "paid", amount: 9270.72 });
  });
});

describe("cancelling a booking paid online", () => {
  it("before the cut-off the guest gets everything back and the host's payout is cancelled", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(50), day(52)), ctx);
    await pay(start.paymentReferenceId);
    const money = await tripMoney(guest.id, start.bookingReferenceId);
    expect(money.cancel).toMatchObject({ kind: "full", refund: 10800 });
    await cancelTrip(personOf(guest), start.bookingReferenceId, "Plans changed.", ctx);
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "refunded", refunded_amount: "10800.00" });
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "cancelled", gross: "0.00", amount: "0.00" });
    const refund = await one<Row>(sql`SELECT * FROM finance.refunds WHERE payment_id = (SELECT id FROM finance.payments WHERE reference_id = ${start.paymentReferenceId})`);
    expect(refund).toMatchObject({ status: "processed", amount: "10800.00", initiated_by: "guest" });
  });

  it("after the cut-off (moderate: 5 days) half comes back, out of both shares in proportion", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(3), day(5)), ctx);
    await pay(start.paymentReferenceId, "upi");
    expect((await tripMoney(guest.id, start.bookingReferenceId)).cancel).toMatchObject({ kind: "partial", refund: 5400, kept: 5400 });
    const r = await cancelTrip(personOf(guest), start.bookingReferenceId, null, ctx);
    expect(r.refund).toMatchObject({ kind: "partial", amount: 5400 });
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "partially_refunded", refunded_amount: "5400.00" });
    // ₹5,400 kept: ₹648 commission, ₹116.64 GST, ₹4,635.36 to the host, still paid a day after check-in.
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "scheduled", gross: "5400.00", commission: "648.00", gst: "116.64", amount: "4635.36" });
    const refund = await one<Row>(sql`SELECT * FROM finance.refunds WHERE booking_id = (SELECT id FROM stays.bookings WHERE reference_id = ${start.bookingReferenceId})`);
    expect(refund).toMatchObject({ amount: "5400.00", host_share: "4635.36", platform_share: "764.64" });
  });

  it("a host cancelling refunds in full, whatever the date", async () => {
    const start = await startCheckout(guestOf(guest2), instantStay, details(day(2), day(3)), ctx);
    await pay(start.paymentReferenceId);
    await transitionBooking(host, start.bookingReferenceId, "host_cancel", "The roof is being repaired that week.", ctx);
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "refunded", refunded_amount: "5800.00" });
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "cancelled" });
  });
});

describe("request to book", () => {
  it("the payment is held, not taken, until the host accepts; then it's taken and the payout scheduled", async () => {
    const start = await startCheckout(guestOf(guest), requestStay, details(day(60), day(62)), ctx);
    expect(start).toMatchObject({ amount: 8000, instantBook: false, holdExpiresAt: null });
    // A request doesn't hold the dates: another guest can ask too.
    const other = await startCheckout(guestOf(guest2), requestStay, details(day(61), day(63)), ctx);
    await pay(start.paymentReferenceId, "card");
    await pay(other.paymentReferenceId, "upi");
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "requested" });
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "authorized", capture: "manual" });
    expect((await checkoutStatus(guest.id, start.paymentReferenceId)).state).toBe("requested");
    expect(await bookingMoney(start.bookingReferenceId)).toMatchObject({ state: "held", payout: null });

    await transitionBooking(host, start.bookingReferenceId, "accept", null, ctx);
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "confirmed" });
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "captured" });
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "scheduled", gross: "8000.00" });
    // The other request was declined automatically, and its hold released.
    expect(await booking(other.bookingReferenceId)).toMatchObject({ status: "declined" });
    expect(await payment(other.paymentReferenceId)).toMatchObject({ status: "voided" });
  });

  it("declining, or not answering in time, releases the hold", async () => {
    const a = await startCheckout(guestOf(guest), requestStay, details(day(70), day(71)), ctx);
    await pay(a.paymentReferenceId);
    await transitionBooking(host, a.bookingReferenceId, "decline", "Family visiting then.", ctx);
    expect(await payment(a.paymentReferenceId)).toMatchObject({ status: "voided" });

    const b = await startCheckout(guestOf(guest), requestStay, details(day(72), day(73)), ctx);
    await pay(b.paymentReferenceId);
    await db.execute(sql`UPDATE stays.bookings SET expires_at = now() - interval '1 minute' WHERE reference_id = ${b.bookingReferenceId}`);
    await settlePayments();
    expect(await booking(b.bookingReferenceId)).toMatchObject({ status: "expired" });
    expect(await payment(b.paymentReferenceId)).toMatchObject({ status: "voided" });
  });

  it("a guest withdrawing their request gets the hold released, not a refund", async () => {
    const a = await startCheckout(guestOf(guest2), requestStay, details(day(74), day(75)), ctx);
    await pay(a.paymentReferenceId);
    expect((await tripMoney(guest2.id, a.bookingReferenceId)).cancel).toMatchObject({ kind: "release", refund: 4000 });
    await cancelTrip(personOf(guest2), a.bookingReferenceId, null, ctx);
    expect(await payment(a.paymentReferenceId)).toMatchObject({ status: "voided", refunded_amount: "0.00" });
  });
});

describe("when paying goes wrong", () => {
  it("a declined card leaves the booking waiting; paying again works while the hold lasts", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(80), day(81)), ctx);
    await pay(start.paymentReferenceId, "declined");
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "failed", failure_reason: "Your bank declined the payment." });
    expect((await checkoutStatus(guest.id, start.paymentReferenceId)).state).toBe("failed");
    const again = await resumeCheckout(guestOf(guest), start.bookingReferenceId);
    expect(again.bookingReferenceId).toBe(start.bookingReferenceId);
    await pay(again.paymentReferenceId);
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "confirmed" });
  });

  it("an unpaid checkout lapses after 15 minutes and lets the dates go", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(84), day(85)), ctx);
    await db.execute(sql`UPDATE stays.bookings SET expires_at = now() - interval '1 second' WHERE reference_id = ${start.bookingReferenceId}`);
    // Another guest can now book those nights.
    const other = await startCheckout(guestOf(guest2), instantStay, details(day(84), day(85)), ctx);
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "abandoned" });
    expect(await code(resumeCheckout(guestOf(guest), start.bookingReferenceId))).toBe("CONFLICT");
    await pay(other.paymentReferenceId);
    // The first guest's payment arrives late: the dates are gone, so it goes straight back.
    await pay(start.paymentReferenceId);
    expect(await payment(start.paymentReferenceId)).toMatchObject({ status: "refunded", unwanted: true });
    expect((await checkoutStatus(guest.id, start.paymentReferenceId)).state).toBe("expired");
    expect(await booking(other.bookingReferenceId)).toMatchObject({ status: "confirmed" });
  });

  it("a payment that arrives after the hold lapsed still books the stay if the dates are free", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(88), day(89)), ctx);
    await db.execute(sql`UPDATE stays.bookings SET expires_at = now() - interval '1 second' WHERE reference_id = ${start.bookingReferenceId}`);
    await expireStaleRequests(db);
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "abandoned" });
    await pay(start.paymentReferenceId);
    expect(await booking(start.bookingReferenceId)).toMatchObject({ status: "confirmed" });
  });

  it("paying twice for one booking returns the second payment", async () => {
    const first = await startCheckout(guestOf(guest2), instantStay, details(day(92), day(93)), ctx);
    const second = await resumeCheckout(guestOf(guest2), first.bookingReferenceId);
    await pay(first.paymentReferenceId);
    await pay(second.paymentReferenceId);
    expect(await payment(first.paymentReferenceId)).toMatchObject({ status: "captured", unwanted: false });
    expect(await payment(second.paymentReferenceId)).toMatchObject({ status: "refunded", unwanted: true });
    const payouts = await one<Row>(sql`SELECT count(*)::int AS n FROM finance.payouts WHERE booking_id = (SELECT id FROM stays.bookings WHERE reference_id = ${first.bookingReferenceId})`);
    expect(payouts.n).toBe(1);
  });
});

describe("Trustbrick's Payments page", () => {
  it("only staff with payments permissions see it and act on it", async () => {
    expect(await code(listPayments(host, { tab: "all" }, 1))).toBe("FORBIDDEN");
    const list = await listPayments(ops, { tab: "all" }, 1);
    expect(list.total).toBeGreaterThan(5);
    expect(list.counts.held).toBeGreaterThanOrEqual(0);
    const support = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
    expect(await code(listPayments(support, { tab: "refunds" }, 1))).toBe("OK");
    expect(await code(holdPayout(support, "PYT-00000000", "A reason long enough.", ctx))).toBe("FORBIDDEN");
  });

  it("refunds part of a payment, holds and releases a payout", async () => {
    const start = await startCheckout(guestOf(guest), instantStay, details(day(96), day(97)), ctx);
    await pay(start.paymentReferenceId);
    expect(await code(adminRefund(ops, start.paymentReferenceId, { amount: 99999, reason: "Goodwill for the broken geyser." }, ctx))).toBe("VALIDATION_ERROR");
    const refund = await adminRefund(ops, start.paymentReferenceId, { amount: 1000, reason: "Goodwill for the broken geyser." }, ctx);
    expect(refund.amount).toBe(1000);
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ gross: "4800.00" });

    const po = await payoutOf(start.bookingReferenceId);
    await holdPayout(ops, String(po.reference_id), "Guest complaint being looked into.", ctx);
    await db.execute(sql`UPDATE finance.payouts SET release_at = now() - interval '1 minute' WHERE id = ${String(po.id)}`);
    await settlePayments();
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "on_hold" });
    await releasePayout(ops, String(po.reference_id), ctx);
    expect(await payoutOf(start.bookingReferenceId)).toMatchObject({ status: "paid" });
    // Once paid out, refunds can't come out of the host's share.
    expect(await code(adminRefund(ops, start.paymentReferenceId, { amount: 100, reason: "Another goodwill refund." }, ctx))).toBe("CONFLICT");
  });

  it("reconciliation finds nothing wrong", async () => {
    expect(await reconcilePayments()).toMatchObject({ flagged: 0 });
  });
});

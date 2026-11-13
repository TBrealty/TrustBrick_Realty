import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { OrderState, PaymentDriver, ProviderEvent } from "./driver";
import { ProviderError } from "./driver";

/**
 * A stand-in payment provider for development and tests. It behaves like Cashfree where it
 * matters (orders, holds, splits, refunds, vendor accounts, signed webhooks), but no money moves.
 * Its checkout is a page on this site (/pay/test/…) where you choose what happens.
 *
 * Never available on the live site: see lib/payments/index.ts.
 */

const secret = () => createHmac("sha256", env.BETTER_AUTH_SECRET).update("fake-payments-webhook").digest("hex");
const token = (n = 10) => randomBytes(n).toString("hex").toUpperCase();

/** Signs a webhook the way Cashfree does: HMAC-SHA256 over timestamp + body, base64. */
export function signFakeWebhook(body: string, timestamp: string) {
  return createHmac("sha256", secret()).update(timestamp + body).digest("base64");
}

/** Bank-account numbers ending in 0000 fail verification, to try that path. */
const FAILING_ACCOUNT = /0000$/;

export const fakeDriver: PaymentDriver = {
  name: "fake",

  async createOrder(input) {
    if (input.amount <= 0) throw new ProviderError("amount must be positive", "That amount can't be paid.", false);
    return { providerOrderId: input.orderId, sessionId: `session_${token()}` };
  },

  checkout(providerOrderId, sessionId) {
    return { kind: "redirect", url: `/pay/test/${encodeURIComponent(providerOrderId)}?session=${encodeURIComponent(sessionId)}` };
  },

  async getOrder(providerOrderId) {
    // The fake provider's record of an order is our own: it only ever changes through its events.
    const { rows } = await db.execute(sql`SELECT status, amount, provider_payment_id, method, failure_reason FROM finance.payments WHERE provider_order_id = ${providerOrderId}`);
    const r = rows[0] as Record<string, unknown> | undefined;
    if (!r) throw new ProviderError(`order ${providerOrderId} not found`, "That payment wasn't found.", false);
    const map: Record<string, OrderState> = { created: "open", authorized: "authorized", captured: "paid", partially_refunded: "paid", refunded: "paid", failed: "failed", voided: "voided" };
    return {
      state: map[String(r.status)] ?? "open",
      amount: Number(r.amount),
      paymentId: (r.provider_payment_id as string) ?? null,
      method: (r.method as string) ?? null,
      failureReason: (r.failure_reason as string) ?? null,
    };
  },

  async capture() {},
  async voidAuthorization() {},

  async refund(input) {
    if (input.amount <= 0) throw new ProviderError("refund amount must be positive", "That refund amount isn't valid.", false);
    return { providerRefundId: `fake_refund_${token(6)}`, state: "processed" };
  },

  async releaseToVendor() {
    return { transferId: `fake_transfer_${token(6)}`, state: "paid", utr: `FAKEUTR${token(5)}` };
  },

  async createVendor(input) {
    if (input.bank && FAILING_ACCOUNT.test(input.bank.accountNumber)) {
      return { vendorId: input.vendorId, status: "action_required", reason: "The bank couldn't verify this account: the name on it doesn't match." };
    }
    return { vendorId: input.vendorId, status: "active", reason: null };
  },

  async getVendor(vendorId) {
    const { rows } = await db.execute(sql`SELECT status, status_reason FROM finance.payout_accounts WHERE provider_vendor_id = ${vendorId}`);
    const r = rows[0] as Record<string, unknown> | undefined;
    return { status: (r?.status as "active") ?? "pending", reason: (r?.status_reason as string) ?? null };
  },

  verifyWebhook(rawBody, headers) {
    const timestamp = headers.get("x-webhook-timestamp") ?? "";
    const given = headers.get("x-webhook-signature") ?? "";
    const expected = signFakeWebhook(rawBody, timestamp);
    return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  },

  parseWebhook(rawBody) {
    return JSON.parse(rawBody) as ProviderEvent;
  },
};

/** What a person can choose on the test checkout page. */
export const FAKE_OUTCOMES = {
  card: { label: "Pay by card", hint: "Goes through at once.", method: "card" },
  upi: { label: "Pay by UPI", hint: "Goes through at once.", method: "upi" },
  upi_slow: { label: "Pay by UPI, slowly", hint: "The confirmation arrives 10 seconds later, as UPI sometimes does.", method: "upi" },
  declined: { label: "Card declined", hint: "The bank refuses the payment.", method: "card" },
  dropped: { label: "Close without paying", hint: "As if the guest closed the payment window.", method: null },
} as const;
export type FakeOutcome = keyof typeof FAKE_OUTCOMES;

/** The webhook the fake provider sends for a choice, as raw body and headers. */
export function fakeWebhook(orderId: string, outcome: FakeOutcome, capture: "auto" | "manual", amount: number) {
  const o = FAKE_OUTCOMES[outcome];
  const event: ProviderEvent =
    outcome === "declined"
      ? { eventId: `evt_${token(8)}`, type: "PAYMENT_FAILED_WEBHOOK", kind: "payment_failed", orderId, method: o.method, failureReason: "Your bank declined the payment." }
      : outcome === "dropped"
        ? { eventId: `evt_${token(8)}`, type: "PAYMENT_USER_DROPPED_WEBHOOK", kind: "payment_dropped", orderId, failureReason: "The payment window was closed before paying." }
        : {
            eventId: `evt_${token(8)}`,
            type: "PAYMENT_SUCCESS_WEBHOOK",
            kind: capture === "manual" ? "payment_authorized" : "payment_succeeded",
            orderId,
            paymentId: `fake_pay_${token(6)}`,
            method: o.method,
            amount,
          };
  const body = JSON.stringify(event);
  const timestamp = String(Date.now());
  return { body, headers: new Headers({ "content-type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-signature": signFakeWebhook(body, timestamp) }) };
}

import type { PaymentProvider, PayoutAccountStatus } from "@/lib/vocab";

/**
 * What Trustbrick needs from a payment provider. Cashfree (Payment Gateway with Easy Split and
 * pre-authorisation) is the real one; the fake driver acts like it for development and tests.
 *
 * The rules every driver follows:
 * - Our payment reference (PAY-…) is the provider's order ID, our refund reference (RFD-…) its
 *   refund ID, so a repeated call can't charge or refund twice.
 * - A payment counts only once the provider says so: by a signed webhook, or by asking its API.
 * - The host's share of each payment is split to their vendor account when the order is made,
 *   and held there until we release it, a day after check-in.
 */

export type OrderState = "open" | "authorized" | "paid" | "failed" | "expired" | "voided";

export type CreateOrder = {
  /** Our payment reference. */
  orderId: string;
  amount: number;
  /** auto: taken at once. manual: held (card or UPI), taken or released later. */
  capture: "auto" | "manual";
  customer: { id: string; name: string; email: string; phone: string };
  /** Where the guest lands after paying, with ?payment=<orderId>. */
  returnUrl: string;
  notifyUrl: string;
  expiresAt: Date;
  /** The host's share, held for their vendor account. */
  split: { vendorId: string; amount: number } | null;
  note: string;
};

/** How the browser or app opens the provider's checkout. */
export type Checkout = { kind: "redirect"; url: string } | { kind: "cashfree"; sessionId: string; mode: "sandbox" | "production" };

export type OrderView = { state: OrderState; amount: number; paymentId: string | null; method: string | null; failureReason: string | null };

export type VendorInput = {
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  pan: string;
  bank?: { holder: string; accountNumber: string; ifsc: string };
  upi?: { holder: string; vpa: string };
};

/** A webhook, reduced to what we act on. */
export type ProviderEvent = {
  eventId: string;
  type: string;
  kind:
    | "payment_succeeded"
    | "payment_authorized"
    | "payment_failed"
    | "payment_dropped"
    | "refund_processed"
    | "refund_failed"
    | "transfer_paid"
    | "transfer_failed"
    | "vendor_status"
    | "ignored";
  orderId?: string;
  paymentId?: string;
  method?: string | null;
  amount?: number;
  failureReason?: string | null;
  refundId?: string;
  providerRefundId?: string;
  /** Our payout reference (PYT-…), echoed back on a transfer event. */
  payoutId?: string;
  utr?: string | null;
  vendorId?: string;
  vendorStatus?: PayoutAccountStatus;
  vendorReason?: string | null;
};

export interface PaymentDriver {
  readonly name: PaymentProvider;
  createOrder(input: CreateOrder): Promise<{ providerOrderId: string; sessionId: string }>;
  /** How to open checkout for an order created above. */
  checkout(providerOrderId: string, sessionId: string): Checkout;
  getOrder(providerOrderId: string): Promise<OrderView>;
  /** Takes a held payment. */
  capture(providerOrderId: string, amount: number): Promise<void>;
  /** Releases a held payment. */
  voidAuthorization(providerOrderId: string): Promise<void>;
  /** `vendorShare`: how much of the refund comes out of the host's held share. */
  refund(input: { providerOrderId: string; refundId: string; amount: number; vendorShare: number; vendorId: string | null; reason: string }): Promise<{
    providerRefundId: string;
    state: "pending" | "processed";
  }>;
  /** Lets the host's held share settle to their account now. */
  releaseToVendor(input: { providerOrderId: string; vendorId: string; amount: number; payoutId: string }): Promise<{ transferId: string; state: "processing" | "paid"; utr: string | null }>;
  /** Registers (or updates) a host's payout account. The provider verifies the bank account and KYC. */
  createVendor(input: VendorInput): Promise<{ vendorId: string; status: PayoutAccountStatus; reason: string | null }>;
  getVendor(vendorId: string): Promise<{ status: PayoutAccountStatus; reason: string | null }>;
  /** Checks a webhook's signature. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(rawBody: string): ProviderEvent;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** Safe to show a person. */
    readonly publicMessage = "The payment provider didn't respond. Try again in a minute.",
    /** True when trying again later may work. */
    readonly retryable = true,
  ) {
    super(message);
  }
}

import "server-only";
import { env } from "@/lib/env";
import type { PaymentProvider } from "@/lib/vocab";
import type { PaymentDriver } from "./driver";
import { fakeDriver } from "./fake";

/**
 * Which payment provider this server uses: PAYMENTS_DRIVER = "cashfree" or "fake".
 *
 * - Development and tests use the fake one unless told otherwise.
 * - The live site uses Cashfree, with CASHFREE_APP_ID, CASHFREE_SECRET_KEY and CASHFREE_ENV in
 *   the server's .env. Until those are set, online payments can't be switched on.
 * - The fake driver never runs on a public https address: anyone could "pay" with it.
 */
export function paymentDriver(): PaymentDriver | null {
  const chosen = (process.env.PAYMENTS_DRIVER ?? (env.NODE_ENV === "production" ? "" : "fake")).trim().toLowerCase();
  if (chosen === "fake") return fakeAllowed() ? fakeDriver : null;
  if (chosen === "cashfree") return null; // The Cashfree driver is added once the account is set up.
  return null;
}

export function driverFor(provider: PaymentProvider): PaymentDriver | null {
  const d = paymentDriver();
  return d && d.name === provider ? d : null;
}

/** Why online payments can't be switched on here, or null when they can. */
export function paymentsUnavailableReason(): string | null {
  if (paymentDriver()) return null;
  const chosen = (process.env.PAYMENTS_DRIVER ?? "").trim().toLowerCase();
  if (chosen === "fake") return "The test payment provider only runs on a development machine.";
  if (chosen === "cashfree") return "Cashfree isn't connected yet.";
  return "No payment provider is set up on this server (PAYMENTS_DRIVER).";
}

function fakeAllowed() {
  const url = new URL(env.BETTER_AUTH_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".test");
  return local || env.NODE_ENV === "test";
}

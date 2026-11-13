import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { env } from "@/lib/env";
import { startCheckout } from "@/lib/services/stays/payments";

/**
 * Pay for a stay (when online payment is on): `{ checkIn, checkOut, adults, children?, pets?, name,
 * phone, message?, agree: true }`. Holds the booking (an instant-book stay's dates for 15 minutes)
 * and opens an order at the payment provider for the server's total. The app then opens checkout:
 * `checkout.kind = "cashfree"` with the provider's SDK and `sessionId`, or `"redirect"` in a browser
 * at `checkout.url` (the test provider, in development). Afterwards it polls GET /payments/{ref}.
 */
export const POST = apiRoute<{ ref: string }>("v1.stays.checkout", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const body = await readJson(request, z.record(z.string(), z.unknown()));
  const start = await startCheckout({ userId: person!.userId, email: person!.email }, params.ref, body, requestContext);
  const checkout = start.checkout.kind === "redirect" ? { ...start.checkout, url: new URL(start.checkout.url, env.BETTER_AUTH_URL).toString() } : start.checkout;
  return created({ ...start, checkout });
});

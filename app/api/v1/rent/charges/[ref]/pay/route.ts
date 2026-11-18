import { apiRoute, created } from "@/lib/api/http";
import { env } from "@/lib/env";
import { startRentCheckout } from "@/lib/services/rent/payments";

/** Pay a month's rent (RNT-): opens an order at the provider. Open `checkout`, then poll GET /rent/payments/{paymentReferenceId}. */
export const POST = apiRoute<{ ref: string }>("v1.rent.pay", { auth: "user" }, async ({ params, person }) => {
  const start = await startRentCheckout({ userId: person!.userId, email: person!.email, name: person!.name }, params.ref);
  const checkout = start.checkout.kind === "redirect" ? { ...start.checkout, url: new URL(start.checkout.url, env.BETTER_AUTH_URL).toString() } : start.checkout;
  return created({ ...start, checkout });
});

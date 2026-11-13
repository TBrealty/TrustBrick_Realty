import { apiRoute, created } from "@/lib/api/http";
import { env } from "@/lib/env";
import { resumeCheckout } from "@/lib/services/stays/payments";

/** Pay again for a booking whose payment failed or wasn't finished, while its dates are held. Same answer as POST /listings/{ref}/checkout. */
export const POST = apiRoute<{ ref: string }>("v1.trips.checkout", { auth: "user" }, async ({ params, person }) => {
  const start = await resumeCheckout({ userId: person!.userId, email: person!.email }, params.ref);
  const checkout = start.checkout.kind === "redirect" ? { ...start.checkout, url: new URL(start.checkout.url, env.BETTER_AUTH_URL).toString() } : start.checkout;
  return created({ ...start, checkout });
});

import { apiRoute } from "@/lib/api/http";
import { checkoutStatus } from "@/lib/services/stays/payments";

/**
 * How a payment went, for the app's result screen: `state` is confirming, booked, requested,
 * failed (try again while `holdExpiresAt` lasts) or expired. While confirming, the server asks the
 * provider directly, so polling every couple of seconds settles it.
 */
export const GET = apiRoute<{ ref: string }>("v1.payments.status", { auth: "user" }, async ({ params, person }) => checkoutStatus(person!.userId, params.ref));

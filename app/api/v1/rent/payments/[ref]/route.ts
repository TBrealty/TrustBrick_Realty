import { apiRoute } from "@/lib/api/http";
import { rentCheckoutStatus } from "@/lib/services/rent/payments";

/** How a rent payment (RPY-) went: confirming, paid, failed or returned. While confirming, the server asks the provider, so polling settles it. */
export const GET = apiRoute<{ ref: string }>("v1.rent.payment", { auth: "user" }, async ({ params, person }) => rentCheckoutStatus(person!.userId, params.ref));

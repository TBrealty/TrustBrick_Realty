import { apiRoute } from "@/lib/api/http";
import { getBookingForActor } from "@/lib/services/stays/bookings";

/** One booking, with the actions the host can take now (`actions`) and the guest's contact once agreed. */
export const GET = apiRoute<{ ref: string }>("v1.partner.booking", { auth: "user" }, async ({ actor, params }) => getBookingForActor(await actor(), params.ref));

import { apiRoute } from "@/lib/api/http";
import { hostConversationForBooking } from "@/lib/services/stays/messages";

/** The conversation with a booking's guest (started if there isn't one): `{ referenceId }`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.booking_conversation", { auth: "user" }, async ({ actor, params, requestContext }) => ({
  referenceId: await hostConversationForBooking(await actor(), params.ref, requestContext),
}));

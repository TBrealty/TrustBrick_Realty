import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { cancelTrip, getTrip } from "@/lib/services/stays/bookings";
import { tripMoney } from "@/lib/services/stays/payments";

/**
 * Cancels a booking request or a booking, under the stay's cancellation policy: `{ reason? }`.
 * Answers with the trip as it is now; `refund` says what's coming back (paid online).
 */
export const POST = apiRoute<{ ref: string }>("v1.trips.cancel", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const { reason } = await readJson(request, z.object({ reason: z.string().max(1000).optional() }));
  const p = person!;
  const result = await cancelTrip({ kind: "person", userId: p.userId, referenceId: p.referenceId, role: "guest" }, params.ref, reason ?? "", requestContext);
  const trip = await getTrip(p.userId, params.ref);
  return { ...trip, ...(await tripMoney(p.userId, trip.referenceId)), refund: result.refund };
});

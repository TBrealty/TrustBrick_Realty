import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { cancelTrip, getTrip } from "@/lib/services/stays/bookings";

/** Cancels a booking request or a booking, under the stay's cancellation policy: `{ reason? }`. */
export const POST = apiRoute<{ ref: string }>("v1.trips.cancel", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const { reason } = await readJson(request, z.object({ reason: z.string().max(1000).optional() }));
  const p = person!;
  await cancelTrip({ kind: "person", userId: p.userId, referenceId: p.referenceId, role: "guest" }, params.ref, reason ?? "", requestContext);
  return getTrip(p.userId, params.ref);
});

import { apiRoute } from "@/lib/api/http";
import { getTrip } from "@/lib/services/stays/bookings";
import { tripMoney } from "@/lib/services/stays/payments";

/**
 * One booking. The address and the host's phone appear once the booking is confirmed. Paid online,
 * it also has `payment` (status, refunds, whether there's a receipt), `cancel` (what cancelling now
 * would return), `timeline` (the policy's dated steps) and `pendingPayment` (an unfinished checkout).
 */
export const GET = apiRoute<{ ref: string }>("v1.trips.detail", { auth: "user" }, async ({ params, person }) => {
  const trip = await getTrip(person!.userId, params.ref);
  return { ...trip, ...(await tripMoney(person!.userId, trip.referenceId)) };
});

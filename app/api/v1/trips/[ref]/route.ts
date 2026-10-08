import { apiRoute } from "@/lib/api/http";
import { getTrip } from "@/lib/services/stays/bookings";

/** One booking. The address and the host's phone appear once the booking is confirmed. */
export const GET = apiRoute<{ ref: string }>("v1.trips.detail", { auth: "user" }, async ({ params, person }) => getTrip(person!.userId, params.ref));

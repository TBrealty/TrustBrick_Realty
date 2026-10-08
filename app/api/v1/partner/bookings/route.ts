import { apiRoute, rawParams } from "@/lib/api/http";
import { parsePage } from "@/lib/services/pagination";
import { bookingFilters, listBookingsForActor } from "@/lib/services/stays/bookings";

/** Stay bookings for the host's listings: `?group=requests|upcoming|past|cancelled|all`, with counts per group. */
export const GET = apiRoute("v1.partner.bookings", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  return listBookingsForActor(await actor(), bookingFilters.parse(params), parsePage(params.page));
});

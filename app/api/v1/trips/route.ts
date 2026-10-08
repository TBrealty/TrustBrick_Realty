import { apiRoute } from "@/lib/api/http";
import { listTrips } from "@/lib/services/stays/bookings";

/** The person's stay bookings: upcoming first, then past. */
export const GET = apiRoute("v1.trips", { auth: "user" }, async ({ person }) => ({ items: await listTrips(person!.userId) }));

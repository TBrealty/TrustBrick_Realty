import { apiRoute } from "@/lib/api/http";
import { unavailableDates } from "@/lib/services/stays/bookings";

/** A stay's booked and blocked nights for the next eight months, for the date picker. No guest details. */
export const GET = apiRoute<{ ref: string }>("v1.stays.availability", { auth: "public" }, async ({ params }) => ({
  unavailable: await unavailableDates(params.ref),
}));

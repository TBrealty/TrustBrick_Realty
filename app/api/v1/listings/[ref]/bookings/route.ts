import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { createBooking } from "@/lib/services/stays/bookings";

/**
 * Requests (or, with instant book, books) a stay: `{ checkIn, checkOut, adults, children?, pets?,
 * name, phone, message?, agree: true }`. Checked and priced as on the website; the host is told.
 */
export const POST = apiRoute<{ ref: string }>("v1.stays.book", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const body = await readJson(request, z.record(z.string(), z.unknown()));
  return created(await createBooking({ userId: person!.userId, email: person!.email }, params.ref, body, requestContext));
});

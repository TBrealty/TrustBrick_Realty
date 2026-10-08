import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { quoteStay } from "@/lib/services/stays/bookings";

/**
 * What a stay costs for these dates and guests: `{ checkIn, checkOut, adults, children?, pets? }`
 * → the nightly prices and total, or `{ ok: false, message, field }` when the stay can't be had.
 */
export const POST = apiRoute<{ ref: string }>("v1.stays.quote", { auth: "public" }, async ({ request, params }) =>
  quoteStay(params.ref, await readJson(request, z.record(z.string(), z.unknown()))),
);

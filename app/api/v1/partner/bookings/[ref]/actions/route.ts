import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { getBookingForActor, transitionBooking } from "@/lib/services/stays/bookings";
import { isBookingAction } from "@/lib/stays/booking-lifecycle";

/** Accept, decline, check in, complete, no-show or cancel: `{ action, reason? }`. Returns the booking. */
export const POST = apiRoute<{ ref: string }>("v1.partner.booking_action", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const a = await actor();
  const { action, reason } = await readJson(request, z.object({ action: z.string(), reason: z.string().max(2000).optional() }));
  if (!isBookingAction(action)) throw new AppError("VALIDATION_ERROR", "Unknown action.");
  await transitionBooking(a, params.ref, action, reason ?? "", requestContext);
  return getBookingForActor(a, params.ref);
});

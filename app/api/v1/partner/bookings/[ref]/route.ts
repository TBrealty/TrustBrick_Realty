import { apiRoute } from "@/lib/api/http";
import { getBookingForActor } from "@/lib/services/stays/bookings";
import { bookingMoney } from "@/lib/services/stays/payments";

/**
 * One booking, with the actions the host can take now (`actions`), the guest's contact once agreed,
 * and, when the guest paid online, `money`: what they paid, commission and GST, what the host
 * receives, and the payout.
 */
export const GET = apiRoute<{ ref: string }>("v1.partner.booking", { auth: "user" }, async ({ actor, params }) => {
  const booking = await getBookingForActor(await actor(), params.ref);
  return { ...booking, money: await bookingMoney(booking.referenceId) };
});

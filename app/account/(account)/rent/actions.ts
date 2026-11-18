"use server";

import { getSession } from "@/lib/auth/session";
import { runPersonAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { type CheckoutStart, type RentCheckoutStatus, rentCheckoutStatus, startRentCheckout } from "@/lib/services/rent/payments";

/** Pay a month's rent: opens the provider's checkout; the browser then goes there. */
export async function payRentAction(chargeRef: string): Promise<ActionResult<CheckoutStart>> {
  return runPersonAction("rent.checkout", (person) => startRentCheckout({ userId: person!.userId, email: person!.email, name: person!.name }, String(chargeRef)));
}

/** The result screen asks how a rent payment went. */
export async function rentStatusAction(paymentRef: string): Promise<RentCheckoutStatus | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    return await rentCheckoutStatus(session.user.id, String(paymentRef));
  } catch {
    return null;
  }
}

"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { formObject, runPersonAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { log } from "@/lib/log";
import { paymentDriver } from "@/lib/payments";
import { FAKE_OUTCOMES, type FakeOutcome, fakeWebhook } from "@/lib/payments/fake";
import { type CheckoutStart, type CheckoutStatus, checkoutStatus, receiveWebhook, resumeCheckout, startCheckout } from "@/lib/services/stays/payments";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/** Pay: holds the booking and opens the provider's checkout. The browser then goes there. */
export async function startCheckoutAction(_p: ActionResult<CheckoutStart> | null, form: FormData): Promise<ActionResult<CheckoutStart>> {
  const ref = text(form, "ref");
  // No revalidation: refreshing this page now would unmount the form before it opens the checkout.
  return runPersonAction("stay.checkout", (person, ctx) => startCheckout({ userId: person!.userId, email: person!.email }, ref, formObject(form), ctx));
}

/** Pay again for a booking whose payment failed or was left unfinished, while its dates are held. */
export async function resumeCheckoutAction(bookingRef: string): Promise<ActionResult<CheckoutStart>> {
  return runPersonAction("stay.checkout_resume", (person) => resumeCheckout({ userId: person!.userId, email: person!.email }, String(bookingRef)));
}

/** The result screen asks how its payment went. */
export async function checkoutStatusAction(paymentRef: string): Promise<CheckoutStatus | null> {
  const session = await getSession();
  if (!session) return null;
  try {
    return await checkoutStatus(session.user.id, String(paymentRef));
  } catch {
    return null;
  }
}

/**
 * The test payment page's buttons (development only): the fake provider sends its signed webhook
 * through the same path a real one takes, then the guest is sent back like a real checkout would.
 */
export async function fakePayAction(form: FormData) {
  const session = await getSession();
  const driver = paymentDriver();
  const order = text(form, "order");
  const outcome = text(form, "outcome") as FakeOutcome;
  if (!session || driver?.name !== "fake" || !(outcome in FAKE_OUTCOMES)) redirect("/");
  const { rows } = await db.execute(sql`SELECT capture, amount, status FROM finance.payments WHERE provider_order_id = ${order} AND guest_user_id = ${session.user.id}`);
  const p = rows[0] as { capture: "auto" | "manual"; amount: string; status: string } | undefined;
  if (p && p.status === "created") {
    const hook = fakeWebhook(order, outcome, p.capture, Number(p.amount));
    const send = () => receiveWebhook("fake", hook.body, hook.headers).catch((e) => log.error("payments.fake_webhook_failed", { error: String(e) }));
    if (outcome === "upi_slow") setTimeout(send, 10_000);
    else await send();
  }
  redirect(`/pay/return?payment=${encodeURIComponent(order)}`);
}

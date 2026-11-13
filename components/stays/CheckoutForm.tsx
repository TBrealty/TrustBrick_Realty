"use client";

import { useEffect, useId, useState } from "react";
import { startCheckoutAction } from "@/app/(browse)/listings/payment-actions";
import { useFormAction } from "@/components/workspace/forms";
import type { ActionResult } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import type { Checkout } from "@/lib/payments/driver";

type Start = import("@/lib/services/stays/payments").CheckoutStart;

const fieldClass =
  "block w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-3 py-2.5 text-[0.9375rem] focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)]";

/** Opens the provider's checkout for an order the server just made. */
async function openCheckout(checkout: Checkout, paymentRef: string) {
  if (checkout.kind === "redirect") {
    window.location.assign(checkout.url);
    return;
  }
  // Cashfree's own checkout script, loaded only when paying.
  await new Promise<void>((resolve, reject) => {
    if ((window as unknown as { Cashfree?: unknown }).Cashfree) return resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The payment window didn't load."));
    document.head.appendChild(s);
  });
  const cashfree = (window as unknown as { Cashfree: (o: { mode: string }) => { checkout: (o: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> } }).Cashfree({
    mode: checkout.mode,
  });
  await cashfree.checkout({ paymentSessionId: checkout.sessionId, redirectTarget: "_self" });
  window.location.assign(`/pay/return?payment=${encodeURIComponent(paymentRef)}`);
}

/**
 * The guest's details, the agreement, and the Pay button. The amount is the server's: the button
 * shows it, but the order is made on the server from the dates alone.
 */
export function CheckoutForm(p: {
  referenceId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childCount: number;
  pets: boolean;
  total: number;
  instantBook: boolean;
  defaultName: string;
  defaultPhone: string;
  policyLabel: string;
}) {
  const id = useId();
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult<Start>>(startCheckoutAction);
  // The state the checkout window failed to open for, if it did.
  const [failedFor, setFailedFor] = useState<{ state: unknown; message: string } | null>(null);

  useEffect(() => {
    if (!state?.ok || !state.data) return;
    const data = state.data;
    openCheckout(data.checkout, data.paymentReferenceId).catch((e: unknown) => setFailedFor({ state, message: e instanceof Error ? e.message : "The payment window didn't open." }));
  }, [state]);

  const opening = failedFor && failedFor.state === state ? failedFor.message : null;
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);
  const busy = pending || Boolean(state?.ok && !opening);

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="ref" value={p.referenceId} />
      <input type="hidden" name="checkIn" value={p.checkIn} />
      <input type="hidden" name="checkOut" value={p.checkOut} />
      <input type="hidden" name="adults" value={p.adults} />
      <input type="hidden" name="children" value={p.childCount} />
      {p.pets && <input type="hidden" name="pets" value="on" />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className="mb-1 block text-[0.8125rem] font-medium">
            Name of the guest checking in
          </label>
          <input id={`${id}-name`} name="name" defaultValue={p.defaultName} autoComplete="name" className={fieldClass} required />
          {err("name") && <p className="mt-1.5 text-[0.8125rem] text-brick">{err("name")}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className="mb-1 block text-[0.8125rem] font-medium">
            Phone
          </label>
          <input id={`${id}-phone`} name="phone" type="tel" defaultValue={p.defaultPhone} autoComplete="tel" className={fieldClass} required />
          {err("phone") && <p className="mt-1.5 text-[0.8125rem] text-brick">{err("phone")}</p>}
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-msg`} className="mb-1 block text-[0.8125rem] font-medium">
          Message to the host {p.instantBook ? "(optional)" : ""}
        </label>
        <textarea id={`${id}-msg`} name="message" rows={3} maxLength={1000} className={fieldClass} placeholder="Who's coming, and what brings you here?" />
        {err("message") && <p className="mt-1.5 text-[0.8125rem] text-brick">{err("message")}</p>}
      </div>

      <label className="flex items-start gap-2.5 text-[0.875rem] leading-snug">
        <input type="checkbox" name="agree" className="mt-0.5 size-4 shrink-0 accent-ink" />
        <span>I agree to the house rules and the {p.policyLabel.toLowerCase()} cancellation policy above, and to Trustbrick&apos;s terms.</span>
      </label>
      {err("agree") && <p className="-mt-3 text-[0.8125rem] text-brick">{err("agree")}</p>}

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.875rem] text-brick">
          {state.message}
        </p>
      )}
      {opening && (
        <p role="alert" className="border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.875rem] text-brick">
          {opening} Your dates are still held; try again.
        </p>
      )}

      <button type="submit" className="btn btn-dark w-full sm:w-auto sm:min-w-64" disabled={busy} aria-busy={busy}>
        <span>{busy ? "Opening secure payment…" : `Pay ${formatMoney(p.total)}`}</span>
      </button>
      <p className="text-[0.8125rem] text-stone-deep">
        {p.instantBook
          ? "Paying confirms your stay. We hold these dates for you for 15 minutes while you pay."
          : "The host has 24 hours to accept. Card and UPI payments are held, not charged, until they do, and released if they don't."}{" "}
        Payments are processed securely by our payment partner; Trustbrick never sees your card details.
      </p>
    </form>
  );
}

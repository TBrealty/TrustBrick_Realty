"use client";

import { useState, useTransition } from "react";
import { resumeCheckoutAction } from "@/app/(browse)/listings/payment-actions";
import { formatMoney } from "@/lib/format";

/** Pays for a booking whose checkout wasn't finished, while its dates are still held. */
export function FinishPayment({ bookingRef, amount }: { bookingRef: string; amount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-dark btn-compact"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await resumeCheckoutAction(bookingRef);
            if (!r.ok || !r.data) return setError(r.ok ? "Something went wrong." : r.message);
            const c = r.data.checkout;
            if (c.kind === "redirect") window.location.assign(c.url);
          })
        }
      >
        <span>{pending ? "Opening…" : `Pay ${formatMoney(amount)}`}</span>
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[0.875rem] text-brick">
          {error}
        </p>
      )}
    </>
  );
}

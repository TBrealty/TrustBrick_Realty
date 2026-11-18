"use client";

import { useState, useTransition } from "react";
import { payRentAction } from "@/app/account/(account)/rent/actions";
import { formatMoney } from "@/lib/format";

/** Opens the payment provider's checkout for one month's rent. */
export function PayRentButton({ chargeRef, amount }: { chargeRef: string; amount: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pay = () =>
    start(async () => {
      setError(null);
      const r = await payRentAction(chargeRef);
      if (!r.ok || !r.data) {
        setError(r.ok ? "Something went wrong." : r.message);
        return;
      }
      const c = r.data.checkout;
      if (c.kind === "redirect") window.location.assign(c.url);
      else setError("Paying in the browser isn't ready yet. Please use the Trustbrick app.");
    });
  return (
    <div>
      <button type="button" onClick={pay} disabled={pending} className="btn btn-dark">
        <span>{pending ? "Opening…" : `Pay ${formatMoney(amount)}`}</span>
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[0.875rem] text-brick">
          {error}
        </p>
      )}
    </div>
  );
}

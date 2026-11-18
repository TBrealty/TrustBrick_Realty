"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { rentStatusAction } from "@/app/account/(account)/rent/actions";
import { formatDay, formatMoney } from "@/lib/format";
import type { RentCheckoutStatus } from "@/lib/services/rent/payments";
import { PayRentButton } from "./PayRentButton";

const METHOD: Record<string, string> = { card: "card", upi: "UPI", netbanking: "net banking", wallet: "wallet" };

/** Paid, didn't go through (try again), returned (paid twice), or still confirming (asks again every couple of seconds). */
export function RentPaymentResult({ initial }: { initial: RentCheckoutStatus }) {
  const [status, setStatus] = useState(initial);
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (status.state !== "confirming" || polls > 60) return;
    const t = setTimeout(async () => {
      const next = await rentStatusAction(status.paymentReferenceId);
      if (next) setStatus(next);
      setPolls((n) => n + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [status, polls]);

  const method = status.method ? (METHOD[status.method] ?? status.method) : null;
  const view = {
    paid: {
      tone: "border-sage bg-sage/10",
      mark: "✓",
      title: "Rent paid",
      lines: [`${formatMoney(status.amount)} for ${status.title}, due ${formatDay(status.dueDate)}${method ? `, paid by ${method}` : ""}.`, `Trustbrick pays it to ${status.landlordName}. Your receipt is ready.`],
    },
    failed: {
      tone: "border-brick bg-brick/6",
      mark: "!",
      title: "Payment didn't go through",
      lines: [status.failureReason ?? "The payment wasn't completed.", "You haven't been charged. You can try again."],
    },
    returned: {
      tone: "border-line-light bg-paper",
      mark: "↩",
      title: "This payment is being returned",
      lines: ["This month's rent was already paid, so this payment goes back to you in full, usually within 5–7 working days."],
    },
    confirming: {
      tone: "border-line-light bg-paper",
      mark: "",
      title: "Confirming your payment…",
      lines: [polls > 60 ? "This is taking longer than usual. We'll email you as soon as your bank confirms; you won't be charged twice." : "This usually takes a few seconds. Please don't pay again."],
    },
  }[status.state];

  return (
    <div className="mx-auto max-w-xl" aria-live="polite">
      <div className={`border-l-2 px-5 py-6 ${view.tone}`}>
        <p className="flex items-center gap-3">
          {status.state === "confirming" ? (
            <span className="size-6 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-ink text-[0.875rem] text-paper" aria-hidden>
              {view.mark}
            </span>
          )}
          <span className="display text-[1.75rem] leading-none">{view.title}</span>
        </p>
        {view.lines.map((l) => (
          <p key={l} className="mt-3 text-[0.9375rem] text-graphite">
            {l}
          </p>
        ))}
        <p className="mt-4 font-mono text-[0.8125rem] text-stone-deep">Payment {status.paymentReferenceId}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-start gap-3">
        {status.state === "failed" && <PayRentButton chargeRef={status.chargeReferenceId} amount={status.amount} />}
        {status.state === "paid" && (
          <Link href={`/account/rent/receipts/${status.paymentReferenceId}`} className="btn btn-dark">
            <span>View your receipt</span>
          </Link>
        )}
        <Link href="/account/rent" className="btn btn-ghost-dark">
          <span>Back to your rent</span>
        </Link>
      </div>
    </div>
  );
}

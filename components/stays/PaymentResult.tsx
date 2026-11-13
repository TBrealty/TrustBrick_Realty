"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { checkoutStatusAction, resumeCheckoutAction } from "@/app/(browse)/listings/payment-actions";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import type { CheckoutStatus } from "@/lib/services/stays/payments";

const METHOD: Record<string, string> = { card: "card", upi: "UPI", netbanking: "net banking", wallet: "wallet" };

/**
 * The four outcomes of paying: booked, request sent (held, not charged), failed (nothing charged,
 * try again while the dates are held), and confirming (no word from the provider yet: it asks again
 * every couple of seconds).
 */
export function PaymentResult({ initial }: { initial: CheckoutStatus }) {
  const [status, setStatus] = useState(initial);
  const [polls, setPolls] = useState(0);
  const [retrying, startRetry] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    if (status.state !== "confirming" || polls > 60) return;
    const t = setTimeout(async () => {
      const next = await checkoutStatusAction(status.paymentReferenceId);
      if (next) setStatus(next);
      setPolls((n) => n + 1);
    }, 2000);
    return () => clearTimeout(t);
  }, [status, polls]);

  const tryAgain = () =>
    startRetry(async () => {
      setRetryError(null);
      const r = await resumeCheckoutAction(status.bookingReferenceId);
      if (!r.ok || !r.data) {
        setRetryError(r.ok ? "Something went wrong." : r.message);
        return;
      }
      const c = r.data.checkout;
      if (c.kind === "redirect") window.location.assign(c.url);
      else window.location.assign(`/listings/${status.listingReferenceId}`);
    });

  const dates = `${formatDay(status.checkIn)} – ${formatDay(status.checkOut)}`;
  const method = status.method ? METHOD[status.method] ?? status.method : null;

  const view = {
    booked: {
      tone: "border-sage bg-sage/10",
      mark: "✓",
      title: "You're booked!",
      lines: [`${status.title}, ${dates}.`, `You paid ${formatMoney(status.amount)}${method ? ` by ${method}` : ""}. The address and the host's phone number are on your trip page, with your receipt.`],
    },
    requested: {
      tone: "border-amber bg-amber/10",
      mark: "…",
      title: "Request sent",
      lines: [
        `${status.hostName} has until ${status.requestExpiresAt ? formatDateTime(status.requestExpiresAt) : "tomorrow"} to accept ${dates}.`,
        `${formatMoney(status.amount)} is on hold${method ? ` on your ${method}` : ""}, not charged. It's taken only if they accept, and released in full if they don't.`,
      ],
    },
    failed: {
      tone: "border-brick bg-brick/6",
      mark: "!",
      title: "Payment didn't go through",
      lines: [
        status.failureReason ?? "The payment wasn't completed.",
        `You haven't been charged.${status.holdExpiresAt ? ` We're holding your dates until ${formatDateTime(status.holdExpiresAt)}.` : ""}`,
      ],
    },
    expired: {
      tone: "border-line-light bg-paper",
      mark: "–",
      title: "This booking wasn't completed",
      lines: ["The time to pay ran out, or the dates were taken. If any money left your account, it's returned in full within 5–7 working days."],
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
        <p className="mt-4 font-mono text-[0.8125rem] text-stone-deep">
          Booking {status.bookingReferenceId} · Payment {status.paymentReferenceId}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {status.state === "failed" && (
          <button type="button" onClick={tryAgain} disabled={retrying} className="btn btn-dark">
            <span>{retrying ? "Opening…" : `Try again · ${formatMoney(status.amount)}`}</span>
          </button>
        )}
        {status.state === "expired" ? (
          <Link href={`/listings/${status.listingReferenceId}`} className="btn btn-dark">
            <span>Back to the stay</span>
          </Link>
        ) : (
          <Link href={`/account/trips/${status.bookingReferenceId}`} className={status.state === "failed" ? "btn btn-light" : "btn btn-dark"}>
            <span>View your trip</span>
          </Link>
        )}
      </div>
      {retryError && (
        <p role="alert" className="mt-3 text-[0.875rem] text-brick">
          {retryError}
        </p>
      )}
    </div>
  );
}

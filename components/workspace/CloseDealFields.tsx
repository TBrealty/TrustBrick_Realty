"use client";

import { useId, useState } from "react";
import { useFieldError } from "@/components/workspace/forms";
import { CLOSE_OUTCOME_LABELS, computeCommission, describeRate } from "@/lib/commission/terms";
import type { DealContext } from "@/lib/services/commission";
import { CLOSE_OUTCOMES, type CloseOutcome } from "@/lib/vocab";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const digits = (v: string) => Number(v.replace(/[^\d.]/g, ""));

/**
 * "How did it close?" for a sale, rental or lease being marked sold or rented out. A deal the
 * agent closed asks for the final price and the brokerage earned, and shows Trustbrick's
 * commission on it before they confirm. Field names match what transitionListing expects.
 * `errors` is for use outside an ActionForm, where field errors aren't in context.
 */
export function CloseDealFields({ deal, errors }: { deal: DealContext; errors?: Record<string, string> }) {
  const id = useId();
  const [outcome, setOutcome] = useState<CloseOutcome | "">("");
  const [price, setPrice] = useState(deal.price ? String(deal.price) : "");
  const [brokerage, setBrokerage] = useState(deal.suggestedBrokerage !== null ? String(deal.suggestedBrokerage) : "");
  const fieldError = (name: string) => errors?.[name];
  const ctxOutcome = useFieldError("outcome");
  const ctxPrice = useFieldError("dealValue");
  const ctxBrokerage = useFieldError("brokerage");
  const err = { outcome: fieldError("outcome") ?? ctxOutcome, dealValue: fieldError("dealValue") ?? ctxPrice, brokerage: fieldError("brokerage") ?? ctxBrokerage };

  const byBrokerage = deal.rate.basis === "brokerage";
  const calc = outcome === "closed_deal" && digits(price) > 0 ? computeCommission({ basis: deal.rate.basis, percent: deal.rate.percent, dealValue: digits(price), brokerage: digits(brokerage), gstPercent: deal.gstPercent }) : null;
  const priceLabel = deal.purpose === "sale" ? "Final sale price (₹)" : "Final monthly rent (₹)";

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium">
          How did it close? <span className="text-brick">*</span>
        </legend>
        <div className="space-y-2">
          {CLOSE_OUTCOMES.map((o) => (
            <label key={o} className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-line-light p-2.5 has-checked:border-ink">
              <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-0.5 accent-ink" />
              <span>
                <span className="block text-[0.8125rem] font-medium">{CLOSE_OUTCOME_LABELS[o].label}</span>
                <span className="block text-[0.75rem] text-stone-deep">{CLOSE_OUTCOME_LABELS[o].hint}</span>
              </span>
            </label>
          ))}
        </div>
        {err.outcome && <p className="mt-1.5 text-[0.75rem] text-brick">{err.outcome}</p>}
      </fieldset>

      {outcome === "closed_deal" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-price`} className="mb-1.5 block text-[0.8125rem] font-medium">
                {priceLabel} <span className="text-brick">*</span>
              </label>
              <input id={`${id}-price`} name="dealValue" inputMode="numeric" className="winput" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={err.dealValue ? true : undefined} />
              {err.dealValue && <p className="mt-1.5 text-[0.75rem] text-brick">{err.dealValue}</p>}
            </div>
            {byBrokerage && (
              <div>
                <label htmlFor={`${id}-brokerage`} className="mb-1.5 block text-[0.8125rem] font-medium">
                  Brokerage you earned (₹) <span className="text-brick">*</span>
                </label>
                <input id={`${id}-brokerage`} name="brokerage" inputMode="numeric" className="winput" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} aria-invalid={err.brokerage ? true : undefined} />
                <p className={`mt-1.5 text-[0.75rem] ${err.brokerage ? "text-brick" : "text-stone-deep"}`}>{err.brokerage ?? "From both sides, in total. 0 if none."}</p>
              </div>
            )}
          </div>
          <div className="rounded-[3px] bg-paper p-3 text-[0.8125rem]" aria-live="polite">
            <p className="text-stone-deep">Trustbrick&apos;s commission: {describeRate(deal.purpose, deal.rate)}</p>
            {calc ? (
              <p className="mt-1">
                <span className="font-medium text-ink">{inr(calc.total)}</span>
                {deal.gstPercent > 0 && (
                  <span className="text-stone-deep">
                    {" "}
                    ({inr(calc.amount)} + {inr(calc.gst)} GST)
                  </span>
                )}
                <span className="text-stone-deep">, added to your commission account.</span>
              </p>
            ) : (
              <p className="mt-1 text-stone-deep">Enter the final {deal.purpose === "sale" ? "price" : "rent"} to see it.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

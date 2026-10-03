"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { maxLoanToValue, summarise, yearlySchedule } from "@/lib/buy/emi";
import { formatPrice } from "@/lib/format";
import { RangeField, writeQuery } from "@/components/tools/fields";

const inr = (v: number) => formatPrice(v, { compact: false });
const short = (v: number) => formatPrice(v);

export type EmiStart = { price: number; down: number; rate: number; years: number };

export function EmiCalculator({ start }: { start: EmiStart }) {
  const [price, setPrice] = useState(start.price);
  const [down, setDown] = useState(start.down);
  const [rate, setRate] = useState(start.rate);
  const [years, setYears] = useState(start.years);

  const s = useMemo(() => summarise(price, Math.min(down, price), rate, years), [price, down, rate, years]);
  const schedule = useMemo(() => yearlySchedule(s.loan, rate, years), [s.loan, rate, years]);
  const interestShare = s.totalPaid > 0 ? s.totalInterest / s.totalPaid : 0;
  const ltvPct = Math.round(maxLoanToValue(price) * 100);

  useEffect(() => {
    const t = setTimeout(() => writeQuery({ price, down, rate, years }), 400);
    return () => clearTimeout(t);
  }, [price, down, rate, years]);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      <form aria-label="Your loan" onSubmit={(e) => e.preventDefault()} className="space-y-7">
        <RangeField label="Property price" value={price} onChange={setPrice} min={5_00_000} max={20_00_00_000} step={50_000} prefix="₹" hint={short(price)} />
        <RangeField
          label="Down payment"
          value={down}
          onChange={setDown}
          min={0}
          max={price}
          step={10_000}
          prefix="₹"
          hint={`${short(down)} · ${price > 0 ? Math.round((Math.min(down, price) / price) * 100) : 0}% of the price`}
        />
        <RangeField label="Interest rate" value={rate} onChange={setRate} min={5} max={15} step={0.05} suffix="% a year" />
        <RangeField label="Loan tenure" value={years} onChange={setYears} min={1} max={30} step={1} suffix={years === 1 ? "year" : "years"} />
        <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
          Rates and terms vary by lender and by your credit profile. This is an estimate, not a loan offer.
        </p>
      </form>

      <section aria-labelledby="emi-result" className="self-start border border-line-light bg-card p-6 sm:p-8 lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)]">
        <h2 id="emi-result" className="eyebrow text-stone-deep">
          Your monthly EMI
        </h2>
        <p className="display mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-none tabular-nums" aria-live="polite">
          {inr(s.emi)}
        </p>
        <p className="mt-2 text-[0.875rem] text-stone-deep">
          for {years} {years === 1 ? "year" : "years"} at {rate}%
        </p>

        {s.aboveLtv && (
          <p role="status" className="mt-5 border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.875rem] leading-relaxed">
            Banks can lend up to {ltvPct}% on a home at this price, so you&apos;d need at least <strong className="font-medium">{inr(s.minDownPayment)}</strong> as a down
            payment.{" "}
            <button type="button" onClick={() => setDown(s.minDownPayment)} className="font-medium underline">
              Use that
            </button>
          </p>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-y-3 border-t border-line-light pt-5 text-[0.9375rem] sm:grid-cols-3 sm:gap-x-4">
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Loan amount</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{short(s.loan)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Total interest</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{short(s.totalInterest)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Total you repay</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{short(s.totalPaid)}</dd>
          </div>
        </dl>

        {s.totalPaid > 0 && (
          <div className="mt-6">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
              <span className="bg-ink" style={{ width: `${(1 - interestShare) * 100}%` }} />
              <span className="bg-brick" style={{ width: `${interestShare * 100}%` }} />
            </div>
            <p className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-graphite">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full bg-ink" />
                Principal {Math.round((1 - interestShare) * 100)}%
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full bg-brick" />
                Interest {Math.round(interestShare * 100)}%
              </span>
            </p>
          </div>
        )}

        {schedule.length > 0 && (
          <details className="group mt-6 border-t border-line-light pt-4">
            <summary className="cursor-pointer text-[0.9375rem] font-medium marker:text-stone-deep">Year by year</summary>
            <div className="mt-3 max-h-80 overflow-auto">
              <table className="w-full text-right text-[0.8125rem] tabular-nums">
                <caption className="sr-only">What you pay each year and what is left</caption>
                <thead className="sticky top-0 bg-card text-stone-deep">
                  <tr>
                    <th scope="col" className="py-2 text-left font-normal">
                      Year
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      Principal
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      Interest
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      Left to pay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.year} className="border-t border-line-light">
                      <th scope="row" className="py-1.5 text-left font-normal">
                        {row.year}
                      </th>
                      <td className="py-1.5">{short(row.principal)}</td>
                      <td className="py-1.5">{short(row.interest)}</td>
                      <td className="py-1.5">{short(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={`/buy/costs?price=${Math.round(price)}`} className="btn btn-dark btn-compact">
            <span>Add stamp duty and fees</span>
          </Link>
          <Link href={`/buy?max=${Math.round(price)}`} className="btn btn-ghost-dark btn-compact">
            <span>Homes up to {short(price)}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

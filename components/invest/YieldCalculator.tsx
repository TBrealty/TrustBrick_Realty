"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RangeField, writeQuery } from "@/components/tools/fields";
import { formatPrice } from "@/lib/format";
import { type YieldInput, rentalYield } from "@/lib/invest/yield";

const inr = (v: number) => formatPrice(v, { compact: false });
const pct = (v: number) => `${v.toFixed(2)}%`;

export function YieldCalculator({ start }: { start: YieldInput }) {
  const [v, setV] = useState<YieldInput>(start);
  const set = <K extends keyof YieldInput>(key: K) => (value: YieldInput[K]) => setV((s) => ({ ...s, [key]: value }));
  const r = useMemo(() => rentalYield(v), [v]);

  useEffect(() => {
    const t = setTimeout(
      () =>
        writeQuery({
          price: v.price,
          rent: v.monthlyRent,
          vacancy: v.vacancyMonths,
          maintenance: v.maintenanceMonthly,
          tax: v.propertyTaxYearly,
          other: v.otherYearly,
          acquisition: v.acquisitionPct,
        }),
      400,
    );
    return () => clearTimeout(t);
  }, [v]);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      <form aria-label="The property" onSubmit={(e) => e.preventDefault()} className="space-y-7">
        <RangeField label="Price" value={v.price} onChange={set("price")} min={5_00_000} max={50_00_00_000} step={50_000} prefix="₹" hint={formatPrice(v.price)} />
        <RangeField label="Monthly rent" value={v.monthlyRent} onChange={set("monthlyRent")} min={0} max={20_00_000} step={500} prefix="₹" hint={formatPrice(v.monthlyRent)} />
        <RangeField label="Empty months a year" value={v.vacancyMonths} onChange={set("vacancyMonths")} min={0} max={6} step={0.5} suffix="months" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <RangeField label="Maintenance you pay" value={v.maintenanceMonthly} onChange={set("maintenanceMonthly")} min={0} max={1_00_000} step={250} prefix="₹" suffix="a month" />
          <RangeField label="Property tax" value={v.propertyTaxYearly} onChange={set("propertyTaxYearly")} min={0} max={5_00_000} step={500} prefix="₹" suffix="a year" />
          <RangeField label="Repairs and insurance" value={v.otherYearly} onChange={set("otherYearly")} min={0} max={10_00_000} step={1_000} prefix="₹" suffix="a year" />
          <RangeField label="Buying costs" value={v.acquisitionPct} onChange={set("acquisitionPct")} min={0} max={15} step={0.5} suffix="% of the price" />
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
          Buying costs are stamp duty, registration and fees, usually 6–8% in the cities we cover. Use your own figures throughout: this works out a yield, it doesn&apos;t predict
          rents or prices.
        </p>
      </form>

      <section aria-labelledby="yield-result" className="self-start border border-line-light bg-card p-6 sm:p-8 lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)]">
        <h2 id="yield-result" className="eyebrow text-stone-deep">
          Net rental yield
        </h2>
        <p className="display mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-none tabular-nums" aria-live="polite">
          {pct(r.netYieldPct)}
        </p>
        <p className="mt-2 text-[0.875rem] text-stone-deep">
          a year, before tax · gross yield <strong className="font-medium text-ink">{pct(r.grossYieldPct)}</strong>
        </p>

        <table className="mt-6 w-full border-t border-line-light text-[0.9375rem]">
          <caption className="sr-only">A year&apos;s rent and costs</caption>
          <tbody>
            <tr>
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                Rent collected
                <span className="block text-[0.75rem] text-stone-deep">{12 - v.vacancyMonths} months a year</span>
              </th>
              <td className="py-2 text-right align-top tabular-nums">{inr(r.rentCollected)}</td>
            </tr>
            <tr>
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                Costs you pay
                <span className="block text-[0.75rem] text-stone-deep">Maintenance, property tax, repairs and insurance</span>
              </th>
              <td className="py-2 text-right align-top tabular-nums">− {inr(r.costs)}</td>
            </tr>
            <tr className="border-t border-line-light">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                Net rent a year
              </th>
              <td className="py-2 text-right font-medium tabular-nums">{inr(r.netIncome)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-4 grid grid-cols-1 gap-y-3 border-t border-line-light pt-5 text-[0.9375rem] sm:grid-cols-2 sm:gap-x-4">
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">What you pay, all in</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatPrice(r.investment)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Years of rent to earn it back</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{r.paybackYears === null ? "Never, at this rent" : `${r.paybackYears.toFixed(1)} years`}</dd>
          </div>
        </dl>

        <p className="mt-5 border-t border-line-light pt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          Gross yield is the year&apos;s rent over the price, the figure listings usually quote. Net yield takes off empty months and the costs you pay, over what you pay all in.
          Rental income is taxed at your slab rate after a 30% standard deduction; any appreciation or loss on the price is extra. General information, not investment advice.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/invest/guide" className="btn btn-dark btn-compact">
            <span>Investing guide</span>
          </Link>
          <Link href="/invest?min_yield=5" className="btn btn-ghost-dark btn-compact">
            <span>Declared yield 5% or more</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RangeField, writeQuery } from "@/components/tools/fields";
import { formatPrice } from "@/lib/format";
import { type CompareInput, comparePgAndFlat } from "@/lib/pg/compare";

const inr = (v: number) => formatPrice(v, { compact: false });

export function CompareCalculator({ start }: { start: CompareInput }) {
  const [v, setV] = useState<CompareInput>(start);
  const set = <K extends keyof CompareInput>(key: K) => (value: CompareInput[K]) => setV((s) => ({ ...s, [key]: value }));
  const r = useMemo(() => comparePgAndFlat(v), [v]);

  useEffect(() => {
    const t = setTimeout(
      () =>
        writeQuery({
          pg: v.pgRent,
          meals: v.pgMealsIncluded,
          extras: v.pgExtras,
          flat: v.flatRent,
          people: v.flatmates,
          food: v.foodPerPerson,
          utilities: v.flatUtilities,
          help: v.flatHelp,
        }),
      400,
    );
    return () => clearTimeout(t);
  }, [v]);

  const verdict =
    r.cheaperMonthly === "same"
      ? "They cost about the same each month."
      : `${r.cheaperMonthly === "pg" ? "The PG" : "The shared flat"} costs ${inr(r.monthlyDifference)} less a month.`;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <form aria-label="The PG" onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <h2 className="text-[1.25rem] font-medium">The PG</h2>
          <RangeField label="Rent for your bed" value={v.pgRent} onChange={set("pgRent")} min={3_000} max={40_000} step={250} prefix="₹" suffix="a month" />
          <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
            <input type="checkbox" checked={v.pgMealsIncluded} onChange={(e) => set("pgMealsIncluded")(e.target.checked)} className="size-4 accent-ink" />
            Meals are included
          </label>
          <RangeField label="Extras the PG charges" value={v.pgExtras} onChange={set("pgExtras")} min={0} max={10_000} step={100} prefix="₹" suffix="a month" />
          <RangeField label="Deposit" value={v.pgDepositMonths} onChange={set("pgDepositMonths")} min={0} max={3} step={1} suffix={v.pgDepositMonths === 1 ? "month's rent" : "months' rent"} />
        </form>

        <form aria-label="The shared flat" onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <h2 className="text-[1.25rem] font-medium">A shared flat</h2>
          <RangeField label="Rent for the whole flat" value={v.flatRent} onChange={set("flatRent")} min={5_000} max={2_00_000} step={500} prefix="₹" suffix="a month" />
          <RangeField label="People sharing, including you" value={v.flatmates} onChange={set("flatmates")} min={1} max={8} step={1} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <RangeField label="Utilities, whole flat" value={v.flatUtilities} onChange={set("flatUtilities")} min={0} max={20_000} step={250} prefix="₹" />
            <RangeField label="Cook or cleaner, whole flat" value={v.flatHelp} onChange={set("flatHelp")} min={0} max={30_000} step={500} prefix="₹" />
            <RangeField label="Maintenance, whole flat" value={v.flatMaintenance} onChange={set("flatMaintenance")} min={0} max={20_000} step={250} prefix="₹" />
            <RangeField label="Deposit" value={v.flatDepositMonths} onChange={set("flatDepositMonths")} min={0} max={12} step={1} suffix="months' rent" />
          </div>
        </form>
      </div>

      <div className="max-w-md">
        <RangeField label="Food per person, where it isn't included" value={v.foodPerPerson} onChange={set("foodPerPerson")} min={0} max={30_000} step={250} prefix="₹" suffix="a month" />
      </div>

      <section aria-labelledby="compare-result" className="border border-line-light bg-card p-6 sm:p-8">
        <h2 id="compare-result" className="eyebrow text-stone-deep">
          Your cost, per person
        </h2>
        <p className="mt-3 text-[1.25rem] font-medium" aria-live="polite">
          {verdict}
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {(
            [
              ["PG", r.pg],
              ["Shared flat", r.flat],
            ] as const
          ).map(([name, side]) => (
            <div key={name} className="border-t border-line-light pt-4">
              <p className="text-[0.875rem] text-stone-deep">{name}</p>
              <p className="display mt-1 text-[2.25rem] leading-none tabular-nums">{inr(side.monthly)}</p>
              <p className="mt-1 text-[0.8125rem] text-stone-deep">a month · {inr(side.upfront)} up front (deposit and first month)</p>
              <table className="mt-4 w-full text-[0.875rem]">
                <caption className="sr-only">{name}: monthly cost</caption>
                <tbody>
                  {side.lines.map((l) => (
                    <tr key={l.label}>
                      <th scope="row" className="py-1 pr-3 text-left font-normal text-graphite">
                        {l.label}
                      </th>
                      <td className="py-1 text-right tabular-nums">{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-6 border-t border-line-light pt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          Money isn&apos;t everything here. A PG is furnished, needs a shorter notice and comes with food and housekeeping; a flat gives you more privacy and your own kitchen, but
          needs furniture and an 11-month agreement. The flat&apos;s up-front share includes brokerage, if any.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/pg/checklist" className="btn btn-dark btn-compact">
            <span>PG checklist</span>
          </Link>
          <Link href={`/pg?max=${Math.round(v.pgRent)}`} className="btn btn-ghost-dark btn-compact">
            <span>PGs up to {formatPrice(v.pgRent)} a bed</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

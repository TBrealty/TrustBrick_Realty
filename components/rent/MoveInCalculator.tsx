"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { RangeField, writeQuery } from "@/components/tools/fields";
import { formatPrice } from "@/lib/format";
import { BROKERAGE_LABELS, type Brokerage, moveInCosts } from "@/lib/rent/move-in";

const inr = (v: number) => formatPrice(v, { compact: false });

export type MoveInStart = { rent: number; depositMonths: number; advanceMonths: number; brokerage: Brokerage; maintenance: number; agreement: number; moving: number; termMonths: number };

export function MoveInCalculator({ start }: { start: MoveInStart }) {
  const [rent, setRent] = useState(start.rent);
  const [depositMonths, setDeposit] = useState(start.depositMonths);
  const [advanceMonths, setAdvance] = useState(start.advanceMonths);
  const [brokerage, setBrokerage] = useState<Brokerage>(start.brokerage);
  const [maintenance, setMaintenance] = useState(start.maintenance);
  const [agreement, setAgreement] = useState(start.agreement);
  const [moving, setMoving] = useState(start.moving);
  const [termMonths, setTerm] = useState(start.termMonths);
  const id = useId();

  const r = useMemo(
    () => moveInCosts({ rent, depositMonths, advanceMonths, brokerage, maintenance, agreement, moving, termMonths }),
    [rent, depositMonths, advanceMonths, brokerage, maintenance, agreement, moving, termMonths],
  );

  useEffect(() => {
    const t = setTimeout(() => writeQuery({ rent, deposit: depositMonths, advance: advanceMonths, brokerage, maintenance, agreement, moving, term: termMonths }), 400);
    return () => clearTimeout(t);
  }, [rent, depositMonths, advanceMonths, brokerage, maintenance, agreement, moving, termMonths]);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      <form aria-label="The rental" onSubmit={(e) => e.preventDefault()} className="space-y-7">
        <RangeField label="Monthly rent" value={rent} onChange={setRent} min={3_000} max={3_00_000} step={500} prefix="₹" hint={formatPrice(rent)} />
        <RangeField
          label="Security deposit"
          value={depositMonths}
          onChange={setDeposit}
          min={0}
          max={12}
          step={1}
          suffix={depositMonths === 1 ? "month's rent" : "months' rent"}
          hint={inr(rent * depositMonths)}
        />
        <p className="-mt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          Customs vary: often two or three months in Hyderabad, Mumbai and Pune, and more in Bengaluru. Agree it in writing.
        </p>
        <fieldset>
          <legend className="text-[0.875rem] font-medium">Brokerage</legend>
          <div className="mt-2 space-y-1.5">
            {(Object.keys(BROKERAGE_LABELS) as Brokerage[]).map((b) => (
              <label key={b} className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
                <input type="radio" name={`${id}-brokerage`} checked={brokerage === b} onChange={() => setBrokerage(b)} className="size-4 accent-ink" />
                {BROKERAGE_LABELS[b]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <RangeField label="Rent in advance" value={advanceMonths} onChange={setAdvance} min={0} max={3} step={1} suffix={advanceMonths === 1 ? "month" : "months"} />
          <RangeField label="Agreement length" value={termMonths} onChange={setTerm} min={1} max={36} step={1} suffix="months" />
          <RangeField label="Maintenance you pay" value={maintenance} onChange={setMaintenance} min={0} max={25_000} step={250} prefix="₹" suffix="a month" />
          <RangeField label="Agreement and registration" value={agreement} onChange={setAgreement} min={0} max={25_000} step={250} prefix="₹" />
          <RangeField label="Packers and movers" value={moving} onChange={setMoving} min={0} max={1_00_000} step={1_000} prefix="₹" />
        </div>
      </form>

      <section aria-labelledby="movein-result" className="self-start border border-line-light bg-card p-6 sm:p-8 lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)]">
        <h2 id="movein-result" className="eyebrow text-stone-deep">
          Cash you need to move in
        </h2>
        <p className="display mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-none tabular-nums" aria-live="polite">
          {inr(r.upfront)}
        </p>
        <p className="mt-2 text-[0.875rem] text-stone-deep">
          of which <strong className="font-medium text-ink">{inr(r.refundable)}</strong> is a refundable deposit
        </p>

        <table className="mt-6 w-full border-t border-line-light text-[0.9375rem]">
          <caption className="sr-only">What you pay before moving in</caption>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.key}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {l.label}
                  <span className="block text-[0.75rem] text-stone-deep">{l.basis}</span>
                </th>
                <td className="py-2 text-right align-top tabular-nums">{inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 grid grid-cols-1 gap-y-3 border-t border-line-light pt-5 text-[0.9375rem] sm:grid-cols-2 sm:gap-x-4">
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Each month</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{inr(r.monthly)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Over {termMonths} months</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{inr(r.overTerm)}</dd>
          </div>
        </dl>

        <div className="mt-5 space-y-2 border-t border-line-light pt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          {r.tdsApplies && (
            <p className="text-ink">
              Rent above ₹50,000 a month: as an individual tenant you deduct 2% TDS from the rent and deposit it with the Income Tax Department (Form 141).
            </p>
          )}
          {r.panForHra && <p>Claiming HRA? You&apos;ll need rent receipts, and your landlord&apos;s PAN because the year&apos;s rent is over ₹1 lakh.</p>}
          <p>The deposit comes back when you leave, less anything the agreement allows for, such as unpaid bills or damage. Photograph the home when you move in.</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/rent/guide#agreement" className="btn btn-dark btn-compact">
            <span>What to put in the agreement</span>
          </Link>
          <Link href={`/rent?max=${Math.round(rent)}`} className="btn btn-ghost-dark btn-compact">
            <span>Homes up to {formatPrice(rent)} a month</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

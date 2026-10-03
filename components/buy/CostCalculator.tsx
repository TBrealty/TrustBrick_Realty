"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { AFFORDABLE_LIMIT, type Buyer, PLACE_OPTIONS, RATES_CHECKED, buyingCosts } from "@/lib/buy/costs";
import { formatPrice } from "@/lib/format";
import { RangeField, writeQuery } from "@/components/tools/fields";

const inr = (v: number) => formatPrice(v, { compact: false });
const short = (v: number) => formatPrice(v);

export type CostStart = { price: number; place: string; buyer: Buyer; underConstruction: boolean; affordable: boolean; brokeragePct: number; paperwork: number };

export function CostCalculator({ start }: { start: CostStart }) {
  const [price, setPrice] = useState(start.price);
  const [place, setPlace] = useState(start.place);
  const [buyer, setBuyer] = useState<Buyer>(start.buyer);
  const [underConstruction, setUnderConstruction] = useState(start.underConstruction);
  const [affordable, setAffordable] = useState(start.affordable);
  const [brokeragePct, setBrokeragePct] = useState(start.brokeragePct);
  const [paperwork, setPaperwork] = useState(start.paperwork);
  const id = useId();

  const r = useMemo(
    () => buyingCosts({ price, place, buyer, underConstruction, affordable, brokeragePct, paperwork }),
    [price, place, buyer, underConstruction, affordable, brokeragePct, paperwork],
  );
  const canBeAffordable = underConstruction && price <= AFFORDABLE_LIMIT;
  const concessionHere = place === "mumbai" || place === "pune";

  useEffect(() => {
    const t = setTimeout(
      () => writeQuery({ price, city: place, buyer: buyer === "woman" ? "woman" : undefined, uc: underConstruction, affordable: canBeAffordable && affordable, brokerage: brokeragePct, paperwork }),
      400,
    );
    return () => clearTimeout(t);
  }, [price, place, buyer, underConstruction, affordable, canBeAffordable, brokeragePct, paperwork]);

  const group = (g: "government" | "other") => r.lines.filter((l) => l.group === g);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      <form aria-label="The purchase" onSubmit={(e) => e.preventDefault()} className="space-y-7">
        <RangeField label="Property price" value={price} onChange={setPrice} min={5_00_000} max={20_00_00_000} step={50_000} prefix="₹" hint={short(price)} />

        <div>
          <label htmlFor={`${id}-city`} className="text-[0.875rem] font-medium">
            Where is it?
          </label>
          <select
            id={`${id}-city`}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="mt-2 h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
          >
            {PLACE_OPTIONS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-[0.875rem] font-medium">Who is buying?</legend>
          <div className="mt-2 space-y-1.5">
            {(
              [
                ["man", "A man, or joint owners"],
                ["woman", "A woman, as the sole owner"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
                <input type="radio" name={`${id}-buyer`} checked={buyer === value} onChange={() => setBuyer(value)} className="size-4 accent-ink" />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[0.8125rem] text-stone-deep">
            {concessionHere ? "Maharashtra charges women buying alone 1% less stamp duty." : "Stamp duty here is the same for every buyer."}
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-[0.875rem] font-medium">Is it ready?</legend>
          <div className="mt-2 space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
              <input type="radio" name={`${id}-status`} checked={!underConstruction} onChange={() => setUnderConstruction(false)} className="size-4 accent-ink" />
              Ready to move, with a completion certificate
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
              <input type="radio" name={`${id}-status`} checked={underConstruction} onChange={() => setUnderConstruction(true)} className="size-4 accent-ink" />
              Under construction
            </label>
          </div>
          <p className="mt-1.5 text-[0.8125rem] text-stone-deep">GST applies only while a home is under construction.</p>
          {canBeAffordable && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[0.9375rem] text-graphite">
              <input type="checkbox" checked={affordable} onChange={(e) => setAffordable(e.target.checked)} className="mt-1 size-4 accent-ink" />
              <span>
                It counts as affordable housing
                <span className="block text-[0.8125rem] text-stone-deep">
                  Up to ₹45 lakh, and a carpet area up to 60 sq m (646 sq ft) in a metro city or 90 sq m (969 sq ft) elsewhere. GST is then 1%, not 5%.
                </span>
              </span>
            </label>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <RangeField label="Brokerage" value={brokeragePct} onChange={setBrokeragePct} min={0} max={3} step={0.25} suffix="% of the price" />
          <RangeField label="Lawyer and paperwork" value={paperwork} onChange={setPaperwork} min={0} max={2_00_000} step={5_000} prefix="₹" />
        </div>
      </form>

      <section aria-labelledby="cost-result" className="self-start border border-line-light bg-card p-6 sm:p-8 lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)]">
        <h2 id="cost-result" className="eyebrow text-stone-deep">
          On top of the price
        </h2>
        <p className="display mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-none tabular-nums" aria-live="polite">
          {inr(r.total)}
        </p>
        <p className="mt-2 text-[0.875rem] text-stone-deep">
          {price > 0 ? `${((r.total / price) * 100).toFixed(1)}% of the price. ` : ""}All in: <strong className="font-medium text-ink">{short(r.allIn)}</strong>
        </p>

        <table className="mt-6 w-full text-[0.9375rem]">
          <caption className="sr-only">What you pay on top of the price</caption>
          {(["government", "other"] as const).map((g) =>
            group(g).length === 0 ? null : (
              <tbody key={g} className="border-t border-line-light">
                <tr>
                  <th colSpan={2} scope="colgroup" className="pt-4 pb-1.5 text-left text-[0.8125rem] font-normal text-stone-deep">
                    {g === "government" ? `Paid to the ${r.place.state} government` : "Other costs"}
                  </th>
                </tr>
                {group(g).map((l) => (
                  <tr key={l.key}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {l.label}
                      <span className="block text-[0.75rem] text-stone-deep">{l.basis}</span>
                    </th>
                    <td className="py-1.5 text-right align-top tabular-nums">{inr(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pt-1 pb-2 text-left text-[0.8125rem] font-medium">
                    Subtotal
                  </th>
                  <td className="pt-1 pb-2 text-right text-[0.8125rem] font-medium tabular-nums">{inr(g === "government" ? r.government : r.other)}</td>
                </tr>
              </tbody>
            ),
          )}
        </table>

        {r.tds !== null && (
          <p className="mt-4 border-l-2 border-slate bg-slate/10 px-3.5 py-2.5 text-[0.875rem] leading-relaxed">
            <strong className="font-medium">Not an extra cost, but a must:</strong> at ₹50 lakh and above you deduct 1% TDS ({inr(r.tds)}) from what you pay the seller and deposit it
            with the Income Tax Department (Form 141, which replaced Form 26QB in April 2026).
          </p>
        )}

        <div className="mt-5 space-y-1.5 border-t border-line-light pt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          <p>{r.place.stampDutyNote}</p>
          {r.place.registration.note && <p>Registration: {r.place.registration.note}</p>}
          {r.place.uncertain && <p className="text-amber">{r.place.uncertain}</p>}
          <p>
            Rates checked {RATES_CHECKED}. States revise them by notification, and the duty is worked out on the higher of the price and the government&apos;s guidance value,
            so confirm the final figure with {r.place.confirmWith} before you pay.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/buy/emi-calculator?price=${Math.round(price)}`} className="btn btn-dark btn-compact">
            <span>Work out the EMI</span>
          </Link>
          <Link href="/buy/guide#documents" className="btn btn-ghost-dark btn-compact">
            <span>Documents to check</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

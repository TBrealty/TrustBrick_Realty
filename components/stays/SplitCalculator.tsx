"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { RangeField, writeQuery } from "@/components/tools/fields";
import { formatPrice } from "@/lib/format";
import { nightsLabel } from "@/lib/stays/labels";
import { type SplitInput, splitStay } from "@/lib/stays/split";

const inr = (v: number) => formatPrice(v, { compact: false });
const day = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const show = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

export function SplitCalculator({ start, today }: { start: SplitInput; today: string }) {
  const [v, setV] = useState<SplitInput>(start);
  const [weekendOn, setWeekendOn] = useState(start.weekendPrice !== null);
  const set = <K extends keyof SplitInput>(key: K) => (value: SplitInput[K]) => setV((s) => ({ ...s, [key]: value }));
  const id = useId();

  const input = { ...v, weekendPrice: weekendOn ? (v.weekendPrice ?? v.nightly) : null };
  const r = useMemo(() => splitStay(input), [input.nightly, input.weekendPrice, input.checkIn, input.nights, input.cleaningFee, input.people, input.extrasPerPersonPerDay]); // eslint-disable-line react-hooks/exhaustive-deps -- the fields are the inputs

  useEffect(() => {
    const t = setTimeout(
      () =>
        writeQuery({
          price: v.nightly,
          weekend: weekendOn ? (v.weekendPrice ?? v.nightly) : undefined,
          check_in: v.checkIn,
          nights: v.nights,
          cleaning: v.cleaningFee,
          people: v.people,
          extras: v.extrasPerPersonPerDay || undefined,
        }),
      400,
    );
    return () => clearTimeout(t);
  }, [v, weekendOn]);

  const weekendRate = input.weekendPrice ?? input.nightly;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      <form aria-label="The stay" onSubmit={(e) => e.preventDefault()} className="space-y-7">
        <RangeField label="Price a night" value={v.nightly} onChange={set("nightly")} min={500} max={1_00_000} step={100} prefix="₹" />
        <div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] text-graphite">
            <input type="checkbox" checked={weekendOn} onChange={(e) => setWeekendOn(e.target.checked)} className="size-4 accent-ink" />
            A higher price on Friday and Saturday nights
          </label>
          {weekendOn && (
            <div className="mt-4">
              <RangeField label="Weekend price a night" value={v.weekendPrice ?? v.nightly} onChange={set("weekendPrice")} min={500} max={1_00_000} step={100} prefix="₹" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-in`} className="text-[0.875rem] font-medium">
              Check-in
            </label>
            <input
              id={`${id}-in`}
              type="date"
              min={today}
              value={v.checkIn}
              onChange={(e) => e.target.value && set("checkIn")(e.target.value)}
              className="mt-2 h-11 w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
            />
          </div>
          <RangeField label="Nights" value={v.nights} onChange={set("nights")} min={1} max={30} step={1} />
          <RangeField label="Cleaning fee" value={v.cleaningFee} onChange={set("cleaningFee")} min={0} max={20_000} step={100} prefix="₹" hint="Once per stay" />
          <RangeField label="People sharing" value={v.people} onChange={set("people")} min={1} max={20} step={1} />
        </div>
        <RangeField
          label="Food and local travel"
          value={v.extrasPerPersonPerDay}
          onChange={set("extrasPerPersonPerDay")}
          min={0}
          max={10_000}
          step={100}
          prefix="₹"
          suffix="per person a day"
          hint="Optional"
        />
      </form>

      <section aria-labelledby="split-result" className="self-start border border-line-light bg-card p-6 sm:p-8 lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)]">
        <h2 id="split-result" className="eyebrow text-stone-deep">
          Each person pays
        </h2>
        <p className="display mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-none tabular-nums" aria-live="polite">
          {inr(r.perPerson)}
        </p>
        <p className="mt-2 text-[0.875rem] text-stone-deep">
          for the stay, {inr(r.perPersonPerNight)} a night · {show(v.checkIn)} to {show(r.checkOut)}, {nightsLabel(v.nights)}
        </p>

        <table className="mt-6 w-full border-t border-line-light text-[0.9375rem]">
          <caption className="sr-only">What the stay costs the group</caption>
          <tbody>
            {r.weekdayNights > 0 && (
              <tr>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {nightsLabel(r.weekdayNights)} × {inr(input.nightly)}
                  {input.weekendPrice !== null && <span className="block text-[0.75rem] text-stone-deep">Sunday to Thursday nights</span>}
                </th>
                <td className="py-2 text-right align-top tabular-nums">{inr(r.weekdayNights * input.nightly)}</td>
              </tr>
            )}
            {r.weekendNights > 0 && (
              <tr>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {nightsLabel(r.weekendNights)} × {inr(weekendRate)}
                  <span className="block text-[0.75rem] text-stone-deep">Friday and Saturday nights</span>
                </th>
                <td className="py-2 text-right align-top tabular-nums">{inr(r.weekendNights * weekendRate)}</td>
              </tr>
            )}
            {r.cleaning > 0 && (
              <tr>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  Cleaning fee
                </th>
                <td className="py-2 text-right tabular-nums">{inr(r.cleaning)}</td>
              </tr>
            )}
            <tr className="border-t border-line-light">
              <th scope="row" className="py-2 pr-3 text-left font-medium">
                Paid to the host
                <span className="block text-[0.75rem] font-normal text-stone-deep">Split {v.people} ways</span>
              </th>
              <td className="py-2 text-right align-top font-medium tabular-nums">{inr(r.total)}</td>
            </tr>
          </tbody>
        </table>

        {r.extrasPerPerson > 0 && (
          <dl className="mt-4 grid grid-cols-1 gap-y-3 border-t border-line-light pt-5 text-[0.9375rem] sm:grid-cols-2 sm:gap-x-4">
            <div>
              <dt className="text-[0.8125rem] text-stone-deep">Food and travel, each</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{inr(r.extrasPerPerson)}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] text-stone-deep">The whole trip, each</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{inr(r.tripPerPerson)}</dd>
            </div>
          </dl>
        )}

        <p className="mt-5 border-t border-line-light pt-4 text-[0.8125rem] leading-relaxed text-stone-deep">
          You pay the host at the property; nothing is charged online. Festival and holiday rates aren&apos;t included here: a stay&apos;s own page shows the exact price for your
          dates.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/stays?${new URLSearchParams({ check_in: v.checkIn, check_out: r.checkOut, guests: String(v.people) })}`} className="btn btn-dark btn-compact">
            <span>Stays free for these dates</span>
          </Link>
          <Link href="/stays/guide#booking" className="btn btn-ghost-dark btn-compact">
            <span>How booking works</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createBookingAction, quoteStayAction } from "@/app/(browse)/listings/stay-actions";
import { useFormAction } from "@/components/workspace/forms";
import type { ActionResult } from "@/lib/errors";
import { formatDay, formatPrice } from "@/lib/format";
import type { Quote } from "@/lib/services/stays/bookings";
import { CANCELLATION_LABELS, nightsLabel } from "@/lib/stays/labels";

type Props = {
  referenceId: string;
  price: number;
  cleaningFee: number | null;
  instantBook: boolean;
  maxGuests: number;
  petsAllowed: boolean;
  minNights: number;
  maxNights: number;
  cancellationPolicy: keyof typeof CANCELLATION_LABELS;
  unavailable: { from: string; to: string }[];
  initial: { checkIn?: string; checkOut?: string; guests?: number };
  today: string;
  loggedIn: boolean;
  defaultName: string;
  /** Why this stay can't be booked by this visitor, if it can't. */
  blockedReason: string | null;
};

const fieldClass =
  "block w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-3 py-2.5 text-[0.9375rem] focus:border-ink focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)]";
const money = (v: number) => formatPrice(v, { compact: false });

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monthOf = (date: string) => date.slice(0, 7);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * The booking panel on a stay's page: pick dates on the calendar (taken nights are struck
 * through), see the price night by night, then request or book. The price shown comes from
 * the server; the browser never computes what the guest pays.
 */
export function BookingPanel(p: Props) {
  const id = useId();
  const [checkIn, setCheckIn] = useState(p.initial.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(p.initial.checkOut ?? "");
  const [adults, setAdults] = useState(Math.min(Math.max(p.initial.guests ?? 2, 1), p.maxGuests));
  const [children, setChildren] = useState(0);
  const [pets, setPets] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, startQuote] = useTransition();
  const [booking, setBooking] = useState(false);
  const { state, pending, formAction, onSubmit } = useFormAction<ActionResult>(createBookingAction);

  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const r of p.unavailable) for (let d = r.from; d < r.to; d = addDays(d, 1)) set.add(d);
    return set;
  }, [p.unavailable]);

  // Ask the server for the price whenever the stay changes.
  useEffect(() => {
    if (!checkIn || !checkOut) return;
    let cancelled = false;
    startQuote(async () => {
      const q = await quoteStayAction(p.referenceId, { checkIn, checkOut, adults, children, pets });
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, adults, children, pets, p.referenceId]);

  const current = checkIn && checkOut ? quote : null;

  const pick = (date: string) => {
    setBooking(false);
    if (!checkIn || (checkIn && checkOut) || date <= checkIn) {
      setCheckIn(date);
      setCheckOut("");
      setQuote(null);
      return;
    }
    // A stay can't run through a taken night.
    for (let d = checkIn; d < date; d = addDays(d, 1)) if (taken.has(d)) return;
    setCheckOut(date);
  };

  const loginHref = `/login?next=${encodeURIComponent(`/listings/${p.referenceId}${checkIn && checkOut ? `?check_in=${checkIn}&check_out=${checkOut}&guests=${adults + children}` : ""}`)}`;
  const nightsGrouped = useMemo(() => {
    if (!current?.ok) return [];
    const groups = new Map<number, number>();
    for (const n of current.nightly) groups.set(n.price, (groups.get(n.price) ?? 0) + 1);
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [current]);

  return (
    <div className="space-y-4">
      <Calendar today={p.today} taken={taken} checkIn={checkIn} checkOut={checkOut} onPick={pick} initialMonth={monthOf(checkIn || p.today)} />

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Check-in</span>
          <input
            type="date"
            value={checkIn}
            min={p.today}
            onChange={(e) => {
              setCheckIn(e.target.value);
              if (checkOut && e.target.value >= checkOut) setCheckOut("");
            }}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Check-out</span>
          <input type="date" value={checkOut} min={checkIn ? addDays(checkIn, 1) : p.today} onChange={(e) => setCheckOut(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Adults</span>
          <select value={adults} onChange={(e) => setAdults(Number(e.target.value))} className={fieldClass}>
            {Array.from({ length: p.maxGuests }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.75rem] font-medium tracking-wide text-stone-deep uppercase">Children</span>
          <select value={children} onChange={(e) => setChildren(Number(e.target.value))} className={fieldClass}>
            {Array.from({ length: p.maxGuests }, (_, i) => i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {p.petsAllowed && (
        <label className="flex items-center gap-2 text-[0.875rem]">
          <input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} className="size-4 accent-ink" />
          Bringing a pet
        </label>
      )}
      <p className="text-[0.75rem] text-stone-deep">
        Up to {p.maxGuests} guests · {p.minNights === p.maxNights ? nightsLabel(p.minNights) : `${nightsLabel(p.minNights)} to ${nightsLabel(p.maxNights)}`}
      </p>

      <div aria-live="polite" className="min-h-6">
        {!checkIn || !checkOut ? (
          <p className="text-[0.875rem] text-stone-deep">Choose your dates to see the total.</p>
        ) : quoting && !current ? (
          <p className="text-[0.875rem] text-stone-deep">Checking those dates…</p>
        ) : current && !current.ok ? (
          <p className="border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.875rem] text-brick">{current.message}</p>
        ) : current?.ok ? (
          <dl className={`space-y-1.5 text-[0.9375rem] ${quoting ? "opacity-60" : ""}`}>
            {nightsGrouped.map(([price, count]) => (
              <div key={price} className="flex justify-between gap-3">
                <dt className="text-graphite">
                  {money(price)} × {nightsLabel(count)}
                </dt>
                <dd>{money(price * count)}</dd>
              </div>
            ))}
            {current.cleaningFee > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-graphite">Cleaning fee</dt>
                <dd>{money(current.cleaningFee)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-line-light pt-2 font-medium">
              <dt>
                Total for {nightsLabel(current.nights)}
                <span className="block text-[0.75rem] font-normal text-stone-deep">
                  {formatDay(current.checkIn)} – {formatDay(current.checkOut)}
                </span>
              </dt>
              <dd className="text-[1.125rem]">{money(current.total)}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {p.blockedReason ? (
        <p className="border border-line-light bg-paper px-4 py-3 text-[0.875rem] text-stone-deep">{p.blockedReason}</p>
      ) : !p.loggedIn ? (
        <Link href={loginHref} className="btn btn-dark w-full">
          <span>Log in to book</span>
        </Link>
      ) : !booking ? (
        <button type="button" className="btn btn-dark w-full" disabled={!current?.ok} onClick={() => setBooking(true)}>
          <span>{p.instantBook ? "Book now" : "Request to book"}</span>
        </button>
      ) : (
        <form action={formAction} onSubmit={onSubmit} className="space-y-3 border border-line-light bg-paper p-4" noValidate>
          {state && !state.ok && (
            <p role="alert" className="text-[0.8125rem] text-brick">
              {state.message}
            </p>
          )}
          <input type="hidden" name="ref" value={p.referenceId} />
          <input type="hidden" name="checkIn" value={checkIn} />
          <input type="hidden" name="checkOut" value={checkOut} />
          <input type="hidden" name="adults" value={adults} />
          <input type="hidden" name="children" value={children} />
          {pets && <input type="hidden" name="pets" value="on" />}
          <div>
            <label htmlFor={`${id}-name`} className="mb-1 block text-[0.8125rem] font-medium">
              Your name
            </label>
            <input id={`${id}-name`} name="name" defaultValue={p.defaultName} autoComplete="name" className={fieldClass} required />
            <Err state={state} name="name" />
          </div>
          <div>
            <label htmlFor={`${id}-phone`} className="mb-1 block text-[0.8125rem] font-medium">
              Phone
            </label>
            <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" className={fieldClass} required />
            <Err state={state} name="phone" />
          </div>
          <div>
            <label htmlFor={`${id}-msg`} className="mb-1 block text-[0.8125rem] font-medium">
              Message to the host {p.instantBook ? "(optional)" : ""}
            </label>
            <textarea id={`${id}-msg`} name="message" rows={3} maxLength={1000} className={fieldClass} placeholder="Who's coming, and what brings you here?" />
          </div>
          <label className="flex items-start gap-2 text-[0.8125rem] leading-snug">
            <input type="checkbox" name="agree" className="mt-0.5 size-4 shrink-0 accent-ink" />
            <span>
              I agree to the house rules and the {CANCELLATION_LABELS[p.cancellationPolicy].label.toLowerCase()} cancellation policy: {CANCELLATION_LABELS[p.cancellationPolicy].rule}
            </span>
          </label>
          <Err state={state} name="agree" />
          <button type="submit" className="btn btn-dark w-full" disabled={pending} aria-busy={pending}>
            <span>{pending ? "Sending…" : p.instantBook ? `Confirm booking · ${current?.ok ? money(current.total) : ""}` : "Send request"}</span>
          </button>
          <p className="text-[0.75rem] text-stone-deep">
            {p.instantBook ? "Your stay is confirmed straight away." : "The host has 24 hours to accept. You won't be charged."} You pay the host at the property; Trustbrick charges nothing.
            The host sees your name, phone and email once the booking is confirmed.
          </p>
        </form>
      )}
    </div>
  );
}

function Err({ state, name }: { state: ActionResult | null; name: string }) {
  const msg = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return msg ? <p className="mt-1.5 text-[0.8125rem] text-brick">{msg}</p> : null;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Calendar({ today, taken, checkIn, checkOut, onPick, initialMonth }: { today: string; taken: Set<string>; checkIn: string; checkOut: string; onPick: (d: string) => void; initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const first = `${month}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const label = new Date(`${first}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const canBack = month > monthOf(today);

  return (
    <div className="border border-line-light bg-paper p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canBack} className="grid size-8 place-items-center text-stone-deep disabled:opacity-30" aria-label="Previous month">
          ‹
        </button>
        <p className="text-[0.875rem] font-medium">{label}</p>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-8 place-items-center text-stone-deep" aria-label="Next month">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[0.8125rem]" role="grid" aria-label={`Availability for ${label}`}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[0.6875rem] text-stone-deep" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const past = d < today;
          const isTaken = taken.has(d);
          const selected = d === checkIn || d === checkOut;
          const inRange = checkIn && checkOut && d > checkIn && d < checkOut;
          // A taken night can still be someone's check-out day.
          const disabled = past || (isTaken && !(checkIn && !checkOut && d > checkIn));
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              aria-pressed={selected}
              aria-label={`${formatDay(d)}${isTaken ? ", not available" : ""}`}
              className={`mx-auto grid size-9 place-items-center rounded-full tabular-nums ${
                selected ? "bg-ink text-paper" : inRange ? "bg-ink/10" : "hover:bg-ink/5"
              } ${isTaken ? "text-stone line-through" : ""} ${past ? "text-stone/60" : ""} disabled:cursor-default disabled:hover:bg-transparent`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[0.6875rem] text-stone-deep">Struck-through nights are booked or closed by the host.</p>
    </div>
  );
}

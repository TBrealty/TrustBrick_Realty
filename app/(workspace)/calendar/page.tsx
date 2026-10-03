import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmAction, Submit, TextInput } from "@/components/workspace/forms";
import { Card, EmptyState, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { formatDay, formatPrice } from "@/lib/format";
import { calendarMonth, myStays } from "@/lib/services/stays/calendar";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { blockDatesAction, removeRateAction, setRateAction, unblockDatesAction } from "../bookings/actions";

export const metadata: Metadata = { title: "Calendar" };

type Props = { searchParams: Promise<{ stay?: string; month?: string }> };

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const short = (v: number) => (v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `₹${v}`);

export default async function CalendarPage({ searchParams }: Props) {
  const actor = await requirePermission("bookings.view", "/calendar");
  const { stay, month } = await searchParams;
  const stays = await myStays(actor);
  if (stays.length === 0) {
    return (
      <>
        <PageHeader title="Calendar" />
        <EmptyState
          title="No stays yet"
          action={
            <Link href="/properties/new?purpose=stay" className="wbtn wbtn-primary">
              List a home
            </Link>
          }
        >
          Your calendar appears here once you list a home as a homestay.
        </EmptyState>
      </>
    );
  }
  const selected = stays.find((s) => s.referenceId === stay) ?? stays[0];
  const cal = await calendarMonth(actor, selected.referenceId, month ?? todayInIndia().slice(0, 7));
  const href = (m: string) => `/calendar?stay=${selected.referenceId}&month=${m}`;
  const lead = (new Date(`${cal.month}-01T00:00:00Z`).getUTCDay() + 6) % 7;
  const monthLabel = new Date(`${cal.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayInIndia();

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Close dates you can't host, and set special prices for festivals or long weekends. Booked nights can't be closed."
        actions={
          stays.length > 1 ? (
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="stay" className="sr-only">
                Stay
              </label>
              <select id="stay" name="stay" defaultValue={selected.referenceId} className="winput max-w-72">
                {stays.map((s) => (
                  <option key={s.referenceId} value={s.referenceId}>
                    {s.title}
                    {s.status !== "published" ? ` (${s.status.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>
              <button type="submit" className="wbtn wbtn-secondary">
                Show
              </button>
            </form>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-line-light px-4 py-3">
            <Link href={href(shift(cal.month, -1))} className="wbtn wbtn-ghost wbtn-sm" aria-label="Previous month">
              ← {new Date(`${shift(cal.month, -1)}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}
            </Link>
            <div className="text-center">
              <p className="text-[0.9375rem] font-semibold">{monthLabel}</p>
              <p className="text-[0.75rem] text-stone-deep">
                {selected.title} · {formatPrice(cal.listing.price, { compact: false })}/night
                {cal.listing.weekendPrice ? ` · weekends ${formatPrice(cal.listing.weekendPrice, { compact: false })}` : ""}
              </p>
            </div>
            <Link href={href(shift(cal.month, 1))} className="wbtn wbtn-ghost wbtn-sm" aria-label="Next month">
              {new Date(`${shift(cal.month, 1)}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })} →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[36rem] grid-cols-7 gap-px bg-line-light" role="grid" aria-label={`${monthLabel} calendar`}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="bg-paper px-2 py-1.5 text-[0.6875rem] font-medium tracking-wide text-stone-deep uppercase">
                  {d}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`b${i}`} className="bg-paper/60" />
              ))}
              {cal.days.map((d) => {
                const tone = d.booking ? "bg-sage/12" : d.blocked ? "bg-ink/6" : "bg-card";
                return (
                  <div key={d.date} className={`min-h-20 p-1.5 text-[0.75rem] ${tone} ${d.past ? "opacity-50" : ""} ${d.date === today ? "outline-2 -outline-offset-2 outline-ink" : ""}`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-medium tabular-nums">{Number(d.date.slice(8))}</span>
                      {!d.booking && !d.blocked && <span className={`tabular-nums ${d.special ? "font-medium text-brick" : "text-stone-deep"}`}>{short(d.price)}</span>}
                    </div>
                    {d.booking ? (
                      <Link href={`/bookings/${d.booking.referenceId}`} className="mt-1 block truncate rounded-[2px] bg-sage/20 px-1 py-0.5 text-sage hover:underline" title={d.booking.referenceId}>
                        {d.booking.isStart ? d.booking.guestName : "·"}
                      </Link>
                    ) : d.blocked ? (
                      <p className="mt-1 truncate text-stone-deep" title={d.blocked.reason ?? undefined}>
                        Closed
                      </p>
                    ) : d.requests > 0 ? (
                      <Link href="/bookings?group=requests" className="mt-1 block truncate text-amber hover:underline">
                        {d.requests} request{d.requests === 1 ? "" : "s"}
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-light px-4 py-2.5 text-[0.75rem] text-stone-deep">
            <span>
              <span aria-hidden className="mr-1 inline-block size-2.5 rounded-[2px] bg-sage/40" /> Booked
            </span>
            <span>
              <span aria-hidden className="mr-1 inline-block size-2.5 rounded-[2px] bg-ink/15" /> Closed
            </span>
            <span className="text-brick">₹ in red: special price</span>
          </p>
        </Card>

        <div className="space-y-6">
          {cal.canEdit ? (
            <>
              <Card title="Close dates">
                <ActionForm action={blockDatesAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="ref" value={selected.referenceId} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="From" name="from" type="date" min={today} required />
                    <TextInput label="To (last night)" name="to" type="date" min={today} required />
                  </div>
                  <TextInput label="Note (only you see it)" name="reason" placeholder="Family visiting" />
                  <Submit>Close these dates</Submit>
                </ActionForm>
              </Card>
              <Card title="Special price">
                <ActionForm action={setRateAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="ref" value={selected.referenceId} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="From" name="from" type="date" min={today} required />
                    <TextInput label="To (last night)" name="to" type="date" min={today} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="Price per night (₹)" name="price" inputMode="numeric" required />
                    <TextInput label="Label" name="note" placeholder="Diwali" />
                  </div>
                  <Submit>Save price</Submit>
                </ActionForm>
              </Card>
            </>
          ) : (
            <p className="wcard p-4 text-[0.8125rem] text-stone-deep">You can view this calendar but not change it.</p>
          )}
          <Card title="Closed dates">
            {cal.blocks.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">None coming up.</p>
            ) : (
              <ul className="divide-y divide-line-light text-[0.8125rem]">
                {cal.blocks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {formatDay(b.from)}
                      {b.to !== b.from ? ` – ${formatDay(b.to)}` : ""}
                      {b.reason && <span className="block text-[0.75rem] text-stone-deep">{b.reason}</span>}
                    </span>
                    {cal.canEdit && <ConfirmAction label="Reopen" title="Reopen these dates?" description="Guests can book them again." action={unblockDatesAction} hidden={{ ref: selected.referenceId, id: b.id }} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Special prices">
            {cal.rates.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">None coming up.</p>
            ) : (
              <ul className="divide-y divide-line-light text-[0.8125rem]">
                {cal.rates.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {formatDay(r.from)}
                      {r.to !== r.from ? ` – ${formatDay(r.to)}` : ""}: <strong className="font-medium">{formatPrice(r.price, { compact: false })}</strong>
                      {r.note && <span className="block text-[0.75rem] text-stone-deep">{r.note}</span>}
                    </span>
                    {cal.canEdit && <ConfirmAction label="Remove" title="Remove this special price?" description="Those nights go back to your usual price. Existing bookings are unaffected." action={removeRateAction} hidden={{ ref: selected.referenceId, id: r.id }} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

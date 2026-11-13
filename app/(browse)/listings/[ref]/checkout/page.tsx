import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ServicePage } from "@/components/navigation/ServicePage";
import { CheckoutForm } from "@/components/stays/CheckoutForm";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { getListing } from "@/lib/listings/queries";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { policyTimeline, round2 } from "@/lib/payments/rules";
import { quoteStay } from "@/lib/services/stays/bookings";
import { stayPaymentState } from "@/lib/services/stays/payments";
import { CANCELLATION_LABELS, nightsLabel, timeLabel } from "@/lib/stays/labels";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = { title: "Confirm and pay — Trustbrick", robots: { index: false } };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Checkout for a stay paid online: the trip, the guest's details, the cancellation policy with
 * its real dates, the house rules, and the price. Paying opens the provider's checkout.
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const q = await searchParams;
  const input = {
    checkIn: one(q.check_in),
    checkOut: one(q.check_out),
    adults: Number(one(q.adults) || 1),
    children: Number(one(q.children) || 0),
    pets: one(q.pets) === "1",
  };
  const back = `/listings/${ref}?${new URLSearchParams({ check_in: input.checkIn, check_out: input.checkOut, guests: String(input.adults + input.children) })}`;
  const { user } = await requireSession(`/listings/${ref}/checkout?${new URLSearchParams(Object.entries(q).filter(([, v]) => typeof v === "string") as [string, string][])}`);
  const listing = await getListing(ref);
  if (!listing?.stay) notFound();
  const pay = await stayPaymentState(listing.referenceId);
  if (!pay.online || !pay.ready) redirect(back);
  const quote = await quoteStay(listing.referenceId, input, user.id);
  const stay = listing.stay;
  const policy = CANCELLATION_LABELS[stay.cancellationPolicy];
  const steps = quote.ok ? policyTimeline(stay.cancellationPolicy, quote.checkIn, stay.checkInTime) : [];
  const groups = new Map<number, number>();
  if (quote.ok) for (const n of quote.nightly) groups.set(n.price, (groups.get(n.price) ?? 0) + 1);
  const guests = `${input.adults} adult${input.adults === 1 ? "" : "s"}${input.children ? `, ${input.children} child${input.children === 1 ? "" : "ren"}` : ""}${input.pets ? ", a pet" : ""}`;

  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} mainClassName="shell pt-8 pb-20 sm:pt-12">
      <Link href={back} className="text-[0.875rem] text-stone-deep hover:text-ink">
        ← Back to the stay
      </Link>
      <h1 className="display mt-4 text-[clamp(2rem,5vw,3rem)] leading-[1]">{stay.instantBook ? "Confirm and pay" : "Request and pay"}</h1>

      {!quote.ok ? (
        <div className="mt-8 max-w-xl border-l-2 border-brick bg-brick/6 px-4 py-3">
          <p className="text-[0.9375rem] text-brick">{quote.message}</p>
          <Link href={back} className="mt-2 inline-block text-[0.875rem] underline">
            Choose other dates
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* The stay, on top on a phone */}
          <aside className="lg:order-2">
            <div className="border border-line-light bg-card lg:sticky lg:top-24">
              <div className="flex gap-4 p-4">
                {listing.image && (
                  <div className="relative size-24 shrink-0 overflow-hidden bg-paper">
                    <Image src={listing.image} alt="" fill sizes="96px" quality={70} className="object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{listing.title}</p>
                  <p className="mt-1 text-[0.8125rem] text-stone-deep">
                    {listing.locality}
                    {listing.city ? `, ${listing.city}` : ""}
                  </p>
                  {stay.host && (
                    <p className="mt-1 text-[0.8125rem] text-graphite">
                      Hosted by {stay.host.name}
                      {stay.host.verified ? " · Identity checked" : ""}
                    </p>
                  )}
                </div>
              </div>
              <dl className="space-y-1.5 border-t border-line-light p-4 text-[0.9375rem]">
                <dt className="sr-only">Price details</dt>
                {[...groups.entries()].map(([price, count]) => (
                  <div key={price} className="flex justify-between gap-3">
                    <dt className="text-graphite">
                      {formatMoney(price)} × {nightsLabel(count)}
                    </dt>
                    <dd>{formatMoney(round2(price * count))}</dd>
                  </div>
                ))}
                {quote.cleaningFee > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-graphite">Cleaning fee</dt>
                    <dd>{formatMoney(quote.cleaningFee)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-graphite">Trustbrick service fee</dt>
                  <dd>None</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line-light pt-2 text-[1.0625rem] font-medium">
                  <dt>Total (INR)</dt>
                  <dd>{formatMoney(quote.total)}</dd>
                </div>
              </dl>
            </div>
          </aside>

          <div className="space-y-10 lg:order-1">
            <section aria-labelledby="trip">
              <h2 id="trip" className="text-[1.25rem] font-medium">
                Your trip
              </h2>
              <dl className="mt-4 divide-y divide-line-light border-y border-line-light">
                <div className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <dt className="text-[0.8125rem] text-stone-deep">Dates</dt>
                    <dd className="mt-0.5">
                      {formatDay(quote.checkIn)} – {formatDay(quote.checkOut)} · {nightsLabel(quote.nights)}
                    </dd>
                    <dd className="text-[0.8125rem] text-stone-deep">
                      Check-in from {timeLabel(stay.checkInTime)}, check-out by {timeLabel(stay.checkOutTime)}
                    </dd>
                  </div>
                  <Link href={back} className="text-[0.875rem] font-medium underline">
                    Change
                  </Link>
                </div>
                <div className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <dt className="text-[0.8125rem] text-stone-deep">Guests</dt>
                    <dd className="mt-0.5">{guests}</dd>
                  </div>
                  <Link href={back} className="text-[0.875rem] font-medium underline">
                    Change
                  </Link>
                </div>
              </dl>
            </section>

            <section aria-labelledby="policy">
              <h2 id="policy" className="text-[1.25rem] font-medium">
                Cancellation policy: {policy.label}
              </h2>
              <p className="mt-2 text-[0.9375rem] text-graphite">
                {policy.rule} {policy.late}
              </p>
              <ol className="mt-4 grid grid-cols-1 gap-px overflow-hidden border border-line-light bg-line-light sm:grid-cols-3">
                {steps.map((s) => (
                  <li key={s.label} className="bg-card p-3.5">
                    <p className="text-[0.8125rem] text-stone-deep">{s.from ? `From ${formatDateTime(s.from)}` : `Until ${formatDateTime(s.to!)}`}</p>
                    <p className="mt-1 font-medium">{s.label}</p>
                    <p className="text-[0.8125rem] text-graphite">{s.refundPercent > 0 ? `${formatMoney(round2((quote.total * s.refundPercent) / 100))} back` : "Nothing back"}</p>
                  </li>
                ))}
                <li className="bg-card p-3.5">
                  <p className="text-[0.8125rem] text-stone-deep">From check-in</p>
                  <p className="mt-1 font-medium">No refund</p>
                  <p className="text-[0.8125rem] text-graphite">The stay has begun</p>
                </li>
              </ol>
              <p className="mt-3 text-[0.8125rem] text-stone-deep">If the host or Trustbrick cancels, you always get everything back.</p>
            </section>

            {stay.houseRules || !stay.petsAllowed || !stay.smokingAllowed || !stay.eventsAllowed ? (
              <section aria-labelledby="rules">
                <h2 id="rules" className="text-[1.25rem] font-medium">
                  House rules
                </h2>
                <ul className="mt-3 space-y-1 text-[0.9375rem] text-graphite">
                  {!stay.petsAllowed && <li>No pets</li>}
                  {!stay.smokingAllowed && <li>No smoking</li>}
                  {!stay.eventsAllowed && <li>No parties or events</li>}
                </ul>
                {stay.houseRules && <p className="mt-3 whitespace-pre-line text-[0.9375rem] text-graphite">{stay.houseRules}</p>}
              </section>
            ) : null}

            <section aria-labelledby="details" className="border-t border-line-light pt-8">
              <h2 id="details" className="text-[1.25rem] font-medium">
                Your details
              </h2>
              <p className="mt-1 text-[0.875rem] text-stone-deep">The host sees your name and phone number once your stay is confirmed.</p>
              <div className="mt-5">
                <CheckoutForm
                  referenceId={listing.referenceId}
                  checkIn={quote.checkIn}
                  checkOut={quote.checkOut}
                  adults={input.adults}
                  childCount={input.children}
                  pets={input.pets}
                  total={quote.total}
                  instantBook={stay.instantBook}
                  defaultName={user.name ?? ""}
                  defaultPhone=""
                  policyLabel={policy.label}
                />
              </div>
            </section>
          </div>
        </div>
      )}
    </ServicePage>
  );
}

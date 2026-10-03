import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelTripAction } from "@/app/(browse)/listings/stay-actions";
import { ConfirmAction } from "@/components/workspace/forms";
import { StatusBadge } from "@/components/workspace/ui";
import { requireSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";
import { getTrip } from "@/lib/services/stays/bookings";
import { conversationForBooking } from "@/lib/services/stays/messages";
import { BOOKING_STATUS_TONES, nightsLabel, timeLabel } from "@/lib/stays/labels";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ booked?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Trip ${(await params).ref} — Trustbrick` };
}

const money = (v: number) => formatPrice(v, { compact: false });

export default async function TripPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { booked } = await searchParams;
  const { user } = await requireSession(`/account/trips/${ref}`);
  const trip = await getTrip(user.id, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const conversationRef = await conversationForBooking(trip.referenceId);
  const messageHref = conversationRef ? `/account/messages/${conversationRef}` : `/account/messages/new?listing=${trip.listing.referenceId}`;
  const groups = new Map<number, number>();
  for (const n of trip.nightly) groups.set(n.price, (groups.get(n.price) ?? 0) + 1);

  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="trips" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <div className="max-w-3xl">
        <Link href="/account/trips" className="text-[0.875rem] text-stone-deep hover:text-ink">
          ← All trips
        </Link>
        {booked && (
          <p role="status" className="mt-5 border-l-2 border-sage bg-sage/10 px-4 py-3 text-[0.9375rem]">
            {trip.status === "confirmed"
              ? "You're booked. The address and the host's phone number are below."
              : "Request sent. The host has 24 hours to accept; we'll email you either way."}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="display text-[clamp(2rem,5vw,3rem)] leading-[1]">{trip.listing.title}</h1>
            <p className="mt-2 text-[1rem] text-graphite">
              {trip.listing.locality}
              {trip.listing.city ? `, ${trip.listing.city}` : ""}
            </p>
          </div>
          <StatusBadge tone={BOOKING_STATUS_TONES[trip.status]}>{trip.statusLabel}</StatusBadge>
        </div>

        {trip.statusReason && ["declined", "cancelled", "expired"].includes(trip.status) && (
          <p className="mt-5 border-l-2 border-amber bg-amber/10 px-4 py-3 text-[0.9375rem]">{trip.statusReason}</p>
        )}
        {trip.status === "requested" && trip.expiresAt && (
          <p className="mt-5 border-l-2 border-line-light bg-paper px-4 py-3 text-[0.9375rem] text-graphite">
            Waiting for the host. If they don&apos;t answer by {formatDateTime(trip.expiresAt)}, the request expires and you can choose other dates.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line-light bg-card px-4 py-3.5">
          <p className="flex-1 text-[0.9375rem] text-graphite">
            {conversationRef ? "Your conversation with the host is saved in Messages." : "Questions about your stay? Message the host directly."}
          </p>
          <Link href={messageHref} className="btn btn-dark btn-compact">
            <span>{conversationRef ? "Open messages" : "Message the host"}</span>
          </Link>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line-light py-6 sm:grid-cols-4">
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Check-in</dt>
            <dd className="mt-0.5 font-medium">{formatDay(trip.checkIn)}</dd>
            <dd className="text-[0.8125rem] text-stone-deep">from {timeLabel(trip.checkInTime)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Check-out</dt>
            <dd className="mt-0.5 font-medium">{formatDay(trip.checkOut)}</dd>
            <dd className="text-[0.8125rem] text-stone-deep">by {timeLabel(trip.checkOutTime)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Guests</dt>
            <dd className="mt-0.5 font-medium">
              {trip.adults} adult{trip.adults === 1 ? "" : "s"}
              {trip.children ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""}
              {trip.pets ? ", a pet" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-stone-deep">Booking</dt>
            <dd className="mt-0.5 font-mono text-[0.875rem]">{trip.referenceId}</dd>
          </div>
        </dl>

        <section className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-[1.125rem] font-medium">Where you&apos;re staying</h2>
            {trip.address ? (
              <div className="mt-3 text-[0.9375rem] leading-relaxed text-graphite">
                <p>{[trip.address.unit, trip.address.line1].filter(Boolean).join(", ")}</p>
                {trip.address.line2 && <p>{trip.address.line2}</p>}
                {trip.address.landmark && <p>Near {trip.address.landmark}</p>}
                <p>
                  {trip.listing.locality}
                  {trip.listing.city ? `, ${trip.listing.city}` : ""} {trip.address.postalCode ?? ""}
                </p>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${trip.address.latitude}&mlon=${trip.address.longitude}#map=17/${trip.address.latitude}/${trip.address.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block underline"
                >
                  Open the map ↗
                </a>
                <p className="mt-4">
                  Host: <span className="font-medium text-ink">{trip.hostName}</span>
                  {trip.hostPhone && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={`tel:${trip.hostPhone}`} className="underline">
                        {trip.hostPhone}
                      </a>
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[0.9375rem] text-stone-deep">The exact address and the host&apos;s phone number appear here once the booking is confirmed.</p>
            )}
          </div>
          <div>
            <h2 className="text-[1.125rem] font-medium">Price</h2>
            <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
              {[...groups.entries()].map(([price, count]) => (
                <div key={price} className="flex justify-between gap-3">
                  <dt className="text-graphite">
                    {money(price)} × {nightsLabel(count)}
                  </dt>
                  <dd>{money(price * count)}</dd>
                </div>
              ))}
              {trip.cleaningFee > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-graphite">Cleaning fee</dt>
                  <dd>{money(trip.cleaningFee)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-line-light pt-2 font-medium">
                <dt>Total, paid to the host at the property</dt>
                <dd>{money(trip.total)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[0.8125rem] text-stone-deep">
              Cancellation: {trip.cancellationPolicy.label}. {trip.cancellationPolicy.rule}
            </p>
          </div>
        </section>

        {trip.canCancel && (
          <section className="mt-10 border-t border-line-light pt-6">
            <ConfirmAction
              label={trip.status === "requested" ? "Withdraw request" : "Cancel booking"}
              title={trip.status === "requested" ? "Withdraw this request?" : "Cancel this booking?"}
              description={
                trip.status === "requested"
                  ? "The host is told you no longer need the dates."
                  : trip.freeCancellation
                    ? "Under the host's policy this cancellation is free. The host is told straight away."
                    : "This is past the free-cancellation window in the host's policy. You haven't paid anything online, but please let the host know why."
              }
              action={cancelTripAction}
              hidden={{ ref: trip.referenceId }}
              variant="danger"
              reason={{ required: false, label: "Note for the host (optional)" }}
              size="md"
            />
          </section>
        )}

        <section className="mt-10 border-t border-line-light pt-6">
          <h2 className="text-[1.125rem] font-medium">History</h2>
          <ol className="mt-3 space-y-2 text-[0.9375rem]">
            {trip.events.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{e.label}</span>
                <span className="text-stone-deep">· {formatDateTime(e.at)}</span>
                {e.note && <span className="w-full text-[0.875rem] text-graphite">“{e.note}”</span>}
              </li>
            ))}
          </ol>
          <Link href={`/listings/${trip.listing.referenceId}`} className="mt-6 inline-block text-[0.875rem] underline">
            View the stay
          </Link>
        </section>
      </div>
    </ServicePage>
  );
}

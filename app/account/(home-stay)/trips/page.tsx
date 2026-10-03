import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/workspace/ui";
import { requireSession } from "@/lib/auth/session";
import { formatDay, formatPrice } from "@/lib/format";
import { links } from "@/lib/site";
import { listTrips } from "@/lib/services/stays/bookings";
import { BOOKING_STATUS_TONES, nightsLabel } from "@/lib/stays/labels";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = { title: "Trips — Trustbrick" };

export default async function TripsPage() {
  const { user } = await requireSession(links.trips);
  const trips = await listTrips(user.id);

  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="trips" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <div>
        <p className="eyebrow flex items-center gap-3 text-brick">
          <span aria-hidden className="h-px w-8 bg-current" />
          Trips
        </p>
        <h1 className="display mt-6 mb-10 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
          Your <em>home stays.</em>
        </h1>
        {trips.length === 0 ? (
          <div className="border border-dashed border-line-light px-6 py-14 text-center">
            <p className="text-[1.125rem] font-medium">No trips yet</p>
            <p className="mx-auto mt-2 max-w-[40ch] text-[0.9375rem] text-graphite">Homes and private rooms by the night, from hosts Trustbrick has checked.</p>
            <Link href="/stays" className="btn btn-dark mt-6">
              <span>Find a home stay</span>
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {trips.map((t) => (
              <li key={t.referenceId}>
                <Link href={`/account/trips/${t.referenceId}`} className="flex flex-col gap-3 border border-line-light bg-paper p-5 transition-colors hover:border-ink sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[1.0625rem] font-medium">{t.listing.title}</p>
                    <p className="mt-0.5 text-[0.875rem] text-stone-deep">
                      {t.listing.locality}
                      {t.listing.city ? `, ${t.listing.city}` : ""} · {formatDay(t.checkIn)} – {formatDay(t.checkOut)} · {nightsLabel(t.nights)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-[0.9375rem] tabular-nums">{formatPrice(t.total, { compact: false })}</span>
                    <StatusBadge tone={BOOKING_STATUS_TONES[t.status]}>{t.statusLabel}</StatusBadge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ServicePage>
  );
}

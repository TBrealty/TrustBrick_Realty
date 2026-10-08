import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceFooter } from "@/components/footer/ServiceFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { ServiceHeader } from "@/components/navigation/ServiceHeader";
import { TourLocked } from "@/components/tours/TourLocked";
import { TourViewer } from "@/components/tours/TourViewer";
import { getWorkspaceContext } from "@/lib/authz/session";
import { kindOf } from "@/lib/listings/describe";
import { getListing } from "@/lib/listings/queries";
import { shellFor } from "@/lib/listings/services";
import { canViewTour, tourDataForProperty } from "@/lib/services/tours";
import { describeTour, hasTour, isTourView } from "@/lib/tours/terms";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ view?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const listing = await getListing((await params).ref);
  // Behind a subscription: nothing here for search engines.
  return { title: listing ? `Virtual tour: ${listing.title} — Trustbrick` : "Virtual tour — Trustbrick", robots: { index: false, follow: false } };
}

export default async function ListingTourPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { view } = await searchParams;
  const listing = await getListing(ref);
  if (!listing || !hasTour(listing.tour)) notFound();

  const ctx = await getWorkspaceContext();
  const userId = ctx.state === "anonymous" ? null : ctx.userId;
  const allowed = await canViewTour({ userId, actor: ctx.state === "ready" ? ctx.actor : null }, listing.propertyId);
  const tour = allowed ? await tourDataForProperty(listing.propertyId) : null;
  const shell = shellFor(kindOf(listing));
  const here = `/listings/${listing.referenceId}/tour`;

  return (
    <div className={`flex min-h-svh flex-col bg-ivory text-ink ${shell ? "[--sticky-top:calc(var(--header-h)+2.75rem)]" : ""}`}>
      {shell ? <ServiceHeader shell={shell} /> : <AppHeader active={kindOf(listing)} />}
      <main className="shell flex-1 pt-6 pb-24 sm:pt-10">
        <Link href={`/listings/${listing.referenceId}`} className="link-rule text-[0.8125rem] text-stone-deep hover:text-ink">
          ← Back to the listing
        </Link>
        <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-stone-deep">Virtual tour</p>
            <h1 className="display mt-2 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05]">{listing.title}</h1>
            <p className="mt-2 text-[0.9375rem] text-graphite">
              {listing.locality}
              {listing.city ? `, ${listing.city}` : ""} · {describeTour(listing.tour)}
            </p>
          </div>
        </div>
        {tour ? (
          <TourViewer tour={tour} title={listing.title} initialView={isTourView(view) ? view : undefined} />
        ) : (
          <TourLocked tour={listing.tour} signedIn={userId !== null} returnTo={here} stay={listing.transactionType === "stay"} />
        )}
        <p className="mt-6 max-w-[70ch] text-[0.8125rem] text-stone-deep">
          {listing.transactionType === "stay"
            ? "The tour shows the stay as the host recorded it. If what you find on arrival doesn't match, tell us."
            : "The tour shows the property as the agent recorded it. Visit before you pay anything, and check that what you see matches."}
        </p>
      </main>
      {shell && <ServiceFooter shell={shell} />}
    </div>
  );
}

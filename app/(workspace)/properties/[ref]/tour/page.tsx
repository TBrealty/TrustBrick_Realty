import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TourViewer } from "@/components/tours/TourViewer";
import { VirtualTourManager } from "@/components/workspace/onboarding/MediaManager";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { isEditable } from "@/lib/listings/lifecycle";
import { getListingForActor } from "@/lib/services/listings/queries";
import { tourDataForProperty } from "@/lib/services/tours";
import { isLiveForTours, isTourView } from "@/lib/tours/terms";

export const metadata: Metadata = { title: "Virtual tour" };

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ view?: string }> };

/**
 * The tour as Plus members see it, for the listing's team and its reviewers, at any status. While
 * the listing is live, the team changes the tour here without withdrawing it; each change shows
 * straight away and goes to Approvals.
 */
export default async function PropertyTourPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { view } = await searchParams;
  const actor = await requirePermission("listings.view", `/properties/${ref}/tour`);
  const listing = await getListingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const tour = await tourDataForProperty(listing.propertyId);
  const team = actor.workspace === "professional" && can(actor, "listings.edit");
  const canEditDraft = team && isEditable(listing.status);
  const canEditLive = team && isLiveForTours(listing.status);
  const stay = listing.purpose === "stay";
  const openReview = listing.cases.find((c) => c.caseType === "tour_review" && (c.status === "open" || c.status === "in_review"));

  return (
    <>
      <PageHeader eyebrow={<BackLink href={`/properties/${ref}`}>Back to the listing</BackLink>} title={`Virtual tour: ${listing.title}`} />
      {tour.hidden && (
        <p className="mb-5 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">Hidden by Trustbrick</strong> on {formatDateTime(tour.hidden.at)}
          {tour.hidden.reason ? `: “${tour.hidden.reason}”` : "."} {stay ? "Guests" : "Buyers"} can&apos;t see it, and the {stay ? "stay" : "listing"} has no tour badge, until Trustbrick approves a fix.
        </p>
      )}
      {openReview && (
        <p className="mb-5 rounded-[3px] border-l-2 border-slate bg-slate/8 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          {tour.hidden ? "Your fix is waiting for a Trustbrick check. The tour is shown again once it's approved." : "Recent changes are live and waiting for a Trustbrick check."}
          {can(actor, "listings.approve", "platform") && (
            <>
              {" "}
              <Link href={`/approvals/${openReview.referenceId}`} className="font-medium text-ink underline">
                Review them
              </Link>
            </>
          )}
        </p>
      )}
      <div className="space-y-6">
        <Card
          actions={
            canEditDraft ? (
              <Link href={`/properties/${ref}/edit?step=media#virtual-tour`} className="wbtn wbtn-secondary wbtn-sm">
                Edit the tour
              </Link>
            ) : canEditLive ? (
              <a href="#manage" className="wbtn wbtn-secondary wbtn-sm">
                Change the tour
              </a>
            ) : undefined
          }
          title="Preview"
          description={
            tour.hidden
              ? `What ${stay ? "guests" : "buyers"} with Trustbrick Plus will see once it's shown again.`
              : `What ${stay ? "guests" : "buyers"} with Trustbrick Plus see. Others see that the ${stay ? "stay" : "listing"} has a tour and are offered Plus.`
          }
        >
          <TourViewer tour={tour} title={listing.title} initialView={isTourView(view) ? view : undefined} />
        </Card>
        {canEditLive && (
          <section id="manage" className="scroll-mt-24">
            <Card title="Change the tour">
              <VirtualTourManager
                referenceId={listing.referenceId}
                items={listing.media}
                tourUrl={listing.tourUrl}
                stay={stay}
                live
                hidden={tour.hidden ?? null}
                showPreview={false}
              />
            </Card>
          </section>
        )}
      </div>
    </>
  );
}

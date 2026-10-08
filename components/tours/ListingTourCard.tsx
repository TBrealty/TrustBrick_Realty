import Link from "next/link";
import { TourViewer } from "@/components/tours/TourViewer";
import { Card } from "@/components/workspace/ui";
import type { TourData } from "@/lib/tours/terms";

/**
 * How the viewer may change the tour: in the form while the listing can be edited ("draft"), on
 * the tour page while it's live ("live": changes show straight away and are reviewed after),
 * not while it's being reviewed ("locked"), or not at all ("view": not on the listing's team).
 */
export type TourEditMode = "draft" | "live" | "locked" | "view";

/**
 * The virtual tour on a listing's workspace page, shown as Plus members see it, or how to add one.
 * For a stay it speaks of guests; otherwise of buyers and tenants.
 */
export function ListingTourCard({ referenceId, title, tour, stay, mode }: { referenceId: string; title: string; tour: TourData; stay: boolean; mode: TourEditMode }) {
  const has = tour.rooms.length > 0 || tour.model !== null || tour.link !== null;
  const people = stay ? "guests" : "buyers and tenants";
  const editHref = mode === "draft" ? `/properties/${referenceId}/edit?step=media#virtual-tour` : `/properties/${referenceId}/tour#manage`;
  const canChange = mode === "draft" || mode === "live";
  const hidden = tour.hidden && (
    <p className="mb-4 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-graphite">
      <strong className="font-medium text-ink">Hidden by Trustbrick</strong>
      {tour.hidden.reason ? `: “${tour.hidden.reason}”` : "."} {stay ? "Guests" : "Buyers"} can&apos;t see it until Trustbrick approves a fix{canChange ? ": change the tour, and the change goes for a check" : ""}.
    </p>
  );

  if (!has) {
    return (
      <Card title="Virtual tour">
        {hidden}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[62ch] text-[0.875rem] text-graphite">
            No virtual tour yet. Add 360° photos of each room, a 3D model or a hosted 3D tour link: {stay ? "stays" : "listings"} with one get a <strong className="font-medium text-ink">3D tour</strong> badge
            in search, and {people} can filter for them.
            {mode === "live" && ` You can add it while the ${stay ? "stay" : "listing"} stays live; Trustbrick checks it after it's up.`}
            {mode === "locked" && ` It can be added while the ${stay ? "stay" : "listing"} is live, or while it's being edited, but not while it's in review or closed.`}
          </p>
          {canChange && (
            <Link href={editHref} className="wbtn wbtn-secondary wbtn-sm">
              Add a virtual tour
            </Link>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Virtual tour"
      description={
        tour.hidden
          ? `What ${people} with Trustbrick Plus will see once it's shown again.`
          : `What ${people} with Trustbrick Plus see when they open the tour. Everyone else sees that ${stay ? "the stay" : "the listing"} has one.`
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href={`/properties/${referenceId}/tour`} className="wbtn wbtn-ghost wbtn-sm">
            Open larger
          </Link>
          {canChange && (
            <Link href={editHref} className="wbtn wbtn-secondary wbtn-sm">
              {mode === "live" ? "Change the tour" : "Edit the tour"}
            </Link>
          )}
        </div>
      }
    >
      {hidden}
      <TourViewer tour={tour} title={title} />
    </Card>
  );
}

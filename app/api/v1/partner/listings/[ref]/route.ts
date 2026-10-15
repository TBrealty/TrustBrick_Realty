import { apiRoute } from "@/lib/api/http";
import { can } from "@/lib/authz";
import { formatListingPrice } from "@/lib/format";
import { STATUS_LABELS, isEditable } from "@/lib/listings/lifecycle";
import { getListingForActor } from "@/lib/services/listings/queries";
import { capturesWaiting, listingCaptures, scheduleCaptureProcessing } from "@/lib/services/tour-captures";
import { tourDataForProperty } from "@/lib/services/tours";
import { isLiveForTours } from "@/lib/tours/terms";

/**
 * One of the person's listings, with its virtual tour and how it can be changed now:
 * `tourMode` is "draft" (editable), "live" (changes show at once and are checked after),
 * "locked" (in review or closed) or "view" (not theirs to change). `captures` are 360° photos
 * taken with the app's guided camera that are still being made (or that failed).
 */
export const GET = apiRoute<{ ref: string }>("v1.partner.listing", { auth: "user" }, async ({ actor, params }) => {
  const a = await actor();
  const l = await getListingForActor(a, params.ref);
  const [tour, captures] = await Promise.all([tourDataForProperty(l.propertyId), listingCaptures(l.id)]);
  // Anything waiting for the stitcher (say, it was down) gets another go when the agent looks.
  if (await capturesWaiting(l.id)) scheduleCaptureProcessing();
  const team = a.workspace === "professional" && can(a, "listings.edit");
  return {
    referenceId: l.referenceId,
    title: l.title,
    status: l.status,
    statusLabel: STATUS_LABELS[l.status],
    statusReason: l.statusReason,
    purpose: l.purpose,
    price: formatListingPrice(l.pricing.price, l.purpose),
    place: [l.location.locality, l.location.city].filter(Boolean).join(", "),
    cover: l.media.find((m) => m.kind === "photo")?.thumbnailUrl ?? null,
    photos: l.media.filter((m) => m.kind === "photo").length,
    stats: l.stats,
    publicUrl: l.status === "published" ? `/listings/${l.referenceId}` : null,
    tour: {
      ...tour,
      rooms: l.media.filter((m) => m.kind === "panorama").map((m) => ({ id: m.id, name: m.altText ?? "", url: m.url, thumbnailUrl: m.thumbnailUrl })),
      model: tour.model ? { ...tour.model, id: l.media.find((m) => m.kind === "model_3d")?.id ?? null, sizeBytes: l.media.find((m) => m.kind === "model_3d")?.sizeBytes ?? null } : null,
    },
    tourMode: !team ? "view" : isEditable(l.status) ? "draft" : isLiveForTours(l.status) ? "live" : "locked",
    captures,
    tourReviewWaiting: l.cases.some((c) => c.caseType === "tour_review" && (c.status === "open" || c.status === "in_review")),
  };
});

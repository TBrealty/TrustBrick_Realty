import { apiRoute } from "@/lib/api/http";
import { notFound } from "@/lib/errors";
import { getListing, savedPropertyIds } from "@/lib/listings/queries";
import { enquiryContext } from "@/lib/services/crm";
import { canViewTour } from "@/lib/services/tours";

/**
 * One public listing (live, or recently closed), as the website's listing page shows it, plus
 * whether it's saved, whether this person can open its virtual tour, and how to contact the
 * agent. Never the exact address of a stay.
 */
export const GET = apiRoute<{ ref: string }>("v1.listings.detail", { auth: "optional" }, async ({ params, person }) => {
  const listing = await getListing(params.ref);
  if (!listing) throw notFound();
  const { stay, ...rest } = listing;
  const [saved, tourOpen, contact] = await Promise.all([
    person ? savedPropertyIds(person.userId, [listing.propertyId]).then((s) => s.has(listing.propertyId)) : false,
    listing.tour ? canViewTour({ userId: person?.userId ?? null, actor: null }, listing.propertyId) : false,
    listing.status === "published" && !stay ? enquiryContext(listing.referenceId, person?.userId ?? null) : null,
  ]);
  return {
    ...rest,
    // The host's account ID stays on the server; their public profile is enough.
    stay: stay ? { ...stay, hostUserId: undefined } : null,
    saved,
    tourAccess: listing.tour ? (tourOpen ? "open" : person ? "plus_required" : "sign_in_required") : null,
    contact,
  };
});

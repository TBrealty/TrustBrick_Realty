import { ApiResponse, apiRoute } from "@/lib/api/http";
import { notFound } from "@/lib/errors";
import { getListing } from "@/lib/listings/queries";
import { canViewTour, tourDataForProperty } from "@/lib/services/tours";
import { hasTour } from "@/lib/tours/terms";

/**
 * A listing's virtual tour: 360° rooms, the 3D model and the hosted tour link. Plus members only
 * (403 with reason PLUS_REQUIRED or SIGN_IN_REQUIRED otherwise). The files themselves come from
 * /media/… and need the same bearer token.
 */
export const GET = apiRoute<{ ref: string }>("v1.listings.tour", { auth: "optional" }, async ({ params, person }) => {
  const listing = await getListing(params.ref);
  if (!listing || !hasTour(listing.tour)) throw notFound();
  if (!(await canViewTour({ userId: person?.userId ?? null, actor: null }, listing.propertyId))) {
    return new ApiResponse(
      {
        error: {
          code: person ? "FORBIDDEN" : "UNAUTHORIZED",
          reason: person ? "PLUS_REQUIRED" : "SIGN_IN_REQUIRED",
          message: person ? "Virtual tours are part of Trustbrick Plus." : "Sign in to open the virtual tour.",
          summary: listing.tour,
        },
      },
      person ? 403 : 401,
    );
  }
  const tour = await tourDataForProperty(listing.propertyId);
  return { rooms: tour.rooms, model: tour.model, link: tour.link };
});

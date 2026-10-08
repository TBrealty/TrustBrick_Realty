import { apiRoute } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { LISTING_KINDS, type ListingKind } from "@/lib/listings/filters";
import { getBrowseOptions } from "@/lib/listings/queries";

/** What the search filters offer for a kind of listing: cities and localities, types, amenities. */
export const GET = apiRoute("v1.listings.options", { auth: "public" }, async ({ url }) => {
  const kind = url.searchParams.get("kind");
  if (!LISTING_KINDS.includes(kind as ListingKind)) throw new AppError("VALIDATION_ERROR", `Say which kind: ${LISTING_KINDS.join(", ")}.`, { kind: "Choose a kind" });
  return getBrowseOptions(kind as ListingKind);
});

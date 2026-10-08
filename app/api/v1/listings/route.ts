import { apiRoute, rawParams } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { LISTING_KINDS, type ListingKind, parseFilters } from "@/lib/listings/filters";
import { savedPropertyIds, searchListings } from "@/lib/listings/queries";

/**
 * Search, with the website's filters and the same query parameters (`?kind=rent&city=hyderabad
 * &bhk=2&tour=1&sort=price_asc…`). Pages of 12; pass `nextCursor` back as `cursor` for more.
 * Signed in, each listing says whether it's saved.
 */
export const GET = apiRoute("v1.listings.search", { auth: "optional" }, async ({ url, person }) => {
  const kind = url.searchParams.get("kind");
  if (!LISTING_KINDS.includes(kind as ListingKind)) throw new AppError("VALIDATION_ERROR", `Say which kind: ${LISTING_KINDS.join(", ")}.`, { kind: "Choose a kind" });
  const filters = parseFilters(kind as ListingKind, rawParams(url));
  const result = await searchListings(kind as ListingKind, filters);
  const saved = person ? await savedPropertyIds(person.userId, result.items.map((i) => i.propertyId)) : new Set<string>();
  return { ...result, items: result.items.map((i) => ({ ...i, saved: saved.has(i.propertyId) })) };
});

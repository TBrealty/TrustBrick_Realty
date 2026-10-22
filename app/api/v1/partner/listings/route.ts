import { apiRoute, created, rawParams, readJson } from "@/lib/api/http";
import { z } from "zod";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { createDraft } from "@/lib/services/listings/onboarding";
import { listListingsForActor, listingGroupCounts, listingTableFilters } from "@/lib/services/listings/queries";
import { parsePage } from "@/lib/services/pagination";

/**
 * The listings in the person's scope, as the website's Properties list: `?group=active`, `?q=`,
 * `?tour=has`, `?sort=`. `counts` is how many are in each status group, for the filter chips.
 */
export const GET = apiRoute("v1.partner.listings", { auth: "user" }, async ({ actor, url }) => {
  const a = await actor();
  const params = rawParams(url);
  const [page, counts] = await Promise.all([listListingsForActor(a, listingTableFilters.parse(params), parsePage(params.page)), listingGroupCounts(a)]);
  return { ...page, counts, rows: page.rows.map((r) => ({ ...r, statusLabel: STATUS_LABELS[r.status] })) };
});

/**
 * Onboards a property: `{ purpose, propertyType, localityId, line1, line2?, landmark?, postalCode?,
 * mapLink? }` creates the draft (property and listing) → `201 { referenceId }`. Then fill in the
 * steps (details, pricing, amenities, photos) and submit it.
 */
export const POST = apiRoute("v1.partner.listing_create", { auth: "user" }, async ({ actor, request, requestContext }) => {
  return created(await createDraft(await actor(), await readJson(request, z.record(z.string(), z.unknown())), requestContext));
});

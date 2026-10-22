import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateListingTerms } from "@/lib/services/listings/card";

/**
 * Quick changes to a live listing, with no new review: price, deposit, maintenance, availability
 * and an offer (TERMS_SCHEMAS; PG room rents and beds; a homestay's nightly prices and stay
 * lengths). Every change is audited, and price changes go into the price history.
 */
export const PUT = apiRoute<{ ref: string }>("v1.partner.listing_terms", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  return updateListingTerms(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext);
});

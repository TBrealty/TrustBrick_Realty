import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updatePricing } from "@/lib/services/listings/onboarding";

/** Price and terms, by purpose (PRICING_SCHEMAS). PGs send `rooms: [{ occupancy, rentPerBed, depositAmount?, bedsAvailable, hasAc, attachedBathroom }]`. Only while the listing can be edited (a draft, or sent back). */
export const PUT = apiRoute<{ ref: string }>("v1.partner.listing_pricing", { auth: "user" }, async ({ actor, params, request }) => {
  await updatePricing(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())));
  return { saved: true };
});

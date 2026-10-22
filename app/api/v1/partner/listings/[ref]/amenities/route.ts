import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateAmenities } from "@/lib/services/listings/onboarding";

/** `{ amenities: [codes], custom: [names] }`. Only while the listing can be edited (a draft, or sent back). */
export const PUT = apiRoute<{ ref: string }>("v1.partner.listing_amenities", { auth: "user" }, async ({ actor, params, request }) => {
  await updateAmenities(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())));
  return { saved: true };
});

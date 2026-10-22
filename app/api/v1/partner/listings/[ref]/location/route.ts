import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateLocation } from "@/lib/services/listings/onboarding";

/** Where the property is: `{ localityId, line1, line2?, landmark?, postalCode?, mapLink? }` (a Google or Apple Maps link, or one built from GPS, sets the pin). Only while the listing can be edited (a draft, or sent back). */
export const PUT = apiRoute<{ ref: string }>("v1.partner.listing_location", { auth: "user" }, async ({ actor, params, request }) => {
  await updateLocation(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())));
  return { saved: true };
});

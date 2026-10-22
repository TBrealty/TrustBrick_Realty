import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateDetails } from "@/lib/services/listings/onboarding";

/** The property's details, by category (lib/listings/onboarding-schema DETAILS_SCHEMAS). Only while the listing can be edited (a draft, or sent back). */
export const PUT = apiRoute<{ ref: string }>("v1.partner.listing_details", { auth: "user" }, async ({ actor, params, request }) => {
  await updateDetails(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())));
  return { saved: true };
});

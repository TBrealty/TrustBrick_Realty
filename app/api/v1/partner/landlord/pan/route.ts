import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { saveLandlordPan } from "@/lib/services/rent/landlords";

/** The landlord's PAN, for their tenants' rent receipts: `{ pan }`. */
export const PUT = apiRoute("v1.partner.landlord_pan", { auth: "user" }, async ({ actor, request, requestContext }) => {
  await saveLandlordPan(await actor(), await readJson(request, z.object({ pan: z.unknown() })), requestContext);
  return { ok: true };
});

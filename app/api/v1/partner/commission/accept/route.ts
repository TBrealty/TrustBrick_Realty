import { apiRoute } from "@/lib/api/http";
import { acceptCommissionTerms } from "@/lib/services/commission";

/** Accepts the commission terms for the organization (its admin, or an independent agent). */
export const POST = apiRoute("v1.partner.commission_accept", { auth: "user" }, async ({ actor, requestContext }) => {
  await acceptCommissionTerms(await actor(), requestContext);
  return { accepted: true };
});

import { apiRoute } from "@/lib/api/http";
import { purposesForRoles } from "@/lib/authz/catalog";
import { getOnboardingOptions } from "@/lib/services/listings/onboarding";
import { listingAgentChoices, needsListingAgent } from "@/lib/services/members";

/**
 * What onboarding a property offers: property types (with the purposes each allows), cities
 * with their localities, and amenities. `purposes` are those this person may list (hosts list
 * homestays only). `agents` is set for Operators, who choose whose listing it is.
 */
export const GET = apiRoute("v1.partner.onboarding_options", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  const [options, agents] = await Promise.all([getOnboardingOptions(), needsListingAgent(a) ? listingAgentChoices(a) : null]);
  return { ...options, purposes: purposesForRoles(a.roles), agents };
});

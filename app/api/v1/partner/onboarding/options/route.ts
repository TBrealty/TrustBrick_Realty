import { apiRoute } from "@/lib/api/http";
import { purposesForRoles } from "@/lib/authz/catalog";
import { getOnboardingOptions } from "@/lib/services/listings/onboarding";

/**
 * What onboarding a property offers: property types (with the purposes each allows), cities
 * with their localities, and amenities. `purposes` are those this person may list (hosts list
 * homestays only).
 */
export const GET = apiRoute("v1.partner.onboarding_options", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  return { ...(await getOnboardingOptions()), purposes: purposesForRoles(a.roles) };
});

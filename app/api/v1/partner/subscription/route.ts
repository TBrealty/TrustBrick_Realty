import { apiRoute } from "@/lib/api/http";
import { canManagePartnerSubscription, listPlans, overviewFor, ownHistory } from "@/lib/services/subscriptions";

/** The organization's partner plan: what it's on, the plans on offer, its history, and whether this person may change it. */
export const GET = apiRoute("v1.partner.subscription", { auth: "user" }, async ({ actor }) => {
  const a = await actor();
  const subject = { kind: "organization" as const, organizationId: a.organization.id };
  const [overview, history, plans] = await Promise.all([overviewFor(subject), ownHistory(subject), listPlans("partner")]);
  return { overview, history, plans, canManage: canManagePartnerSubscription(a) };
});

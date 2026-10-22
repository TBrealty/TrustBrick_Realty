import { apiRoute, rawParams } from "@/lib/api/http";
import { assertCan } from "@/lib/authz";
import { purposesForRoles } from "@/lib/authz/catalog";
import { acceptanceFor, canAcceptTerms, getGstPercent, ledgerFilters, listLedger, ratesFor } from "@/lib/services/commission";
import { parsePage } from "@/lib/services/pagination";

/**
 * The organization's commission to Trustbrick, as on the website: its rates and GST, whether the
 * terms are accepted (listings can't be submitted until they are), and the ledger
 * (`?status=due|paid|waived|all`, `?month=YYYY-MM`, `?page=`).
 */
export const GET = apiRoute("v1.partner.commission", { auth: "user" }, async ({ actor, url }) => {
  const a = await actor();
  assertCan(a, "commission.view");
  const params = rawParams(url);
  const orgId = a.organization.id;
  const [rates, gstPercent, ledger] = await Promise.all([ratesFor(orgId), getGstPercent(), listLedger(a, ledgerFilters.parse(params), parsePage(params.page))]);
  return { rates, gstPercent, ledger, acceptance: await acceptanceFor(orgId, undefined, rates), mayAccept: canAcceptTerms(a), services: purposesForRoles(a.roles) };
});

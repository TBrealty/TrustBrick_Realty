import { apiRoute, rawParams } from "@/lib/api/http";
import { leadFilters, listLeads } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

/** The person's leads (their scope: own, team or organization): `?open=1`, `?status=new`, `?q=`, `?page=`. */
export const GET = apiRoute("v1.partner.leads", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  return listLeads(await actor(), leadFilters.parse(params), parsePage(params.page));
});

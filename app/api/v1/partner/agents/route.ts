import { apiRoute, rawParams } from "@/lib/api/http";
import { agentFilters, listAgents } from "@/lib/services/agents";
import { parsePage } from "@/lib/services/pagination";

/** The organization's agents (broker admins and above): `?q=`, `?status=`, `?sort=`, `?page=`. */
export const GET = apiRoute("v1.partner.agents", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  return listAgents(await actor(), agentFilters.parse(params), parsePage(params.page));
});

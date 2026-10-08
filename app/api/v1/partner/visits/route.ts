import { apiRoute, rawParams } from "@/lib/api/http";
import { listVisits, visitFilters } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

/** Site visits: `?upcoming=1` for what's coming, or `?status=`. */
export const GET = apiRoute("v1.partner.visits", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  return listVisits(await actor(), visitFilters.parse(params), parsePage(params.page));
});

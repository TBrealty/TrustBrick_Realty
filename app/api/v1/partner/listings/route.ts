import { apiRoute, rawParams } from "@/lib/api/http";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { listListingsForActor, listingTableFilters } from "@/lib/services/listings/queries";
import { parsePage } from "@/lib/services/pagination";

/** The listings in the person's scope, as the website's Properties list: `?group=active`, `?q=`, `?tour=has`. */
export const GET = apiRoute("v1.partner.listings", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  const page = await listListingsForActor(await actor(), listingTableFilters.parse(params), parsePage(params.page));
  return { ...page, rows: page.rows.map((r) => ({ ...r, statusLabel: STATUS_LABELS[r.status] })) };
});

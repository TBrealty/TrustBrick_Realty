import { apiRoute } from "@/lib/api/http";
import { resolveRange } from "@/lib/range";
import { listingPerformance } from "@/lib/services/dashboard";

/** Views, leads, visits and saves per listing for the range (`?range=`), busiest first. */
export const GET = apiRoute("v1.partner.performance", { auth: "user" }, async ({ actor, url }) => {
  const range = resolveRange({ range: url.searchParams.get("range") ?? "30d" });
  return { range: { key: range.key, label: range.label }, rows: await listingPerformance(await actor(), range) };
});

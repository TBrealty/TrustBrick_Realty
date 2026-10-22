import { apiRoute } from "@/lib/api/http";
import { resolveRange } from "@/lib/range";
import { professionalDashboard } from "@/lib/services/dashboard";

/** The workspace dashboard, as on the website: `?range=7d|30d|90d|year|12m` (default 30 days). */
export const GET = apiRoute("v1.partner.dashboard", { auth: "user" }, async ({ actor, url }) => {
  const range = resolveRange({ range: url.searchParams.get("range") ?? "30d" });
  return { range: { key: range.key, label: range.label, previous: range.previous.label }, ...(await professionalDashboard(await actor(), range)) };
});

import { apiRoute } from "@/lib/api/http";
import { listPlans } from "@/lib/services/subscriptions";

/** The plans on sale: for people (`?for=customer`, the default) or for agents and hosts (`?for=partner`). */
export const GET = apiRoute("v1.plans", { auth: "public" }, async ({ url }) => ({
  plans: await listPlans(url.searchParams.get("for") === "partner" ? "partner" : "customer"),
}));

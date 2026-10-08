import { apiRoute } from "@/lib/api/http";
import { overviewFor } from "@/lib/services/subscriptions";

/** The person's own plan: their subscription (if any), the plans, and whether a free trial is open to them. */
export const GET = apiRoute("v1.subscription", { auth: "user" }, async ({ person }) => overviewFor({ kind: "user", userId: person!.userId }));

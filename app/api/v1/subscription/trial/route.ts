import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { overviewFor, startTrial } from "@/lib/services/subscriptions";

/** Starts the person's one free trial: `{ plan: "customer_plus", cycle: "monthly" | "yearly" }`. No payment needed. */
export const POST = apiRoute("v1.subscription.trial", { auth: "user" }, async ({ request, person, requestContext }) => {
  const body = await readJson(request, z.record(z.string(), z.unknown()));
  const p = person!;
  await startTrial({ userId: p.userId, audit: { kind: "person", userId: p.userId, referenceId: p.referenceId, role: "customer" } }, { kind: "user", userId: p.userId }, body, requestContext);
  return created(await overviewFor({ kind: "user", userId: p.userId }));
});

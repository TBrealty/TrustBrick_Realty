import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/authz/actor";
import { canManagePartnerSubscription, startTrial } from "@/lib/services/subscriptions";

function partner(actor: Actor) {
  if (!canManagePartnerSubscription(actor)) throw new AppError("FORBIDDEN", "Your organization's admin manages its subscription.");
  return { who: { userId: actor.userId, audit: actor }, subject: { kind: "organization" as const, organizationId: actor.organization.id } };
}

/** Starts the partner plan's free trial: `{ plan, cycle }`. */
export const POST = apiRoute("v1.partner.subscription_trial", { auth: "user" }, async ({ actor, request, requestContext }) => {
  const { who, subject } = partner(await actor());
  return startTrial(who, subject, await readJson(request, z.record(z.string(), z.unknown())), requestContext);
});

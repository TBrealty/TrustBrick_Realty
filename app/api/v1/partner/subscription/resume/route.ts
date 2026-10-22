import { apiRoute } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/authz/actor";
import { canManagePartnerSubscription, resumeOwn } from "@/lib/services/subscriptions";

function partner(actor: Actor) {
  if (!canManagePartnerSubscription(actor)) throw new AppError("FORBIDDEN", "Your organization's admin manages its subscription.");
  return { who: { userId: actor.userId, audit: actor }, subject: { kind: "organization" as const, organizationId: actor.organization.id } };
}

/** Lets a cancelled plan renew again. */
export const POST = apiRoute("v1.partner.subscription_resume", { auth: "user" }, async ({ actor, requestContext }) => {
  const { who, subject } = partner(await actor());
  return resumeOwn(who, subject, requestContext);
});

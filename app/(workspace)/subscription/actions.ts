"use server";

import { formObject, runAction } from "@/lib/actions";
import { AppError, type ActionResult } from "@/lib/errors";
import type { Actor } from "@/lib/authz/actor";
import { canManagePartnerSubscription, cancelOwn, choosePlan, resumeOwn, startTrial } from "@/lib/services/subscriptions";

type Result = ActionResult<unknown>;
const paths = ["/subscription", "/plans", "/dashboard"];

/** The organization's subscription, managed by its admin or the sole trader. */
function partner(actor: Actor) {
  if (!canManagePartnerSubscription(actor)) throw new AppError("FORBIDDEN", "Your organization's admin manages its subscription.");
  return { who: { userId: actor.userId, audit: actor }, subject: { kind: "organization" as const, organizationId: actor.organization.id } };
}

export async function startTrialAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.trial", (a, ctx) => {
    const { who, subject } = partner(a);
    return startTrial(who, subject, formObject(form), ctx);
  }, { revalidate: paths });
  return r.ok ? { ok: true, message: `Your ${(r.data as { trialDays: number }).trialDays}-day free trial has started.` } : r;
}

export async function choosePlanAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.choose", (a, ctx) => {
    const { who, subject } = partner(a);
    return choosePlan(who, subject, formObject(form), ctx);
  }, { revalidate: paths });
  return r.ok
    ? { ok: true, message: (r.data as { action: string }).action === "change_requested" ? "Request sent. The team will be in touch." : "Plan chosen. The team will contact you to arrange payment." }
    : r;
}

export async function cancelAction(): Promise<Result> {
  const r = await runAction("subscription.cancel", (a, ctx) => {
    const { who, subject } = partner(a);
    return cancelOwn(who, subject, ctx);
  }, { revalidate: paths });
  return r.ok ? { ok: true, message: "Cancelled." } : r;
}

export async function resumeAction(): Promise<Result> {
  const r = await runAction("subscription.resume", (a, ctx) => {
    const { who, subject } = partner(a);
    return resumeOwn(who, subject, ctx);
  }, { revalidate: paths });
  return r.ok ? { ok: true, message: "Your plan will renew." } : r;
}

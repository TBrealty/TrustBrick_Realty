"use server";

import { formObject, runAction, text } from "@/lib/actions";
import { assertCan } from "@/lib/authz";
import type { ActionResult } from "@/lib/errors";
import { confirmPassword } from "@/lib/services/reauth";
import { changePlan, extendTrial, grantSubscription, pauseSubscription, recordPayment, resumeSubscription, revokeSubscription, updatePlan } from "@/lib/services/subscriptions";

type Result = ActionResult<unknown>;
const paths = ["/subscriptions", "/plans", "/dashboard", "/users", "/organizations"];

export async function recordPaymentAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.payment", (a, ctx) => recordPayment(a, text(form, "ref"), formObject(form), ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: "Payment recorded. The plan is active." } : r;
}

export async function extendTrialAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.extend", (a, ctx) => extendTrial(a, text(form, "ref"), { ...formObject(form), reason: text(form, "reason") }, ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: "Trial extended." } : r;
}

export async function changePlanAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.change", (a, ctx) => changePlan(a, text(form, "ref"), formObject(form), ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: "Plan changed." } : r;
}

export async function grantAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("subscription.grant", (a, ctx) => grantSubscription(a, formObject(form), ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: `Given as ${(r.data as { referenceId: string }).referenceId}.` } : r;
}

/** Plan prices and trials: SuperAdmin, with their password. */
export async function updatePlanAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction(
    "plan.update",
    async (a, ctx) => {
      assertCan(a, "settings.manage", "platform");
      await confirmPassword(a.userId, form.get("password"));
      await updatePlan(a, formObject(form), ctx);
    },
    { revalidate: paths },
  );
  return r.ok ? { ok: true, message: "Plan saved. Existing subscribers keep their price." } : r;
}

/**
 * Pause, resume and revoke, called directly from the subscription controls on the Users list's
 * View card, a user's page, an organization's page and the subscriptions list. They don't
 * revalidate: the control refreshes what's on screen itself, so an open View card stays open
 * even when the change moves the person out of a filtered list.
 */
export async function pauseSubscriptionAction(ref: string, reason: string, until: string): Promise<Result> {
  const r = await runAction("subscription.pause", (a, ctx) => pauseSubscription(a, String(ref), { reason: String(reason ?? ""), until: String(until ?? "") }, ctx));
  return r.ok ? { ok: true, message: "Paused. They've been told why." } : r;
}

export async function resumeSubscriptionAction(ref: string, note: string): Promise<Result> {
  const r = await runAction("subscription.resume_team", (a, ctx) => resumeSubscription(a, String(ref), { reason: String(note ?? "") }, ctx));
  return r.ok ? { ok: true, message: "Resumed, with the paused time added back." } : r;
}

export async function revokeSubscriptionAction(ref: string, reason: string): Promise<Result> {
  const r = await runAction("subscription.revoke", (a, ctx) => revokeSubscription(a, String(ref), { reason: String(reason ?? "") }, ctx));
  return r.ok ? { ok: true, message: "Revoked. They've been told why." } : r;
}

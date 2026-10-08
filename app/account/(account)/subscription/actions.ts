"use server";

import { formObject, runPersonAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { cancelOwn, choosePlan, resumeOwn, startTrial } from "@/lib/services/subscriptions";

type Result = ActionResult<unknown>;
const paths = ["/account/subscription", "/plans"];
const person = (p: { userId: string; referenceId: string }) => ({ userId: p.userId, audit: { kind: "person" as const, userId: p.userId, referenceId: p.referenceId, role: "customer" } });

export async function startTrialAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runPersonAction("subscription.trial", (p, ctx) => startTrial(person(p!), { kind: "user", userId: p!.userId }, formObject(form), ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: `Your ${(r.data as { trialDays: number }).trialDays}-day free trial has started.` } : r;
}

export async function choosePlanAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runPersonAction("subscription.choose", (p, ctx) => choosePlan(person(p!), { kind: "user", userId: p!.userId }, formObject(form), ctx), { revalidate: paths });
  return r.ok
    ? { ok: true, message: (r.data as { action: string }).action === "change_requested" ? "Request sent. The team will be in touch." : "Plan chosen. The team will contact you to arrange payment." }
    : r;
}

export async function cancelAction(): Promise<Result> {
  const r = await runPersonAction("subscription.cancel", (p, ctx) => cancelOwn(person(p!), { kind: "user", userId: p!.userId }, ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: "Cancelled." } : r;
}

export async function resumeAction(): Promise<Result> {
  const r = await runPersonAction("subscription.resume", (p, ctx) => resumeOwn(person(p!), { kind: "user", userId: p!.userId }, ctx), { revalidate: paths });
  return r.ok ? { ok: true, message: "Your plan will renew." } : r;
}

"use server";

import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { reinstateUser, suspendUser, updateUser, verifyUserEmail } from "@/lib/services/users";

type Result = ActionResult<unknown>;
const paths = (ref: string) => [`/users/${ref}`, "/users", "/dashboard"];

export async function suspendUserAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("user.suspend", (a, ctx) => suspendUser(a, ref, text(form, "reason"), ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: `Suspended and logged out everywhere. ${(r.data as { paused: number }).paused} listing(s) paused.` } : r;
}

export async function reinstateUserAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("user.reinstate", (a, ctx) => reinstateUser(a, ref, ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Reinstated." } : r;
}

export async function verifyUserAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("user.verify", (a, ctx) => verifyUserEmail(a, ref, ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Email marked as confirmed." } : r;
}

export async function updateUserAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("user.update", (a, ctx) => updateUser(a, ref, formObject(form), ctx), { revalidate: paths(ref) });
  return r.ok ? { ok: true, message: "Saved." } : r;
}

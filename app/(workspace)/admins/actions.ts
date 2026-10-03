"use server";

import { redirect } from "next/navigation";
import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { inviteAdmin, reinstateAdmin, revokeInvitation, setAdminPermissions, suspendAdmin } from "@/lib/services/admins";

type Result = ActionResult<unknown>;
const permissionsOf = (form: FormData) => form.getAll("permissions").filter((p): p is string => typeof p === "string");

export async function inviteAdminAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction(
    "admin.invite",
    (a, ctx) => inviteAdmin(a, { email: text(form, "email"), name: text(form, "name"), permissions: permissionsOf(form) }, form.get("password"), ctx),
    { revalidate: ["/admins", "/dashboard"] },
  );
  if (r.ok) redirect("/admins?invited=1");
  return r;
}

export async function revokeInvitationAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("admin.invite.revoke", (a, ctx) => revokeInvitation(a, text(form, "ref"), ctx), { revalidate: ["/admins"] });
  return r.ok ? { ok: true, message: "Invitation revoked." } : r;
}

export async function setAdminPermissionsAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("admin.permissions", (a, ctx) => setAdminPermissions(a, ref, permissionsOf(form), form.get("password"), ctx), {
    revalidate: [`/admins/${ref}`, "/admins"],
  });
  return r.ok ? { ok: true, message: "Permissions saved. They apply on the admin's next page load." } : r;
}

export async function suspendAdminAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("admin.suspend", (a, ctx) => suspendAdmin(a, ref, text(form, "reason"), form.get("password"), ctx), { revalidate: [`/admins/${ref}`, "/admins"] });
  return r.ok ? { ok: true, message: "Suspended and logged out everywhere." } : r;
}

export async function reinstateAdminAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("admin.reinstate", (a, ctx) => reinstateAdmin(a, ref, form.get("password"), ctx), { revalidate: [`/admins/${ref}`, "/admins"] });
  return r.ok ? { ok: true, message: "Reinstated." } : r;
}

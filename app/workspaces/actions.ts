"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/session";
import { WORKSPACE_COOKIE, getWorkspaceContext } from "@/lib/authz/session";

/** Only a membership the user really holds is ever written to the cookie; it's re-checked on every request anyway. */
export async function chooseWorkspaceAction(form: FormData) {
  const ctx = await getWorkspaceContext();
  if (ctx.state === "anonymous") redirect("/login");
  const id = form.get("membershipId");
  const chosen = ctx.workspaces.find((w) => w.membershipId === id);
  if (chosen) {
    (await cookies()).set(WORKSPACE_COOKIE, chosen.membershipId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
  }
  const next = safeRedirectPath(form.get("next"));
  redirect(next.startsWith("/workspaces") ? "/dashboard" : next);
}

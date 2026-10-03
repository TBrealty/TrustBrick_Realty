import "server-only";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import type { RequestContext } from "@/lib/services/audit";
import { type Actor, type Workspace, loadActor, loadWorkspaces } from "./actor";
import type { Permission, Scope } from "./catalog";
import { can } from "./index";

/** Which workspace the user last chose. Only a hint: validated against live memberships on every request. */
export const WORKSPACE_COOKIE = "tb_ws";

export type WorkspaceContext =
  | { state: "anonymous" }
  | { state: "customer"; userId: string; workspaces: [] }
  | { state: "choose"; userId: string; workspaces: Workspace[] }
  | { state: "ready"; userId: string; workspaces: Workspace[]; actor: Actor };

/** Resolved once per request, however many components ask. */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext> => {
  const session = await getSession();
  if (!session) return { state: "anonymous" };

  const userId = session.user.id;
  const workspaces = await loadWorkspaces(userId);
  if (workspaces.length === 0) return { state: "customer", userId, workspaces: [] };

  const hint = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const chosen = workspaces.find((w) => w.membershipId === hint) ?? (workspaces.length === 1 ? workspaces[0] : undefined);
  if (!chosen) return { state: "choose", userId, workspaces };

  const actor = await loadActor(userId, chosen.membershipId);
  if (!actor) return { state: "choose", userId, workspaces };
  return { state: "ready", userId, workspaces, actor };
});

/**
 * For workspace pages. Anonymous → log in and come back; no workspace → the customer
 * account area; several and none chosen → the chooser.
 */
export async function requireActor(returnTo: string): Promise<Actor> {
  const ctx = await getWorkspaceContext();
  switch (ctx.state) {
    case "anonymous":
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    case "customer":
      redirect("/account/profile");
    case "choose":
      redirect(`/workspaces?next=${encodeURIComponent(returnTo)}`);
    case "ready":
      return ctx.actor;
  }
}

/** For workspace pages that need a permission: renders the 403 page otherwise. */
export async function requirePermission(permission: Permission, returnTo: string, atLeast: Scope = "own"): Promise<Actor> {
  const actor = await requireActor(returnTo);
  if (!can(actor, permission, atLeast)) forbidden();
  return actor;
}

/** For server actions and route handlers: throws AppError rather than redirecting. */
export async function actorForAction(): Promise<Actor> {
  const ctx = await getWorkspaceContext();
  if (ctx.state === "anonymous") throw new AppError("UNAUTHORIZED");
  if (ctx.state !== "ready") throw new AppError("FORBIDDEN");
  return ctx.actor;
}

/** Client details for audit rows. The fronting proxy must overwrite X-Forwarded-For. */
export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

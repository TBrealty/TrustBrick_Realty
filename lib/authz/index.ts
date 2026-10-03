import type { Actor } from "./actor";
import { type Permission, type Scope, scopeRank } from "./catalog";
import { AppError } from "@/lib/errors";

export type { Actor, Workspace } from "./actor";
export type { Permission, Scope } from "./catalog";

/**
 * Central capability checks. Pages, actions and services ask these, never
 * "is this user an admin?". Deny by default.
 */

export function scopeOf(actor: Actor | null | undefined, permission: Permission): Scope | null {
  return actor?.permissions[permission] ?? null;
}

export function can(actor: Actor | null | undefined, permission: Permission, atLeast: Scope = "own"): boolean {
  const scope = scopeOf(actor, permission);
  return scope !== null && scopeRank(scope) >= scopeRank(atLeast);
}

/** Throws FORBIDDEN unless the actor holds the permission at the given scope or wider. */
export function assertCan(actor: Actor, permission: Permission, atLeast: Scope = "own"): Scope {
  const scope = scopeOf(actor, permission);
  if (scope === null || scopeRank(scope) < scopeRank(atLeast)) {
    throw new AppError("FORBIDDEN");
  }
  return scope;
}

export const canViewPlatformAnalytics = (a: Actor) => can(a, "analytics.view", "platform");
export const canViewUsers = (a: Actor) => can(a, "users.view", "platform");
export const canManageUsers = (a: Actor) => can(a, "users.manage", "platform");
export const canSuspendUsers = (a: Actor) => can(a, "users.suspend", "platform");
export const canManageAgents = (a: Actor) => can(a, "agents.manage", "platform");
export const canVerifyAgents = (a: Actor) => can(a, "agents.verify", "platform");
export const canSuspendAgents = (a: Actor) => can(a, "agents.suspend", "platform");
export const canManageOrganizations = (a: Actor) => can(a, "organizations.manage", "platform");
export const canApproveListings = (a: Actor) => can(a, "listings.approve", "platform");
export const canRejectListings = (a: Actor) => can(a, "listings.reject", "platform");
export const canRemoveListings = (a: Actor) => can(a, "properties.remove", "platform");
export const canManageSystemSettings = (a: Actor) => can(a, "settings.manage", "platform");
export const canViewAdmins = (a: Actor) => can(a, "admins.view", "platform");
export const canCreateAdmin = (a: Actor) => can(a, "admins.create", "platform");
export const canManageAdmins = (a: Actor) => can(a, "admins.manage", "platform");
export const canOnboardProperty = (a: Actor) => can(a, "listings.create");
export const canManageOwnListings = (a: Actor) => can(a, "listings.edit");
export const canViewOwnLeads = (a: Actor) => can(a, "leads.view");

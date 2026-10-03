import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { Actor } from "./actor";
import type { Permission } from "./catalog";
import { assertCan } from "./index";

/**
 * Scope → SQL. Every scoped query appends one of these predicates, so "which rows may
 * this actor see" is decided in the database query itself, not by filtering results.
 * Written against fixed table aliases; the caller's query must use them.
 */

const ids = (values: string[]) => sql.param(values);

/** Listings, aliased `l`. Responsibility comes from listing_agents, never from created_by. */
export function listingScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`l.organization_id = ${actor.organization.id}`;
    case "team":
      return sql`EXISTS (SELECT 1 FROM marketplace.listing_agents la
                         WHERE la.listing_id = l.id AND la.ended_at IS NULL AND la.membership_id = ANY(${ids(actor.teamMembershipIds)}::uuid[]))`;
    case "own":
      return sql`EXISTS (SELECT 1 FROM marketplace.listing_agents la
                         WHERE la.listing_id = l.id AND la.ended_at IS NULL AND la.agent_user_id = ${actor.userId})`;
  }
}

/** Leads, aliased `ld`. */
export function leadScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`ld.organization_id = ${actor.organization.id}`;
    case "team":
      return sql`(ld.organization_id = ${actor.organization.id} AND ld.agent_membership_id = ANY(${ids(actor.teamMembershipIds)}::uuid[]))`;
    case "own":
      return sql`(ld.organization_id = ${actor.organization.id} AND ld.agent_user_id = ${actor.userId})`;
  }
}

/** Visits, aliased `v`. */
export function visitScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`v.organization_id = ${actor.organization.id}`;
    case "team":
      return sql`(v.organization_id = ${actor.organization.id} AND EXISTS (
                    SELECT 1 FROM orgs.memberships vm WHERE vm.user_id = v.agent_user_id
                       AND vm.id = ANY(${ids(actor.teamMembershipIds)}::uuid[])))`;
    case "own":
      return sql`(v.organization_id = ${actor.organization.id} AND v.agent_user_id = ${actor.userId})`;
  }
}

/** Contacts, aliased `c`: an agent sees the contacts behind their own leads. */
export function contactScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`c.organization_id = ${actor.organization.id}`;
    case "team":
    case "own":
      return sql`(c.organization_id = ${actor.organization.id} AND EXISTS (
                    SELECT 1 FROM crm.leads ld WHERE ld.contact_id = c.id AND ld.deleted_at IS NULL AND ${leadScope(actor, "leads.view")}))`;
  }
}

/** Homestay bookings, aliased `b`. The host is the listing's primary agent or host. */
export function bookingScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`b.organization_id = ${actor.organization.id}`;
    case "team":
      return sql`(b.organization_id = ${actor.organization.id} AND EXISTS (
                    SELECT 1 FROM orgs.memberships bm WHERE bm.user_id = b.host_user_id
                       AND bm.id = ANY(${ids(actor.teamMembershipIds)}::uuid[])))`;
    case "own":
      return sql`(b.organization_id = ${actor.organization.id} AND b.host_user_id = ${actor.userId})`;
  }
}

/**
 * Stay conversations (alias `c`), on the host's side. Mirrors bookingScope: a host sees their
 * own guests' messages; an organization-wide scope sees the organization's.
 */
export function conversationScope(actor: Actor, permission: Permission): SQL {
  const scope = assertCan(actor, permission);
  switch (scope) {
    case "platform":
      return sql`TRUE`;
    case "org":
      return sql`c.organization_id = ${actor.organization.id}`;
    case "team":
      return sql`(c.organization_id = ${actor.organization.id} AND EXISTS (
                    SELECT 1 FROM orgs.memberships cm WHERE cm.user_id = c.host_user_id
                       AND cm.id = ANY(${ids(actor.teamMembershipIds)}::uuid[])))`;
    case "own":
      return sql`(c.organization_id = ${actor.organization.id} AND c.host_user_id = ${actor.userId})`;
  }
}

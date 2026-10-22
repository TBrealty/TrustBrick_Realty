import "server-only";
import { sql } from "drizzle-orm";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import type { Permission, Scope } from "@/lib/authz/catalog";
import { bookingScope, conversationScope, leadScope, listingScope, visitScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import type { IconName } from "@/components/workspace/icons";

/**
 * One navigation definition for every workspace. Each item names the permission (and
 * minimum scope) it needs; the sidebar shows only what the actor can open. Hiding an item
 * is a courtesy: every page checks the same permission again on the server.
 */
type NavDef = {
  label: string | ((actor: Actor) => string);
  href: string;
  icon: IconName;
  permission: Permission | Permission[];
  atLeast?: Scope;
  workspace?: "platform" | "professional";
  badge?: BadgeKey;
  exact?: boolean;
  /** Only for people who host (a host role, or any stay in their scope). */
  hosting?: boolean;
};
type SectionDef = { label?: string; items: NavDef[] };

type BadgeKey = "reviewQueue" | "openReports" | "pendingAgents" | "pendingOrganizations" | "attention" | "newLeads" | "requestedVisits" | "bookingRequests" | "pendingHosts" | "openMessages" | "unreadMessages" | "newLegalRequests" | "overdueCommission" | "commissionDue" | "pendingSubscriptions";

const scopeLabel = (actor: Actor, own: string, team: string, org: string) => {
  const s = actor.permissions["listings.view"];
  return s === "team" ? team : s === "org" ? org : own;
};

const SECTIONS: SectionDef[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard.view", exact: true }] },
  // ── Platform ──
  {
    label: "Marketplace",
    items: [
      { label: "Properties & listings", href: "/properties", icon: "building", permission: "listings.view", atLeast: "platform", workspace: "platform" },
      { label: "Approvals", href: "/approvals", icon: "inbox", permission: ["listings.approve", "verification.view", "agents.verify", "organizations.verify"], atLeast: "platform", badge: "reviewQueue" },
      { label: "Reports", href: "/reports", icon: "flag", permission: "reports.view", atLeast: "platform", badge: "openReports" },
      { label: "Bookings", href: "/bookings", icon: "calendar", permission: "bookings.view", atLeast: "platform", workspace: "platform" },
      { label: "Conversations", href: "/conversations", icon: "chat", permission: "conversations.view", atLeast: "platform" },
      { label: "Commissions", href: "/commissions", icon: "rupee", permission: "commission.view", atLeast: "platform", workspace: "platform", badge: "overdueCommission" },
      { label: "Subscriptions", href: "/subscriptions", icon: "spark", permission: "subscriptions.view", atLeast: "platform", workspace: "platform", badge: "pendingSubscriptions" },
      { label: "Legal verification", href: "/legal-requests", icon: "scale", permission: "support.view", atLeast: "platform", badge: "newLegalRequests" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: "/users", icon: "users", permission: "users.view", atLeast: "platform" },
      { label: "Agents", href: "/agents", icon: "badge", permission: "agents.view", atLeast: "platform", badge: "pendingAgents" },
      { label: "Organizations", href: "/organizations", icon: "briefcase", permission: "organizations.view", atLeast: "platform", badge: "pendingOrganizations" },
      { label: "Hosts", href: "/hosts", icon: "home", permission: "hosts.view", atLeast: "platform", badge: "pendingHosts" },
      { label: "Admins", href: "/admins", icon: "shield", permission: "admins.view", atLeast: "platform" },
    ],
  },
  // ── Professional ──
  {
    label: "Properties",
    items: [
      {
        label: (a) => (isHostOnly(a) ? "My stays" : scopeLabel(a, "My properties", "Team properties", "Organization properties")),
        href: "/properties",
        icon: "building",
        permission: "listings.view",
        workspace: "professional",
        badge: "attention",
      },
      { label: (a) => (isHostOnly(a) ? "List a home" : "Onboard property"), href: "/properties/new", icon: "plus", permission: "listings.create", workspace: "professional", exact: true },
    ],
  },
  {
    label: "Hosting",
    items: [
      { label: "Bookings", href: "/bookings", icon: "inbox", permission: "bookings.view", workspace: "professional", hosting: true, badge: "bookingRequests" },
      { label: "Messages", href: "/messages", icon: "chat", permission: "bookings.view", workspace: "professional", hosting: true, badge: "unreadMessages" },
      { label: "Calendar", href: "/calendar", icon: "calendar", permission: "bookings.manage", workspace: "professional", hosting: true },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: "inbox", permission: "leads.view", badge: "newLeads" },
      { label: "Clients", href: "/contacts", icon: "users", permission: "contacts.view", workspace: "professional" },
      { label: "Visits", href: "/visits", icon: "calendar", permission: "visits.view", badge: "requestedVisits" },
    ],
  },
  {
    label: "Team",
    items: [{ label: "Agents", href: "/agents", icon: "badge", permission: "agents.view", atLeast: "org", workspace: "professional" }],
  },
  {
    label: "Insights",
    items: [
      { label: "Commission", href: "/commission", icon: "rupee", permission: "commission.view", workspace: "professional", badge: "commissionDue" },
      { label: "Subscription", href: "/subscription", icon: "spark", permission: "dashboard.view", workspace: "professional" },
      { label: (a) => (a.workspace === "platform" ? "Analytics" : "Performance"), href: "/analytics", icon: "chart", permission: "analytics.view" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Contact messages", href: "/inbox", icon: "inbox", permission: "support.view", atLeast: "platform", badge: "openMessages" },
      { label: "Audit log", href: "/audit", icon: "scroll", permission: "audit.view", atLeast: "platform" },
      { label: "Platform settings", href: "/system", icon: "sliders", permission: "settings.manage", atLeast: "platform" },
    ],
  },
];

export type NavItem = { label: string; href: string; icon: IconName; badge?: number; exact?: boolean };
export type NavSection = { label?: string; items: NavItem[] };

const isHostOnly = (actor: Actor) => actor.roles.length > 0 && actor.roles.every((r) => r === "host");

const allowed = (actor: Actor, item: NavDef) =>
  (!item.workspace || item.workspace === actor.workspace) &&
  (Array.isArray(item.permission) ? item.permission : [item.permission]).some((p) => can(actor, p, item.atLeast ?? "own"));

/** Agents see the hosting pages only once they have a stay; hosts always do. */
export async function hosts(actor: Actor): Promise<boolean> {
  if (actor.roles.includes("host")) return true;
  if (actor.workspace !== "professional" || !can(actor, "listings.view")) return false;
  const { rows } = await db.execute(sql`
    SELECT EXISTS (SELECT 1 FROM marketplace.listings l WHERE l.transaction_type = 'stay' AND l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")}) AS yes`);
  return Boolean((rows[0] as { yes: boolean }).yes);
}

export async function navigationFor(actor: Actor): Promise<NavSection[]> {
  const hosting = SECTIONS.some((s) => s.items.some((i) => i.hosting && allowed(actor, i))) ? await hosts(actor) : false;
  const sections = SECTIONS.map((s) => ({ label: s.label, defs: s.items.filter((i) => allowed(actor, i) && (!i.hosting || hosting)) })).filter((s) => s.defs.length > 0);
  const wanted = new Set(sections.flatMap((s) => s.defs.map((d) => d.badge).filter(Boolean)) as BadgeKey[]);
  const badges = await badgeCounts(actor, wanted);
  return sections.map((s) => ({
    label: s.label,
    items: s.defs.map((d) => ({
      label: typeof d.label === "function" ? d.label(actor) : d.label,
      href: d.href,
      icon: d.icon,
      exact: d.exact,
      badge: d.badge ? badges[d.badge] || undefined : undefined,
    })),
  }));
}

/** Small counts for the sidebar: work waiting for this actor. One query, only for badges shown. */
async function badgeCounts(actor: Actor, wanted: Set<BadgeKey>): Promise<Partial<Record<BadgeKey, number>>> {
  if (wanted.size === 0) return {};
  const parts = [];
  if (wanted.has("reviewQueue")) {
    const types = [
      can(actor, "listings.approve", "platform") || can(actor, "verification.view", "platform") ? "listing_review" : null,
      can(actor, "agents.verify", "platform") || can(actor, "verification.view", "platform") ? "agent_application" : null,
      can(actor, "organizations.verify", "platform") || can(actor, "verification.view", "platform") ? "organization_verification" : null,
    ].filter(Boolean) as string[];
    parts.push(sql`(SELECT count(*) FROM trust.review_cases WHERE status IN ('open', 'in_review') AND case_type = ANY(${sql.param(types)}::text[]))::int AS "reviewQueue"`);
  }
  if (wanted.has("openReports")) parts.push(sql`(SELECT count(*) FROM trust.reports WHERE status = 'open')::int AS "openReports"`);
  if (wanted.has("pendingAgents")) parts.push(sql`(SELECT count(*) FROM orgs.agent_profiles WHERE status = 'pending')::int AS "pendingAgents"`);
  if (wanted.has("pendingOrganizations")) parts.push(sql`(SELECT count(*) FROM orgs.organizations WHERE status = 'pending')::int AS "pendingOrganizations"`);
  if (wanted.has("attention")) {
    parts.push(sql`(SELECT count(*) FROM marketplace.listings l WHERE l.deleted_at IS NULL AND l.status IN ('changes_requested', 'rejected')
                    AND ${listingScope(actor, "listings.view")})::int AS "attention"`);
  }
  if (wanted.has("newLeads")) {
    parts.push(sql`(SELECT count(*) FROM crm.leads ld WHERE ld.deleted_at IS NULL AND ld.status = 'new' AND ${leadScope(actor, "leads.view")})::int AS "newLeads"`);
  }
  if (wanted.has("requestedVisits")) {
    parts.push(sql`(SELECT count(*) FROM crm.visits v WHERE v.status = 'requested' AND ${visitScope(actor, "visits.view")})::int AS "requestedVisits"`);
  }
  if (wanted.has("bookingRequests")) {
    parts.push(sql`(SELECT count(*) FROM stays.bookings b WHERE b.status = 'requested' AND b.expires_at > now() AND ${bookingScope(actor, "bookings.view")})::int AS "bookingRequests"`);
  }
  if (wanted.has("openMessages")) parts.push(sql`(SELECT count(*) FROM platform.contact_messages WHERE status = 'open')::int AS "openMessages"`);
  if (wanted.has("unreadMessages")) {
    parts.push(sql`(SELECT count(*) FROM stays.conversations c WHERE ${conversationScope(actor, "bookings.view")}
                    AND EXISTS (SELECT 1 FROM stays.messages m WHERE m.conversation_id = c.id AND m.sender_role = 'guest' AND m.seq > c.host_last_read_seq))::int AS "unreadMessages"`);
  }
  if (wanted.has("overdueCommission")) {
    parts.push(sql`(SELECT count(*) FROM finance.commission_entries WHERE status = 'due' AND created_at < now() - interval '30 days')::int AS "overdueCommission"`);
  }
  if (wanted.has("commissionDue")) {
    parts.push(sql`(SELECT count(*) FROM finance.commission_entries WHERE status = 'due' AND organization_id = ${actor.organization.id})::int AS "commissionDue"`);
  }
  if (wanted.has("pendingSubscriptions")) parts.push(sql`(SELECT count(*) FROM finance.subscriptions WHERE status = 'pending_payment')::int AS "pendingSubscriptions"`);
  if (wanted.has("newLegalRequests")) parts.push(sql`(SELECT count(*) FROM platform.legal_requests WHERE status = 'new')::int AS "newLegalRequests"`);
  if (wanted.has("pendingHosts")) parts.push(sql`(SELECT count(*) FROM stays.host_profiles WHERE status = 'pending')::int AS "pendingHosts"`);
  const { rows } = await db.execute(sql`SELECT ${sql.join(parts, sql`, `)}`);
  return rows[0] as Partial<Record<BadgeKey, number>>;
}

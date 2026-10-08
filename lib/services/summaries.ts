import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { formatListingPrice } from "@/lib/format";
import { isReferenceId } from "@/lib/reference";
import { getAgent } from "./agents";
import { ORG_TYPE_LABELS, getOrganization } from "./organizations";
import { type PersonSubscriptions, subscriptionsForPerson } from "./subscriptions";
import { getHost } from "./stays/hosts";
import { getUser } from "./users";

/**
 * The "View" cards on the Users, Agents and Organizations lists: everything about one person or
 * organization in one place. Each summary goes through the same permission and scope checks as
 * its full page, and personal activity (enquiries, visits, saved homes, reports) appears only to
 * admins who may see that kind of record; otherwise the card shows counts.
 *
 * Trustbrick doesn't record purchases or tenancies yet. The nearest real signal is an enquiry the
 * agent marked "converted", so that is what the cards call a closed deal, and they say so.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const JOURNEYS = ["buy", "invest", "rent", "lease", "pg", "stay"] as const;
export type Journey = (typeof JOURNEYS)[number];

/** Which side of the marketplace a listing belongs to, matching the Buy / Invest / Rent / PG pages. */
const JOURNEY = sql`CASE WHEN l.id IS NULL THEN NULL
  WHEN l.transaction_type = 'pg' THEN 'pg'
  WHEN l.transaction_type = 'stay' THEN 'stay'
  WHEN l.transaction_type IN ('rent', 'lease') THEN l.transaction_type::text
  WHEN pt.category IN ('commercial', 'land') OR proj.status IN ('planned', 'under_construction') THEN 'invest'
  ELSE 'buy' END`;

/** Joins from a listing alias `l` (possibly NULL) to what the journey and card need. */
const LISTING_JOINS = sql`
  LEFT JOIN real_estate.properties p ON p.id = l.property_id
  LEFT JOIN real_estate.property_types pt ON pt.id = p.property_type_id
  LEFT JOIN real_estate.projects proj ON proj.id = p.project_id
  LEFT JOIN geography.addresses a ON a.id = p.address_id
  LEFT JOIN geography.places loc ON loc.id = a.place_id`;

const LISTING_COLUMNS = sql`l.reference_id AS listing_ref, l.title AS listing_title, l.price AS listing_price,
  l.transaction_type AS listing_type, l.status AS listing_status, loc.name AS listing_locality, ${JOURNEY} AS journey`;

export type ListingBrief = { referenceId: string; title: string; journey: Journey; price: string; status: string; locality: string | null };

function listingOf(r: Row): ListingBrief | null {
  if (!r.listing_ref) return null;
  return {
    referenceId: String(r.listing_ref),
    title: String(r.listing_title),
    journey: r.journey as Journey,
    price: formatListingPrice(r.listing_price === null ? null : Number(r.listing_price), String(r.listing_type)),
    status: String(r.listing_status),
    locality: (r.listing_locality as string) ?? null,
  };
}

const emptyJourneys = () => Object.fromEntries(JOURNEYS.map((j) => [j, { enquiries: 0, closed: 0 }])) as Record<Journey, { enquiries: number; closed: number }>;

// ── People (users) ───────────────────────────────────────────────────────────

export type UserSummary = {
  kind: "user";
  referenceId: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  statusReason: string | null;
  emailVerified: boolean;
  intent: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
  roles: { label: string; referenceId: string | null; detail: string | null; status: string }[];
  totals: { enquiries: number; closed: number; visits: number; bookmarks: number; reports: number };
  byJourney: Record<Journey, { enquiries: number; closed: number }>;
  enquiries: { referenceId: string; listing: ListingBrief | null; status: string; agent: string | null; message: string | null; createdAt: string }[] | null;
  visits: { referenceId: string; listing: ListingBrief | null; status: string; at: string | null }[] | null;
  bookmarks: ListingBrief[] | null;
  reports: { referenceId: string; listing: ListingBrief | null; reason: string; status: string; createdAt: string }[] | null;
  /** Their own plan and their organizations' plans, for admins who can see subscriptions. */
  subscriptions: PersonSubscriptions | null;
  canManageSubscriptions: boolean;
  href: string;
};

export async function userSummary(actor: Actor, referenceId: string): Promise<UserSummary> {
  const user = await getUser(actor, referenceId);
  const userId = user.id;
  const showEnquiries = can(actor, "leads.view", "platform");
  const showVisits = can(actor, "visits.view", "platform");
  const showReports = can(actor, "reports.view", "platform");
  const showBookmarks = can(actor, "users.manage", "platform");
  const showSubscriptions = can(actor, "subscriptions.view", "platform");

  const [profiles, journeys, visitCount, enquiries, visits, bookmarks, reports] = await Promise.all([
    db.execute(sql`
      SELECT ap.reference_id AS agent_ref, ap.status AS agent_status, ap.status_reason AS agent_reason, ap.created_at AS agent_since,
             ad.reference_id AS admin_ref, ad.level AS admin_level
        FROM identity.users u
        LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
        LEFT JOIN orgs.admin_profiles ad ON ad.user_id = u.id
       WHERE u.id = ${userId}`),
    db.execute(sql`
      SELECT ${JOURNEY} AS journey, count(*)::int AS enquiries, count(*) FILTER (WHERE ld.status = 'converted')::int AS closed
        FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id
        LEFT JOIN marketplace.listings l ON l.id = ld.listing_id ${LISTING_JOINS}
       WHERE c.user_id = ${userId} AND ld.deleted_at IS NULL
       GROUP BY 1`),
    db.execute(sql`SELECT count(*)::int AS n FROM crm.visits WHERE customer_user_id = ${userId}`),
    showEnquiries
      ? db.execute(sql`
          SELECT ld.reference_id, ld.status, ld.message, ld.created_at, ag.name AS agent, ${LISTING_COLUMNS}
            FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id
            LEFT JOIN identity.users ag ON ag.id = ld.agent_user_id
            LEFT JOIN marketplace.listings l ON l.id = ld.listing_id ${LISTING_JOINS}
           WHERE c.user_id = ${userId} AND ld.deleted_at IS NULL
           ORDER BY ld.created_at DESC LIMIT 25`)
      : null,
    showVisits
      ? db.execute(sql`
          SELECT v.reference_id, v.status, coalesce(v.scheduled_at, v.requested_for) AS at, ${LISTING_COLUMNS}
            FROM crm.visits v LEFT JOIN marketplace.listings l ON l.id = v.listing_id ${LISTING_JOINS}
           WHERE v.customer_user_id = ${userId} ORDER BY v.created_at DESC LIMIT 25`)
      : null,
    showBookmarks
      ? db.execute(sql`
          SELECT DISTINCT ON (sp.property_id) ${LISTING_COLUMNS}
            FROM marketplace.saved_properties sp
            JOIN marketplace.listings l ON l.property_id = sp.property_id AND l.deleted_at IS NULL ${LISTING_JOINS}
           WHERE sp.user_id = ${userId} ORDER BY sp.property_id, l.created_at DESC LIMIT 25`)
      : null,
    showReports
      ? db.execute(sql`
          SELECT r.reference_id, r.reason, r.status, r.created_at, ${LISTING_COLUMNS}
            FROM trust.reports r LEFT JOIN marketplace.listings l ON l.id = r.listing_id ${LISTING_JOINS}
           WHERE r.reporter_user_id = ${userId} ORDER BY r.created_at DESC LIMIT 25`)
      : null,
  ]);

  const byJourney = emptyJourneys();
  for (const r of journeys.rows as Row[]) {
    if (typeof r.journey === "string" && r.journey in byJourney) byJourney[r.journey as Journey] = { enquiries: num(r.enquiries), closed: num(r.closed) };
  }
  const allEnquiries = (journeys.rows as Row[]).reduce((n, r) => n + num(r.enquiries), 0);
  const closed = (journeys.rows as Row[]).reduce((n, r) => n + num(r.closed), 0);

  const pr = profiles.rows[0] as Row;
  const roles: UserSummary["roles"] = [];
  if (pr?.admin_ref) roles.push({ label: pr.admin_level === "superadmin" ? "SuperAdmin" : "Admin", referenceId: String(pr.admin_ref), detail: "Trustbrick staff", status: "active" });
  if (pr?.agent_ref) {
    roles.push({
      label: pr.agent_status === "pending" ? "Agent application" : "Agent",
      referenceId: String(pr.agent_ref),
      detail: pr.agent_status === "rejected" ? ((pr.agent_reason as string) ?? "Application rejected") : null,
      status: String(pr.agent_status),
    });
  }
  for (const m of user.memberships) {
    if (m.organizationReferenceId && m.roles.length && !m.roles.includes("SuperAdmin") && !m.roles.includes("Admin")) {
      roles.push({ label: m.roles.join(", "), referenceId: m.organizationReferenceId, detail: m.organization, status: m.status });
    }
  }

  return {
    kind: "user",
    referenceId: user.referenceId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    statusReason: user.statusReason,
    emailVerified: user.emailVerified,
    intent: user.intent,
    joinedAt: user.createdAt,
    lastActiveAt: user.lastActiveAt,
    roles,
    totals: { enquiries: allEnquiries, closed, visits: num((visitCount.rows[0] as Row).n), bookmarks: user.counts.bookmarks, reports: user.counts.reports },
    byJourney,
    enquiries: enquiries
      ? (enquiries.rows as Row[]).map((r) => ({
          referenceId: String(r.reference_id),
          listing: listingOf(r),
          status: String(r.status),
          agent: (r.agent as string) ?? null,
          message: (r.message as string) ?? null,
          createdAt: iso(r.created_at)!,
        }))
      : null,
    visits: visits ? (visits.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), listing: listingOf(r), status: String(r.status), at: iso(r.at) })) : null,
    bookmarks: bookmarks ? (bookmarks.rows as Row[]).map(listingOf).filter((l): l is ListingBrief => l !== null) : null,
    reports: reports
      ? (reports.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), listing: listingOf(r), reason: String(r.reason), status: String(r.status), createdAt: iso(r.created_at)! }))
      : null,
    subscriptions: showSubscriptions ? await subscriptionsForPerson(actor, userId) : null,
    canManageSubscriptions: can(actor, "subscriptions.manage", "platform"),
    href: `/users/${user.referenceId}`,
  };
}

// ── Shared: an agent's or organization's listings, leads and visits ──────────

type WorkStats = {
  listings: { total: number; live: number; inReview: number; drafts: number; other: number; byJourney: Record<Journey, number> };
  leads: { total: number; open: number; converted: number; lost: number; byJourney: Record<Journey, { enquiries: number; closed: number }> };
  visits: { total: number; upcoming: number; completed: number };
  recentListings: (ListingBrief & { updatedAt: string; agent: string | null })[];
  recentLeads: { referenceId: string; customer: string; listing: ListingBrief | null; status: string; createdAt: string }[] | null;
};

async function workStats(actor: Actor, listingWhere: SQL, leadWhere: SQL, visitWhere: SQL): Promise<WorkStats> {
  const showLeads = can(actor, "leads.view", "org");
  const [listingRows, leadRows, visitRows, recent, leads] = await Promise.all([
    db.execute(sql`
      SELECT l.status, ${JOURNEY} AS journey, count(*)::int AS n
        FROM marketplace.listings l ${LISTING_JOINS}
       WHERE ${listingWhere} AND l.deleted_at IS NULL GROUP BY 1, 2`),
    db.execute(sql`
      SELECT ${JOURNEY} AS journey, count(*)::int AS n,
             count(*) FILTER (WHERE ld.status = 'converted')::int AS converted,
             count(*) FILTER (WHERE ld.status = 'lost')::int AS lost
        FROM crm.leads ld LEFT JOIN marketplace.listings l ON l.id = ld.listing_id ${LISTING_JOINS}
       WHERE ${leadWhere} AND ld.deleted_at IS NULL GROUP BY 1`),
    db.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE v.status IN ('requested', 'scheduled') AND coalesce(v.scheduled_at, v.requested_for) >= now())::int AS upcoming,
             count(*) FILTER (WHERE v.status = 'completed')::int AS completed
        FROM crm.visits v WHERE ${visitWhere}`),
    db.execute(sql`
      SELECT ${LISTING_COLUMNS}, l.updated_at,
             (SELECT u.name FROM marketplace.listing_agents la JOIN identity.users u ON u.id = la.agent_user_id
               WHERE la.listing_id = l.id AND la.ended_at IS NULL ORDER BY (la.role = 'primary') DESC LIMIT 1) AS agent
        FROM marketplace.listings l ${LISTING_JOINS}
       WHERE ${listingWhere} AND l.deleted_at IS NULL ORDER BY l.updated_at DESC LIMIT 10`),
    showLeads
      ? db.execute(sql`
          SELECT ld.reference_id, ld.status, ld.created_at, c.name AS customer, ${LISTING_COLUMNS}
            FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id
            LEFT JOIN marketplace.listings l ON l.id = ld.listing_id ${LISTING_JOINS}
           WHERE ${leadWhere} AND ld.deleted_at IS NULL ORDER BY ld.created_at DESC LIMIT 10`)
      : null,
  ]);

  const listings: WorkStats["listings"] = { total: 0, live: 0, inReview: 0, drafts: 0, other: 0, byJourney: Object.fromEntries(JOURNEYS.map((j) => [j, 0])) as Record<Journey, number> };
  for (const r of listingRows.rows as Row[]) {
    const n = num(r.n);
    listings.total += n;
    if (r.status === "published") listings.live += n;
    else if (r.status === "submitted" || r.status === "under_review" || r.status === "approved") listings.inReview += n;
    else if (r.status === "draft" || r.status === "changes_requested") listings.drafts += n;
    else listings.other += n;
    if (r.journey) listings.byJourney[r.journey as Journey] += n;
  }
  const leadStats: WorkStats["leads"] = { total: 0, open: 0, converted: 0, lost: 0, byJourney: emptyJourneys() };
  for (const r of leadRows.rows as Row[]) {
    leadStats.total += num(r.n);
    leadStats.converted += num(r.converted);
    leadStats.lost += num(r.lost);
    if (r.journey) leadStats.byJourney[r.journey as Journey] = { enquiries: num(r.n), closed: num(r.converted) };
  }
  leadStats.open = leadStats.total - leadStats.converted - leadStats.lost;
  const v = visitRows.rows[0] as Row;

  return {
    listings,
    leads: leadStats,
    visits: { total: num(v.total), upcoming: num(v.upcoming), completed: num(v.completed) },
    recentListings: (recent.rows as Row[]).map((r) => ({ ...listingOf(r)!, updatedAt: iso(r.updated_at)!, agent: (r.agent as string) ?? null })),
    recentLeads: leads
      ? (leads.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), customer: String(r.customer), listing: listingOf(r), status: String(r.status), createdAt: iso(r.created_at)! }))
      : null,
  };
}

// ── Agents ───────────────────────────────────────────────────────────────────

export type AgentSummary = WorkStats & {
  kind: "agent";
  referenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  verificationStatus: string;
  statusReason: string | null;
  organization: { name: string; referenceId: string } | null;
  city: string | null;
  reraAgentNumber: string | null;
  experienceYears: number | null;
  bio: string | null;
  joinedAt: string;
  approvedAt: string | null;
  lastActiveAt: string | null;
  /** Their own plan and their organization's, for staff who can see subscriptions. */
  subscriptions: PersonSubscriptions | null;
  canManageSubscriptions: boolean;
  href: string;
};

export async function agentSummary(actor: Actor, referenceId: string): Promise<AgentSummary> {
  // getAgent applies the agents.view scope: platform staff see anyone, broker admins their own agents.
  const agent = await getAgent(actor, referenceId);
  const stats = await workStats(
    actor,
    sql`EXISTS (SELECT 1 FROM marketplace.listing_agents la WHERE la.listing_id = l.id AND la.ended_at IS NULL AND la.agent_user_id = ${agent.userId})`,
    sql`ld.agent_user_id = ${agent.userId}`,
    sql`v.agent_user_id = ${agent.userId}`,
  );
  return {
    kind: "agent",
    ...stats,
    referenceId: agent.referenceId,
    userReferenceId: agent.userReferenceId,
    name: agent.name,
    email: agent.email,
    phone: agent.phone,
    status: agent.status,
    verificationStatus: agent.verificationStatus,
    statusReason: agent.statusReason,
    organization: agent.organization && agent.organizationReferenceId ? { name: agent.organization, referenceId: agent.organizationReferenceId } : agent.requestedOrganization,
    city: agent.city,
    reraAgentNumber: agent.reraAgentNumber,
    experienceYears: agent.experienceYears,
    bio: agent.bio,
    joinedAt: agent.createdAt,
    approvedAt: agent.approvedAt,
    lastActiveAt: agent.lastActiveAt,
    subscriptions: can(actor, "subscriptions.view", "platform") ? await subscriptionsForPerson(actor, agent.userId) : null,
    canManageSubscriptions: can(actor, "subscriptions.manage", "platform"),
    href: `/agents/${agent.referenceId}`,
  };
}

// ── Organizations ────────────────────────────────────────────────────────────

export type OrganizationSummary = WorkStats & {
  kind: "organization";
  referenceId: string;
  name: string;
  orgType: string;
  orgTypeLabel: string;
  status: string;
  verificationStatus: string;
  statusReason: string | null;
  city: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  reraRegistration: string | null;
  createdBy: string | null;
  createdAt: string;
  members: { name: string; userReferenceId: string; agentReferenceId: string | null; roles: string[]; status: string; listings: number; leads: number }[];
  projects: { referenceId: string; name: string; status: string }[];
  href: string;
};

export async function organizationSummary(actor: Actor, referenceId: string): Promise<OrganizationSummary> {
  const org = await getOrganization(actor, referenceId);
  const [stats, perMember] = await Promise.all([
    workStats(actor, sql`l.organization_id = ${org.id}`, sql`ld.organization_id = ${org.id}`, sql`v.organization_id = ${org.id}`),
    db.execute(sql`
      SELECT u.reference_id,
             (SELECT count(*) FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id
               WHERE la.agent_user_id = u.id AND la.ended_at IS NULL AND l.organization_id = ${org.id} AND l.deleted_at IS NULL)::int AS listings,
             (SELECT count(*) FROM crm.leads ld WHERE ld.agent_user_id = u.id AND ld.organization_id = ${org.id} AND ld.deleted_at IS NULL)::int AS leads
        FROM orgs.memberships m JOIN identity.users u ON u.id = m.user_id WHERE m.organization_id = ${org.id}`),
  ]);
  const counts = new Map((perMember.rows as Row[]).map((r) => [String(r.reference_id), { listings: num(r.listings), leads: num(r.leads) }]));
  return {
    kind: "organization",
    ...stats,
    referenceId: org.referenceId,
    name: org.name,
    orgType: org.orgType,
    orgTypeLabel: ORG_TYPE_LABELS[org.orgType] ?? org.orgType,
    status: org.status,
    verificationStatus: org.verificationStatus,
    statusReason: org.statusReason,
    city: org.city,
    contactEmail: org.contactEmail,
    contactPhone: org.contactPhone,
    reraRegistration: org.reraRegistration,
    createdBy: org.createdBy,
    createdAt: org.createdAt,
    members: org.memberList.map((m) => ({ ...m, ...(counts.get(m.userReferenceId) ?? { listings: 0, leads: 0 }) })),
    projects: org.projects,
    href: `/organizations/${org.referenceId}`,
  };
}

// ── Hosts ───────────────────────────────────────────────────────────────────

export type HostSummary = {
  kind: "host";
  referenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  verificationStatus: string;
  statusReason: string | null;
  city: string | null;
  relationship: string;
  about: string | null;
  languages: string[];
  stays: number;
  liveStays: number;
  bookings: number;
  appliedAt: string;
  approvedAt: string | null;
  listings: { referenceId: string; title: string; status: string }[];
  /** Their own plan and their own organization's (a host's partner plan), for staff who can see subscriptions. */
  subscriptions: PersonSubscriptions | null;
  canManageSubscriptions: boolean;
  href: string;
};

export async function hostSummary(actor: Actor, referenceId: string): Promise<HostSummary> {
  // getHost checks hosts.view at platform scope.
  const host = await getHost(actor, referenceId);
  return {
    kind: "host",
    referenceId: host.referenceId,
    userReferenceId: host.userReferenceId,
    name: host.name,
    email: host.email,
    phone: host.phone,
    status: host.status,
    verificationStatus: host.verificationStatus,
    statusReason: host.statusReason,
    city: host.city,
    relationship: host.relationship,
    about: host.about,
    languages: host.languages,
    stays: host.stays,
    liveStays: host.liveStays,
    bookings: host.bookings,
    appliedAt: host.createdAt,
    approvedAt: host.approvedAt,
    listings: host.listings,
    subscriptions: can(actor, "subscriptions.view", "platform") ? await subscriptionsForPerson(actor, host.userId) : null,
    canManageSubscriptions: can(actor, "subscriptions.manage", "platform"),
    href: `/hosts/${host.referenceId}`,
  };
}

export type Summary = UserSummary | AgentSummary | OrganizationSummary | HostSummary;
export type SummaryKind = Summary["kind"];

export async function loadSummary(actor: Actor, kind: SummaryKind, referenceId: string): Promise<Summary> {
  if (kind === "user" && isReferenceId(referenceId, "USR")) return userSummary(actor, referenceId);
  if (kind === "agent" && isReferenceId(referenceId, "AGT")) return agentSummary(actor, referenceId);
  if (kind === "host" && isReferenceId(referenceId, "HST")) return hostSummary(actor, referenceId);
  if (kind === "organization" && isReferenceId(referenceId, "ORG")) {
    assertCan(actor, "organizations.view", "platform");
    return organizationSummary(actor, referenceId);
  }
  throw notFound();
}

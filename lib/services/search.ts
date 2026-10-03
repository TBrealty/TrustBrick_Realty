import "server-only";
import { sql } from "drizzle-orm";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { bookingScope, leadScope, listingScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { REFERENCE_ENTITIES, parseReferenceId } from "@/lib/reference";

type Row = Record<string, unknown>;

export type SearchHit = { kind: string; referenceId: string; title: string; subtitle: string | null; href: string };
export type SearchResults = { exact: SearchHit | null; groups: { label: string; hits: SearchHit[] }[] };

const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Global search for the platform workspace. A reference ID is the strongest signal and is
 * looked up exactly; otherwise each group is searched only if the actor may see that kind of
 * record, and each group is capped. Searching never widens what the actor can open.
 */
export async function globalSearch(actor: Actor, rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < 2) return { exact: null, groups: [] };

  const ref = parseReferenceId(q);
  if (ref) return { exact: await exactReference(actor, ref.prefix, ref.value), groups: [] };

  const like = `%${likeEscape(q)}%`;
  const digits = q.replace(/\D/g, "");
  const jobs: Promise<{ label: string; hits: SearchHit[] }>[] = [];

  if (can(actor, "users.view", "platform")) {
    jobs.push(
      db
        .execute(sql`
          SELECT reference_id, name, email FROM identity.users
           WHERE name ILIKE ${like} OR email ILIKE ${like} ${digits.length >= 6 ? sql`OR phone LIKE ${`%${digits}%`}` : sql``}
           ORDER BY created_at DESC LIMIT 5`)
        .then(({ rows }) => ({
          label: "Users",
          hits: (rows as Row[]).map((r) => ({ kind: "User", referenceId: String(r.reference_id), title: String(r.name), subtitle: String(r.email), href: `/users/${r.reference_id}` })),
        })),
    );
  }
  if (can(actor, "agents.view", "platform")) {
    jobs.push(
      db
        .execute(sql`
          SELECT ap.reference_id, u.name, ap.status FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id
           WHERE u.name ILIKE ${like} OR u.email ILIKE ${like} ${digits.length >= 6 ? sql`OR ap.phone LIKE ${`%${digits}%`}` : sql``}
           ORDER BY ap.created_at DESC LIMIT 5`)
        .then(({ rows }) => ({
          label: "Agents",
          hits: (rows as Row[]).map((r) => ({ kind: "Agent", referenceId: String(r.reference_id), title: String(r.name), subtitle: String(r.status), href: `/agents/${r.reference_id}` })),
        })),
    );
  }
  if (can(actor, "organizations.view", "platform")) {
    jobs.push(
      db
        .execute(sql`
          SELECT reference_id, name, org_type FROM orgs.organizations
           WHERE org_type <> 'internal' AND (name ILIKE ${like} OR similarity(name, ${q}) > 0.3)
           ORDER BY similarity(name, ${q}) DESC LIMIT 5`)
        .then(({ rows }) => ({
          label: "Organizations",
          hits: (rows as Row[]).map((r) => ({ kind: "Organization", referenceId: String(r.reference_id), title: String(r.name), subtitle: String(r.org_type).replace("_", " "), href: `/organizations/${r.reference_id}` })),
        })),
    );
  }
  if (can(actor, "listings.view")) {
    jobs.push(
      db
        .execute(sql`
          SELECT l.reference_id, l.title, l.status, loc.name AS locality FROM marketplace.listings l
            JOIN real_estate.properties p ON p.id = l.property_id
            JOIN geography.addresses a ON a.id = p.address_id JOIN geography.places loc ON loc.id = a.place_id
           WHERE l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")}
             AND (l.title ILIKE ${like} OR loc.name ILIKE ${like} OR a.line1 ILIKE ${like})
           ORDER BY l.updated_at DESC LIMIT 5`)
        .then(({ rows }) => ({
          label: "Listings",
          hits: (rows as Row[]).map((r) => ({ kind: "Listing", referenceId: String(r.reference_id), title: String(r.title), subtitle: `${r.locality} · ${r.status}`, href: `/properties/${r.reference_id}` })),
        })),
    );
  }
  if (can(actor, "leads.view")) {
    jobs.push(
      db
        .execute(sql`
          SELECT ld.reference_id, c.name, ld.status FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id
           WHERE ld.deleted_at IS NULL AND ${leadScope(actor, "leads.view")}
             AND (c.name ILIKE ${like} OR c.email ILIKE ${like} ${digits.length >= 6 ? sql`OR c.phone LIKE ${`%${digits}%`}` : sql``})
           ORDER BY ld.last_activity_at DESC LIMIT 5`)
        .then(({ rows }) => ({
          label: "Leads",
          hits: (rows as Row[]).map((r) => ({ kind: "Lead", referenceId: String(r.reference_id), title: String(r.name), subtitle: String(r.status), href: `/leads/${r.reference_id}` })),
        })),
    );
  }

  const groups = (await Promise.all(jobs)).filter((g) => g.hits.length > 0);
  return { exact: null, groups };
}

/** One indexed lookup per reference type, each behind the permission for that type. */
async function exactReference(actor: Actor, prefix: keyof typeof REFERENCE_ENTITIES, value: string): Promise<SearchHit | null> {
  const hit = (kind: string, title: string, subtitle: string | null, href: string): SearchHit => ({ kind, referenceId: value, title, subtitle, href });
  const one = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows[0] as Row | undefined;

  switch (prefix) {
    case "BKG": {
      if (!can(actor, "bookings.view")) return null;
      const r = await one(sql`SELECT b.guest_name, b.status FROM stays.bookings b WHERE b.reference_id = ${value} AND ${bookingScope(actor, "bookings.view")}`);
      return r ? hit("Booking", String(r.guest_name), String(r.status), `/bookings/${value}`) : null;
    }
    case "MSG": {
      if (!can(actor, "conversations.view", "platform")) return null;
      const r = await one(sql`SELECT gu.name AS guest, l.title FROM stays.conversations c JOIN identity.users gu ON gu.id = c.guest_user_id
                               JOIN marketplace.listings l ON l.id = c.listing_id WHERE c.reference_id = ${value}`);
      return r ? hit("Conversation", `${r.guest} · ${r.title}`, null, `/conversations/${value}`) : null;
    }
    case "HST": {
      if (!can(actor, "hosts.view", "platform")) return null;
      const r = await one(sql`SELECT u.name, hp.status FROM stays.host_profiles hp JOIN identity.users u ON u.id = hp.user_id WHERE hp.reference_id = ${value}`);
      return r ? hit("Host", String(r.name), String(r.status), `/hosts/${value}`) : null;
    }
    case "USR": {
      if (!can(actor, "users.view", "platform")) return null;
      const r = await one(sql`SELECT name, email FROM identity.users WHERE reference_id = ${value}`);
      return r ? hit("User", String(r.name), String(r.email), `/users/${value}`) : null;
    }
    case "AGT": {
      if (!can(actor, "agents.view", "platform")) return null;
      const r = await one(sql`SELECT u.name, ap.status FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id WHERE ap.reference_id = ${value}`);
      return r ? hit("Agent", String(r.name), String(r.status), `/agents/${value}`) : null;
    }
    case "ADM":
    case "SADM": {
      if (!can(actor, "admins.view", "platform")) return null;
      const r = await one(sql`SELECT u.name, ad.level FROM orgs.admin_profiles ad JOIN identity.users u ON u.id = ad.user_id WHERE ad.reference_id = ${value}`);
      return r ? hit(r.level === "superadmin" ? "SuperAdmin" : "Admin", String(r.name), null, `/admins/${value}`) : null;
    }
    case "ORG": {
      if (!can(actor, "organizations.view", "platform")) return null;
      const r = await one(sql`SELECT name, status FROM orgs.organizations WHERE reference_id = ${value} AND org_type <> 'internal'`);
      return r ? hit("Organization", String(r.name), String(r.status), `/organizations/${value}`) : null;
    }
    case "LST": {
      if (!can(actor, "listings.view")) return null;
      const r = await one(sql`SELECT l.title, l.status FROM marketplace.listings l WHERE l.reference_id = ${value} AND ${listingScope(actor, "listings.view")}`);
      return r ? hit("Listing", String(r.title), String(r.status), `/properties/${value}`) : null;
    }
    case "PRP": {
      if (!can(actor, "listings.view")) return null;
      const r = await one(sql`
        SELECT l.reference_id, l.title FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id
         WHERE p.reference_id = ${value} AND ${listingScope(actor, "listings.view")} ORDER BY l.created_at DESC LIMIT 1`);
      return r ? { kind: "Property", referenceId: value, title: String(r.title), subtitle: `Latest listing ${r.reference_id}`, href: `/properties/${r.reference_id}` } : null;
    }
    case "LEAD": {
      if (!can(actor, "leads.view")) return null;
      const r = await one(sql`SELECT c.name, ld.status FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id WHERE ld.reference_id = ${value} AND ${leadScope(actor, "leads.view")}`);
      return r ? hit("Lead", String(r.name), String(r.status), `/leads/${value}`) : null;
    }
    case "VER": {
      if (!can(actor, "verification.view", "platform") && !can(actor, "listings.approve", "platform")) return null;
      const r = await one(sql`SELECT case_type, status FROM trust.review_cases WHERE reference_id = ${value}`);
      return r ? hit("Review case", String(r.case_type).replace(/_/g, " "), String(r.status), `/approvals/${value}`) : null;
    }
    case "RPT": {
      if (!can(actor, "reports.view", "platform")) return null;
      const r = await one(sql`SELECT reason, status FROM trust.reports WHERE reference_id = ${value}`);
      return r ? hit("Report", String(r.reason).replace(/_/g, " "), String(r.status), `/reports?status=${r.status}`) : null;
    }
    case "INV": {
      if (!can(actor, "admins.view", "platform")) return null;
      const r = await one(sql`SELECT email, status FROM orgs.admin_invitations WHERE reference_id = ${value}`);
      return r ? hit("Invitation", String(r.email), String(r.status), "/admins") : null;
    }
    default:
      return null;
  }
}

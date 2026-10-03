import "server-only";
import { randomBytes } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type AuditEvent, type RequestContext, audit } from "./audit";
import { HOLD_REASONS, pauseListings, resumeListings } from "./listings/lifecycle";
import { notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Organizations an admin can create. `personal` is created on agent approval; `internal` exists once. */
export const CREATABLE_ORG_TYPES = ["brokerage", "developer", "property_manager", "pg_operator", "vendor"] as const;
export const ORG_TYPE_LABELS: Record<string, string> = {
  brokerage: "Brokerage",
  developer: "Developer",
  property_manager: "Property manager",
  pg_operator: "PG operator",
  vendor: "Vendor",
  personal: "Independent agent",
  internal: "Trustbrick",
};

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organization's name").max(120),
  orgType: z.enum(CREATABLE_ORG_TYPES, { message: "Choose the type" }),
  contactEmail: optional(z.email("Enter a valid email")),
  contactPhone: optional(z.string().trim().regex(/^[+]?[0-9]{10,15}$/, "Enter 10 to 15 digits")),
  reraRegistration: optional(z.string().trim().max(60)),
  cityId: optional(z.uuid()),
});

export const organizationFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["pending", "active", "suspended", "rejected", "archived"]).optional().catch(undefined),
  type: z.enum(["brokerage", "developer", "property_manager", "pg_operator", "vendor", "personal"]).optional().catch(undefined),
  verification: z.enum(["unverified", "pending", "verified", "rejected"]).optional().catch(undefined),
  includeSample: z.preprocess((v) => v === "1", z.boolean()).catch(false),
});
export type OrganizationFilters = z.infer<typeof organizationFilters>;

export type OrganizationRow = {
  id: string;
  referenceId: string;
  name: string;
  orgType: string;
  status: string;
  verificationStatus: string;
  isSample: boolean;
  members: number;
  agents: number;
  listings: number;
  liveListings: number;
  city: string | null;
  createdAt: string;
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "organization";

export async function createOrganization(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "organizations.manage", "platform");
  const parsed = organizationSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;

  return db.transaction(async (tx) => {
    if (input.cityId) {
      const city = await tx.execute(sql`SELECT 1 FROM geography.places WHERE id = ${input.cityId} AND place_type = 'city'`);
      if (!city.rows[0]) throw invalid("Choose a city.", { cityId: "Choose a city" });
    }
    const base = slugify(input.name);
    const taken = await tx.execute(sql`SELECT 1 FROM orgs.organizations WHERE slug = ${base}`);
    const slug = taken.rows[0] ? `${base}-${randomBytes(3).toString("hex")}` : base;
    // New organizations start pending: someone with organizations.verify activates them.
    const created = await tx.execute(sql`
      INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, contact_email, contact_phone,
                                      rera_registration, city_place_id, created_by)
      VALUES (gen_random_uuid(), ${input.name}, ${slug}, ${input.orgType}, 'pending', 'pending', ${input.contactEmail ?? null},
              ${input.contactPhone ?? null}, ${input.reraRegistration ?? null}, ${input.cityId ?? null}, ${actor.userId})
      RETURNING id, reference_id`);
    const org = created.rows[0] as Row;
    const referenceId = String(org.reference_id);
    await tx.execute(sql`
      INSERT INTO trust.review_cases (id, case_type, organization_id, status, submitted_by)
      VALUES (gen_random_uuid(), 'organization_verification', ${String(org.id)}, 'open', ${actor.userId})`);
    await audit(tx, actor, { event: "ORGANIZATION_CREATED", target: { type: "organization", id: String(org.id), referenceId }, organizationId: String(org.id), after: { ...input, status: "pending" } }, ctx);
    await notifyPermissionHolders(
      tx,
      "organizations.verify",
      { type: "organization_pending", title: `${input.name} needs verification`, link: `/organizations/${referenceId}` },
      actor.userId,
    );
    return { referenceId };
  });
}

const FROM = sql`
  FROM orgs.organizations o
  LEFT JOIN geography.places city ON city.id = o.city_place_id`;

export async function listOrganizations(actor: Actor, filters: OrganizationFilters, page: number): Promise<Page<OrganizationRow>> {
  assertCan(actor, "organizations.view", "platform");
  const where: SQL[] = [sql`o.org_type <> 'internal'`, sql`o.deleted_at IS NULL`];
  if (!filters.includeSample) where.push(sql`NOT o.is_sample`);
  if (filters.status) where.push(sql`o.status = ${filters.status}`);
  if (filters.type) where.push(sql`o.org_type = ${filters.type}`);
  else where.push(sql`o.org_type <> 'personal'`);
  if (filters.verification) where.push(sql`o.verification_status = ${filters.verification}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    where.push(sql`(o.reference_id = ${ref} OR o.name ILIKE ${`%${likeEscape(filters.q)}%`} OR o.slug = ${filters.q.toLowerCase()})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT o.id, o.reference_id, o.name, o.org_type, o.status, o.verification_status, o.is_sample, o.created_at, city.name AS city,
             (SELECT count(*) FROM orgs.memberships m WHERE m.organization_id = o.id AND m.status = 'active')::int AS members,
             (SELECT count(DISTINCT m.user_id) FROM orgs.memberships m JOIN orgs.agent_profiles ap ON ap.user_id = m.user_id
               WHERE m.organization_id = o.id AND m.status = 'active')::int AS agents,
             (SELECT count(*) FROM marketplace.listings l WHERE l.organization_id = o.id AND l.deleted_at IS NULL)::int AS listings,
             (SELECT count(*) FROM marketplace.listings l WHERE l.organization_id = o.id AND l.status = 'published' AND l.deleted_at IS NULL)::int AS live_listings
      ${FROM} WHERE ${whereSql}
      ORDER BY (o.status = 'pending') DESC, o.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${FROM} WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      id: String(r.id),
      referenceId: String(r.reference_id),
      name: String(r.name),
      orgType: String(r.org_type),
      status: String(r.status),
      verificationStatus: String(r.verification_status),
      isSample: Boolean(r.is_sample),
      members: Number(r.members),
      agents: Number(r.agents),
      listings: Number(r.listings),
      liveListings: Number(r.live_listings),
      city: (r.city as string) ?? null,
      createdAt: iso(r.created_at)!,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: limit,
  };
}

export type OrganizationDetail = OrganizationRow & {
  contactEmail: string | null;
  contactPhone: string | null;
  reraRegistration: string | null;
  statusReason: string | null;
  createdBy: string | null;
  openCaseReferenceId: string | null;
  members: number;
  memberList: { userReferenceId: string; name: string; email: string; roles: string[]; status: string; agentReferenceId: string | null }[];
  projects: { referenceId: string; name: string; status: string }[];
  recentListings: { referenceId: string; title: string; status: string; updatedAt: string }[];
};

export async function getOrganization(actor: Actor, referenceId: string): Promise<OrganizationDetail> {
  assertCan(actor, "organizations.view", "platform");
  if (!isReferenceId(referenceId, "ORG")) throw notFound();
  const page = await listOrganizations(actor, { q: referenceId, includeSample: true, type: undefined }, 1);
  let base = page.rows.find((r) => r.referenceId === referenceId);
  if (!base) {
    // Personal organizations are hidden from the default list but can be opened by reference.
    const personal = await listOrganizations(actor, { q: referenceId, includeSample: true, type: "personal" }, 1);
    base = personal.rows.find((r) => r.referenceId === referenceId);
  }
  if (!base) throw notFound();

  const [detail, members, projects, listings] = await Promise.all([
    db.execute(sql`
      SELECT o.contact_email, o.contact_phone, o.rera_registration, o.status_reason, u.name AS created_by,
             (SELECT reference_id FROM trust.review_cases rc WHERE rc.organization_id = o.id AND rc.status IN ('open', 'in_review') LIMIT 1) AS open_case
        FROM orgs.organizations o LEFT JOIN identity.users u ON u.id = o.created_by WHERE o.id = ${base.id}`),
    db.execute(sql`
      SELECT u.reference_id, u.name, u.email, m.status, ap.reference_id AS agent_reference_id,
             array_agg(r.name ORDER BY r.sort_order) FILTER (WHERE r.id IS NOT NULL) AS roles
        FROM orgs.memberships m JOIN identity.users u ON u.id = m.user_id
        LEFT JOIN orgs.membership_roles mr ON mr.membership_id = m.id LEFT JOIN orgs.roles r ON r.id = mr.role_id
        LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
       WHERE m.organization_id = ${base.id}
       GROUP BY u.reference_id, u.name, u.email, m.status, ap.reference_id, m.created_at
       ORDER BY m.created_at LIMIT 200`),
    db.execute(sql`SELECT reference_id, name, status FROM real_estate.projects WHERE organization_id = ${base.id} AND deleted_at IS NULL ORDER BY name LIMIT 50`),
    db.execute(sql`SELECT reference_id, title, status, updated_at FROM marketplace.listings WHERE organization_id = ${base.id} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10`),
  ]);
  const d = detail.rows[0] as Row;
  return {
    ...base,
    contactEmail: (d.contact_email as string) ?? null,
    contactPhone: (d.contact_phone as string) ?? null,
    reraRegistration: (d.rera_registration as string) ?? null,
    statusReason: (d.status_reason as string) ?? null,
    createdBy: (d.created_by as string) ?? null,
    openCaseReferenceId: (d.open_case as string) ?? null,
    memberList: (members.rows as Row[]).map((m) => ({
      userReferenceId: String(m.reference_id),
      name: String(m.name),
      email: String(m.email),
      roles: (m.roles as string[]) ?? [],
      status: String(m.status),
      agentReferenceId: (m.agent_reference_id as string) ?? null,
    })),
    projects: (projects.rows as Row[]).map((p) => ({ referenceId: String(p.reference_id), name: String(p.name), status: String(p.status) })),
    recentListings: (listings.rows as Row[]).map((l) => ({ referenceId: String(l.reference_id), title: String(l.title), status: String(l.status), updatedAt: iso(l.updated_at)! })),
  };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const ORGANIZATION_ACTIONS = {
  approve: { from: ["pending"], to: "active", permission: "organizations.verify", event: "ORGANIZATION_APPROVED", reason: false },
  reject: { from: ["pending"], to: "rejected", permission: "organizations.verify", event: "ORGANIZATION_REJECTED", reason: true },
  suspend: { from: ["active"], to: "suspended", permission: "organizations.suspend", event: "ORGANIZATION_SUSPENDED", reason: true },
  reinstate: { from: ["suspended"], to: "active", permission: "organizations.suspend", event: "ORGANIZATION_REINSTATED", reason: false },
  archive: { from: ["pending", "active", "suspended", "rejected"], to: "archived", permission: "organizations.manage", event: "ORGANIZATION_ARCHIVED", reason: true },
} as const satisfies Record<string, { from: readonly string[]; to: string; permission: "organizations.verify" | "organizations.suspend" | "organizations.manage"; event: AuditEvent; reason: boolean }>;
export type OrganizationAction = keyof typeof ORGANIZATION_ACTIONS;
export const isOrganizationAction = (v: unknown): v is OrganizationAction => typeof v === "string" && v in ORGANIZATION_ACTIONS;

async function lockOrganization(tx: Tx, referenceId: string) {
  if (!isReferenceId(referenceId, "ORG")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT id, reference_id, name, status, verification_status, org_type FROM orgs.organizations
     WHERE reference_id = ${referenceId} AND deleted_at IS NULL FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  if (r.org_type === "internal") throw new AppError("FORBIDDEN", "The Trustbrick organization can't be changed here.");
  return { id: String(r.id), referenceId: String(r.reference_id), name: String(r.name), status: String(r.status), verificationStatus: String(r.verification_status) };
}

/**
 * Organization lifecycle. Lifecycle states, never hard deletes. Suspending or archiving pauses
 * the organization's live listings (its members also lose their workspace, because actor
 * resolution requires an active organization); reinstating resumes them.
 */
export async function transitionOrganization(actor: Actor, referenceId: string, action: OrganizationAction, rawReason: unknown, ctx: RequestContext) {
  const def = ORGANIZATION_ACTIONS[action];
  assertCan(actor, def.permission, "platform");
  const reasonText = typeof rawReason === "string" ? rawReason.trim() : "";
  if (def.reason && reasonText.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });

  return db.transaction(async (tx) => {
    const org = await lockOrganization(tx, referenceId);
    if (!(def.from as readonly string[]).includes(org.status)) throw conflict(`This organization is ${org.status}, so that action isn't available.`);

    const verification = action === "approve" ? "verified" : action === "reject" ? "rejected" : org.verificationStatus;
    await tx.execute(sql`
      UPDATE orgs.organizations SET status = ${def.to}, verification_status = ${verification}, status_reason = ${reasonText || null},
             status_changed_at = now(), updated_at = now()
       WHERE id = ${org.id}`);
    if (action === "approve" || action === "reject") {
      await tx.execute(sql`
        UPDATE trust.review_cases SET status = ${action === "approve" ? "approved" : "rejected"}, decided_by = ${actor.userId}, decided_at = now(),
               decision_reason = ${reasonText || null}, updated_at = now()
         WHERE organization_id = ${org.id} AND status IN ('open', 'in_review')`);
    }
    let affected = 0;
    if (action === "suspend" || action === "archive") affected = await pauseListings(tx, sql`l.organization_id = ${org.id}`, HOLD_REASONS.organization, actor.userId);
    if (action === "reinstate") affected = await resumeListings(tx, sql`l.organization_id = ${org.id}`, actor.userId);

    await audit(
      tx,
      actor,
      {
        event: def.event,
        target: { type: "organization", id: org.id, referenceId: org.referenceId },
        organizationId: org.id,
        before: { status: org.status, verificationStatus: org.verificationStatus },
        after: { status: def.to, verificationStatus: verification },
        metadata: { reason: reasonText || undefined, listingsAffected: affected },
      },
      ctx,
    );
    return { affected };
  });
}

export async function updateOrganization(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "organizations.manage", "platform");
  const parsed = organizationSchema.omit({ orgType: true }).safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  await db.transaction(async (tx) => {
    const org = await lockOrganization(tx, referenceId);
    const before = await tx.execute(sql`SELECT name, contact_email, contact_phone, rera_registration, city_place_id FROM orgs.organizations WHERE id = ${org.id}`);
    await tx.execute(sql`
      UPDATE orgs.organizations SET name = ${input.name}, contact_email = ${input.contactEmail ?? null}, contact_phone = ${input.contactPhone ?? null},
             rera_registration = ${input.reraRegistration ?? null}, city_place_id = ${input.cityId ?? null}, updated_at = now()
       WHERE id = ${org.id}`);
    await audit(tx, actor, { event: "ORGANIZATION_UPDATED", target: { type: "organization", id: org.id, referenceId: org.referenceId }, organizationId: org.id, before: before.rows[0] as Row, after: input }, ctx);
  });
}

export async function cityOptions() {
  const { rows } = await db.execute(sql`
    SELECT c.id, c.name, s.name AS state FROM geography.places c JOIN geography.places s ON s.id = c.parent_id
     WHERE c.place_type = 'city' AND c.is_active ORDER BY c.name`);
  return (rows as Row[]).map((r) => ({ id: String(r.id), name: String(r.name), state: String(r.state) }));
}

/** Active organizations an agent can ask to join, by reference. */
export async function joinableOrganization(referenceId: string) {
  if (!isReferenceId(referenceId, "ORG")) return null;
  const { rows } = await db.execute(sql`
    SELECT name, org_type FROM orgs.organizations WHERE reference_id = ${referenceId} AND status = 'active'
       AND org_type IN ('brokerage', 'developer', 'property_manager', 'pg_operator')`);
  const r = rows[0] as Row | undefined;
  return r ? { name: String(r.name), type: String(r.org_type) } : null;
}

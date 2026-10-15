import "server-only";
import { randomBytes } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import type { RoleCode } from "@/lib/authz/catalog";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { AGENT_APPLICATION_TYPES } from "@/lib/db/schema/orgs";
import { agentApprovedMessage, agentRejectedMessage } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { gstinProblem, normalizeGstin } from "@/lib/organizations/gstin";
import { APPLICANT_ORG_TYPES, type ApplicantOrgType } from "@/lib/organizations/terms";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { HOLD_REASONS, pauseListings, resumeListings } from "./listings/lifecycle";
import { notify, notifyPermissionHolders } from "./notifications";
import { slugify } from "./organizations";
import { type Page, pageParams } from "./pagination";
import { getSetting } from "./settings";
import { SUBSCRIPTION_FILTER, ownPlanColumn, subscriptionFilterSql } from "./subscriptions";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const link = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();

// ── Applying ─────────────────────────────────────────────────────────────────
//
// Three ways to apply: on your own, to join an organization already on Trustbrick (by its ORG-
// reference), or registering a new organization (name, kind, GSTIN, address…). A new
// organization is created pending and goes live when its applicant is approved; the applicant
// becomes its admin. Signed-in people apply from /become-an-agent; people signing up as an agent
// apply as part of signing up, and the application is sent once they confirm their email.

export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits"));

const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `Use ${max} characters or fewer`).optional());

export type AgentApplicationType = (typeof AGENT_APPLICATION_TYPES)[number];

/** A registered organization's applicant becomes its admin, in the role that fits its kind. */
const OWNER_ROLES = { brokerage: "broker_admin", developer: "developer_admin", property_manager: "property_manager", pg_operator: "property_manager" } as const satisfies Record<
  ApplicantOrgType,
  RoleCode
>;
type MembershipRole = "agent" | (typeof OWNER_ROLES)[ApplicantOrgType];

export const applicationSchema = z.object({
  phone,
  reraAgentNumber: optionalText(60),
  cityId: z.uuid({ message: "Choose the city you work in" }),
  experienceYears: z.preprocess(blank, z.coerce.number().int().min(0).max(70).optional()),
  bio: optionalText(600),
  /** Left out by older forms and the app: an organization reference then means joining it. */
  applyingAs: z.preprocess(blank, z.enum(AGENT_APPLICATION_TYPES).optional()),
  organizationReference: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? normalizeReferenceId(v) : undefined),
    z.string().refine((v) => isReferenceId(v, "ORG"), "Enter an organization reference like ORG-7K4M9Q2X").optional(),
  ),
});

/** A new organization's details. Field names start with "org" so they sit beside the agent's own. */
export const newOrganizationSchema = z.object({
  orgName: z.preprocess(trim, z.string({ message: "Enter the organization's registered name" }).min(2, "Enter the organization's registered name").max(160, "Use 160 characters or fewer")),
  orgType: z.enum(APPLICANT_ORG_TYPES, { message: "Choose what kind of organization it is" }),
  gstin: z.preprocess(
    (v) => (typeof v === "string" ? normalizeGstin(v) : v),
    z.string({ message: "Enter the GST number" }).superRefine((v, c) => {
      const problem = v ? gstinProblem(v) : "Enter the GST number";
      if (problem) c.addIssue({ code: "custom", message: problem });
    }),
  ),
  orgRera: optionalText(60),
  orgAddress: z.preprocess(trim, z.string({ message: "Enter the registered office address" }).min(10, "Enter the registered office address").max(500, "Use 500 characters or fewer")),
  orgEmail: z.preprocess(blank, z.email({ message: "Enter a valid email address" }).max(254).optional()),
  orgPhone: z.preprocess(blank, phone.optional()),
  orgWebsite: z.preprocess(blank, z.url({ protocol: /^https?$/, message: "Enter a full web address, like https://example.in" }).max(200).optional()),
});

export type AgentApplication = z.infer<typeof applicationSchema> & { type: AgentApplicationType; organization: z.infer<typeof newOrganizationSchema> | null };

/** Checks an application (and the organization, when registering one); every field's problem at once. */
export function parseAgentApplication(raw: unknown): AgentApplication {
  const base = applicationSchema.safeParse(raw);
  const requested = (raw as Record<string, unknown> | null)?.applyingAs;
  const type: AgentApplicationType = base.success
    ? (base.data.applyingAs ?? (base.data.organizationReference ? "join_organization" : "independent"))
    : AGENT_APPLICATION_TYPES.includes(requested as AgentApplicationType)
      ? (requested as AgentApplicationType)
      : "independent";
  const org = type === "new_organization" ? newOrganizationSchema.safeParse(raw) : null;
  const errors: Record<string, string> = { ...(base.success ? {} : fieldErrorsFrom(base.error)), ...(org && !org.success ? fieldErrorsFrom(org.error) : {}) };
  if (type === "join_organization" && base.success && !base.data.organizationReference) errors.organizationReference = "Enter the organization's reference, like ORG-7K4M9Q2X";
  if (Object.keys(errors).length > 0 || !base.success) throw invalid("Please check the highlighted fields.", errors);
  return { ...base.data, type, organization: org?.success ? org.data : null };
}

export type AgentApplicationState =
  | { state: "none" }
  | { state: "pending" | "active" | "suspended" | "rejected"; referenceId: string; reason: string | null; submittedAt: string };

export async function agentApplicationFor(userId: string): Promise<AgentApplicationState> {
  const { rows } = await db.execute(sql`SELECT reference_id, status, status_reason, created_at FROM orgs.agent_profiles WHERE user_id = ${userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return { state: "none" };
  return { state: r.status as "pending", referenceId: String(r.reference_id), reason: (r.status_reason as string) ?? null, submittedAt: iso(r.created_at)! };
}

/** The organization being registered: a new pending one, or the applicant's own earlier one, updated. */
async function applicantOrganization(tx: Tx, user: { userId: string; email: string }, input: AgentApplication, priorOrganizationId: string | null): Promise<{ id: string; name: string }> {
  const org = input.organization!;
  const reusable = priorOrganizationId
    ? ((await tx.execute(sql`SELECT id FROM orgs.organizations WHERE id = ${priorOrganizationId} AND created_by = ${user.userId} AND status IN ('pending', 'rejected') FOR UPDATE`))
        .rows[0] as Row | undefined)
    : undefined;
  const clash = await tx.execute(sql`
    SELECT 1 FROM orgs.organizations
     WHERE gstin = ${org.gstin} AND deleted_at IS NULL AND status <> 'rejected' ${reusable ? sql`AND id <> ${String(reusable.id)}` : sql``}`);
  if (clash.rows[0]) {
    throw invalid("An organization with this GST number is already on Trustbrick.", {
      gstin: "This organization is already on Trustbrick. To work there, choose “Join an organization” and ask them for their ORG- reference",
    });
  }
  const contactEmail = org.orgEmail ?? user.email;
  const contactPhone = org.orgPhone ?? input.phone;
  if (reusable) {
    await tx.execute(sql`
      UPDATE orgs.organizations
         SET name = ${org.orgName}, org_type = ${org.orgType}, gstin = ${org.gstin}, rera_registration = ${org.orgRera ?? null}, address = ${org.orgAddress},
             contact_email = ${contactEmail}, contact_phone = ${contactPhone}, website = ${org.orgWebsite ?? null}, city_place_id = ${input.cityId},
             status = 'pending', verification_status = 'pending', status_reason = NULL, status_changed_at = now(), updated_at = now()
       WHERE id = ${String(reusable.id)}`);
    return { id: String(reusable.id), name: org.orgName };
  }
  const base = slugify(org.orgName);
  const taken = await tx.execute(sql`SELECT 1 FROM orgs.organizations WHERE slug = ${base}`);
  const slug = taken.rows[0] ? `${base}-${randomBytes(3).toString("hex")}` : base;
  const created = await tx.execute(sql`
    INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, gstin, rera_registration, address,
                                    contact_email, contact_phone, website, city_place_id, created_by)
    VALUES (gen_random_uuid(), ${org.orgName}, ${slug}, ${org.orgType}, 'pending', 'pending', ${org.gstin}, ${org.orgRera ?? null}, ${org.orgAddress},
            ${contactEmail}, ${contactPhone}, ${org.orgWebsite ?? null}, ${input.cityId}, ${user.userId})
    RETURNING id`);
  return { id: String((created.rows[0] as Row).id), name: org.orgName };
}

/** Records an application (new, or again after a rejection) and puts it in the admins' queue. */
async function submitApplication(tx: Tx, user: PersonActor, input: AgentApplication, ctx: RequestContext): Promise<{ referenceId: string }> {
  const account = await tx.execute(sql`SELECT email, email_verified, status FROM identity.users WHERE id = ${user.userId}`);
  const a = account.rows[0] as Row | undefined;
  if (!a || a.status !== "active" || !a.email_verified) throw new AppError("FORBIDDEN");

  const city = await tx.execute(sql`SELECT id FROM geography.places WHERE id = ${input.cityId} AND place_type = 'city' AND is_active`);
  if (!city.rows[0]) throw invalid("Choose the city you work in.", { cityId: "Choose the city you work in" });

  const existing = await tx.execute(sql`SELECT id, status, requested_organization_id FROM orgs.agent_profiles WHERE user_id = ${user.userId} FOR UPDATE`);
  const prior = existing.rows[0] as Row | undefined;
  if (prior && prior.status !== "rejected") throw conflict("You have already applied. You'll be notified when it's decided.");

  let requestedOrg: string | null = null;
  let newOrganization: { id: string; name: string } | null = null;
  if (input.type === "join_organization" && input.organizationReference) {
    const org = await tx.execute(sql`
      SELECT id FROM orgs.organizations WHERE reference_id = ${input.organizationReference}
         AND status = 'active' AND org_type IN ('brokerage', 'developer', 'property_manager', 'pg_operator') AND deleted_at IS NULL`);
    if (!org.rows[0]) {
      throw invalid("We couldn't find an active organization with that reference.", { organizationReference: "No active organization has this reference" });
    }
    requestedOrg = String((org.rows[0] as Row).id);
  } else if (input.type === "new_organization") {
    newOrganization = await applicantOrganization(tx, { userId: user.userId, email: String(a.email) }, input, (prior?.requested_organization_id as string) ?? null);
    requestedOrg = newOrganization.id;
  }

  const values = sql`${input.phone}, ${input.reraAgentNumber ?? null}, ${input.cityId}, ${input.experienceYears ?? null}, ${input.bio ?? null}, ${requestedOrg}, ${input.type}`;
  const saved = prior
    ? await tx.execute(sql`
        UPDATE orgs.agent_profiles
           SET (phone, rera_agent_number, city_place_id, experience_years, bio, requested_organization_id, application_type) = (${values}),
               status = 'pending', verification_status = 'pending', status_reason = NULL, status_changed_at = now(), updated_at = now()
         WHERE id = ${String(prior.id)} RETURNING id, reference_id`)
    : await tx.execute(sql`
        INSERT INTO orgs.agent_profiles (id, user_id, phone, rera_agent_number, city_place_id, experience_years, bio, requested_organization_id, application_type)
        VALUES (gen_random_uuid(), ${user.userId}, ${values}) RETURNING id, reference_id`);
  const profile = saved.rows[0] as Row;
  const referenceId = String(profile.reference_id);

  const kase = await tx.execute(sql`
    INSERT INTO trust.review_cases (id, case_type, agent_profile_id, status, submitted_by)
    VALUES (gen_random_uuid(), 'agent_application', ${String(profile.id)}, 'open', ${user.userId}) RETURNING reference_id`);

  await audit(
    tx,
    user,
    {
      event: "AGENT_APPLIED",
      target: { type: "agent", id: String(profile.id), referenceId },
      metadata: { case: (kase.rows[0] as Row).reference_id, applicationType: input.type, ...(newOrganization ? { organization: newOrganization.name } : {}) },
    },
    ctx,
  );
  await notifyPermissionHolders(tx, "agents.verify", {
    type: "agent_application",
    title: newOrganization ? `New agent application ${referenceId}, registering ${newOrganization.name}` : `New agent application ${referenceId}`,
    link: `/agents/${referenceId}`,
  });
  return { referenceId };
}

/** A signed-in person applies to become an agent. Nothing is granted until an admin approves. */
export async function applyAsAgent(user: PersonActor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  if (!(await getSetting("agents.applications_open"))) throw new AppError("FORBIDDEN", "Agent applications are paused at the moment.");
  const input = parseAgentApplication(raw);
  const limited = await limit([{ key: `agent-apply:user:${user.userId}`, rule: RULES.agentApplicationByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");
  return db.transaction((tx) => submitApplication(tx, user, input, ctx));
}

/** Signing up as an agent: keeps the (already checked) application until the email is confirmed. */
export async function holdAgentSignup(userId: string, payload: Record<string, unknown>) {
  await db.execute(sql`
    INSERT INTO orgs.agent_signups (user_id, payload) VALUES (${userId}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, created_at = now()`);
}

/**
 * The person confirmed their email: send the application they made while signing up. If it can
 * no longer go through (applications paused, the GSTIN registered meanwhile), it's dropped and
 * they apply again from /become-an-agent, which explains why.
 */
export async function submitHeldAgentSignup(userId: string, ctx: RequestContext): Promise<{ referenceId: string } | null> {
  const held = await db.execute(sql`SELECT payload FROM orgs.agent_signups WHERE user_id = ${userId}`);
  const row = held.rows[0] as Row | undefined;
  if (!row) return null;
  try {
    if (!(await getSetting("agents.applications_open"))) return null;
    const input = parseAgentApplication(row.payload);
    const user = await db.execute(sql`SELECT reference_id FROM identity.users WHERE id = ${userId}`);
    const person: PersonActor = { kind: "person", userId, referenceId: String((user.rows[0] as Row).reference_id), role: "customer" };
    return await db.transaction(async (tx) => {
      const result = await submitApplication(tx, person, input, ctx);
      await tx.execute(sql`DELETE FROM orgs.agent_signups WHERE user_id = ${userId}`);
      return result;
    });
  } catch (error) {
    console.error("[agents] couldn't send the application held at sign-up", error);
    return null;
  } finally {
    await db.execute(sql`DELETE FROM orgs.agent_signups WHERE user_id = ${userId}`);
  }
}

// ── Listing and viewing agents ────────────────────────────────────────────────

export const agentFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["pending", "active", "suspended", "rejected"]).optional().catch(undefined),
  verification: z.enum(["unverified", "pending", "verified", "rejected"]).optional().catch(undefined),
  sort: z.enum(["newest", "oldest", "name", "listings"]).catch("newest"),
  subscription: SUBSCRIPTION_FILTER,
});
export type AgentFilters = z.infer<typeof agentFilters>;

export type AgentRow = {
  referenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  organizationReferenceId: string | null;
  status: string;
  verificationStatus: string;
  listings: number;
  leads: number;
  createdAt: string;
  lastActiveAt: string | null;
  /** Their own live subscription (theirs, or their own organization's), for staff who can see subscriptions. */
  plan: { name: string; status: string } | null;
};

/** Broker admins see their own organization's agents (org scope); platform staff see everyone. */
function agentScope(actor: Actor): SQL {
  const scope = assertCan(actor, "agents.view", "org");
  if (scope === "platform") return sql`TRUE`;
  return sql`EXISTS (SELECT 1 FROM orgs.memberships sm WHERE sm.user_id = ap.user_id AND sm.organization_id = ${actor.organization.id})`;
}

export async function listAgents(actor: Actor, filters: AgentFilters, page: number): Promise<Page<AgentRow>> {
  const where: SQL[] = [agentScope(actor)];
  if (filters.status) where.push(sql`ap.status = ${filters.status}`);
  if (filters.verification) where.push(sql`ap.verification_status = ${filters.verification}`);
  // Subscriptions are the platform's business: only staff who can see them filter or see them.
  const seesPlans = can(actor, "subscriptions.view", "platform");
  const bySubscription = seesPlans ? subscriptionFilterSql(filters.subscription, sql`u.id`) : null;
  if (bySubscription) where.push(bySubscription);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(ap.reference_id = ${ref} OR u.reference_id = ${ref} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR ap.phone LIKE ${like})`);
  }
  const order = {
    newest: sql`ap.created_at DESC`,
    oldest: sql`ap.created_at ASC`,
    name: sql`u.name ASC`,
    listings: sql`listings DESC, ap.created_at DESC`,
  }[filters.sort];
  const { limit: take, offset } = pageParams(page);
  const whereSql = sql.join(where, sql` AND `);

  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT ap.reference_id, u.reference_id AS user_reference_id, u.name, u.email, ap.phone, ap.status, ap.verification_status, ap.created_at,
             org.name AS organization, org.reference_id AS organization_reference_id,
             (SELECT count(*) FROM marketplace.listing_agents la WHERE la.agent_user_id = u.id AND la.ended_at IS NULL)::int AS listings,
             (SELECT count(*) FROM crm.leads ld WHERE ld.agent_user_id = u.id AND ld.deleted_at IS NULL)::int AS leads,
             (SELECT max(s.updated_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at,
             ${seesPlans ? ownPlanColumn(sql`u.id`) : sql`NULL AS own_plan`}
        FROM orgs.agent_profiles ap
        JOIN identity.users u ON u.id = ap.user_id
        LEFT JOIN LATERAL (
          SELECT o.name, o.reference_id FROM orgs.memberships m
            JOIN orgs.organizations o ON o.id = m.organization_id AND o.org_type <> 'internal'
            JOIN orgs.membership_roles mr ON mr.membership_id = m.id
            JOIN orgs.roles r ON r.id = mr.role_id AND r.workspace = 'professional'
           WHERE m.user_id = u.id ORDER BY m.created_at LIMIT 1) org ON true
       WHERE ${whereSql}
       ORDER BY ${order}
       LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id WHERE ${whereSql}`),
  ]);

  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      userReferenceId: String(r.user_reference_id),
      name: String(r.name),
      email: String(r.email),
      phone: String(r.phone),
      organization: (r.organization as string) ?? null,
      organizationReferenceId: (r.organization_reference_id as string) ?? null,
      status: String(r.status),
      verificationStatus: String(r.verification_status),
      listings: Number(r.listings),
      leads: Number(r.leads),
      createdAt: iso(r.created_at)!,
      lastActiveAt: iso(r.last_active_at),
      plan: (r.own_plan as { name: string; status: string } | null) ?? null,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: take,
  };
}

export type AgentDetail = AgentRow & {
  profileId: string;
  userId: string;
  reraAgentNumber: string | null;
  experienceYears: number | null;
  bio: string | null;
  city: string | null;
  statusReason: string | null;
  requestedOrganization: { name: string; referenceId: string } | null;
  approvedAt: string | null;
  applicationType: AgentApplicationType;
  /** The organization they registered while applying (its status follows the application). */
  newOrganization: {
    name: string;
    referenceId: string;
    type: string;
    status: string;
    gstin: string | null;
    reraRegistration: string | null;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
  } | null;
  openCaseReferenceId: string | null;
  counts: { visits: number; activeListings: number; pendingListings: number };
  recentListings: { referenceId: string; title: string; status: string; updatedAt: string }[];
};

export async function getAgent(actor: Actor, referenceId: string): Promise<AgentDetail> {
  if (!isReferenceId(referenceId, "AGT")) throw notFound();
  const page = await listAgents(actor, { q: referenceId, sort: "newest" }, 1);
  const base = page.rows.find((r) => r.referenceId === referenceId);
  if (!base) throw notFound();

  const { rows } = await db.execute(sql`
    SELECT ap.id, ap.user_id, ap.rera_agent_number, ap.experience_years, ap.bio, ap.status_reason, ap.approved_at, ap.application_type,
           city.name AS city, ro.name AS requested_org_name, ro.reference_id AS requested_org_reference_id,
           ro.org_type AS ro_type, ro.status AS ro_status, ro.gstin AS ro_gstin, ro.rera_registration AS ro_rera, ro.address AS ro_address,
           ro.contact_email AS ro_email, ro.contact_phone AS ro_phone, ro.website AS ro_website,
           (SELECT reference_id FROM trust.review_cases rc WHERE rc.agent_profile_id = ap.id AND rc.status IN ('open', 'in_review') LIMIT 1) AS open_case,
           (SELECT count(*) FROM crm.visits v WHERE v.agent_user_id = ap.user_id)::int AS visits
      FROM orgs.agent_profiles ap
      LEFT JOIN geography.places city ON city.id = ap.city_place_id
      LEFT JOIN orgs.organizations ro ON ro.id = ap.requested_organization_id
     WHERE ap.reference_id = ${referenceId}`);
  const r = rows[0] as Row;
  const listingRows = await db.execute(sql`
    SELECT l.reference_id, l.title, l.status, l.updated_at FROM marketplace.listings l
      JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.ended_at IS NULL AND la.agent_user_id = ${String(r.user_id)}
     WHERE l.deleted_at IS NULL ORDER BY l.updated_at DESC LIMIT 10`);
  const statusCounts = await db.execute(sql`
    SELECT count(*) FILTER (WHERE l.status = 'published')::int AS active,
           count(*) FILTER (WHERE l.status IN ('submitted', 'under_review'))::int AS pending
      FROM marketplace.listings l
      JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.ended_at IS NULL AND la.agent_user_id = ${String(r.user_id)}`);
  const sc = statusCounts.rows[0] as Row;

  return {
    ...base,
    profileId: String(r.id),
    userId: String(r.user_id),
    reraAgentNumber: (r.rera_agent_number as string) ?? null,
    experienceYears: r.experience_years === null ? null : Number(r.experience_years),
    bio: (r.bio as string) ?? null,
    city: (r.city as string) ?? null,
    statusReason: (r.status_reason as string) ?? null,
    requestedOrganization: r.requested_org_name ? { name: String(r.requested_org_name), referenceId: String(r.requested_org_reference_id) } : null,
    approvedAt: iso(r.approved_at),
    applicationType: r.application_type as AgentApplicationType,
    newOrganization:
      r.application_type === "new_organization" && r.requested_org_name
        ? {
            name: String(r.requested_org_name),
            referenceId: String(r.requested_org_reference_id),
            type: String(r.ro_type),
            status: String(r.ro_status),
            gstin: (r.ro_gstin as string) ?? null,
            reraRegistration: (r.ro_rera as string) ?? null,
            address: (r.ro_address as string) ?? null,
            contactEmail: (r.ro_email as string) ?? null,
            contactPhone: (r.ro_phone as string) ?? null,
            website: (r.ro_website as string) ?? null,
          }
        : null,
    openCaseReferenceId: (r.open_case as string) ?? null,
    counts: { visits: Number(r.visits), activeListings: Number(sc.active), pendingListings: Number(sc.pending) },
    recentListings: (listingRows.rows as Row[]).map((l) => ({
      referenceId: String(l.reference_id),
      title: String(l.title),
      status: String(l.status),
      updatedAt: iso(l.updated_at)!,
    })),
  };
}

// ── Decisions ────────────────────────────────────────────────────────────────

type Locked = {
  id: string;
  userId: string;
  referenceId: string;
  status: string;
  verificationStatus: string;
  requestedOrganizationId: string | null;
  name: string;
  email: string;
  applicationType: AgentApplicationType;
  requestedOrganization: { id: string; name: string; referenceId: string; type: string; status: string; createdBy: string | null } | null;
};

async function lockAgent(tx: Tx, referenceId: string): Promise<Locked> {
  if (!isReferenceId(referenceId, "AGT")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ap.id, ap.user_id, ap.reference_id, ap.status, ap.verification_status, ap.requested_organization_id, ap.application_type, u.name, u.email,
           ro.name AS org_name, ro.reference_id AS org_reference_id, ro.org_type, ro.status AS org_status, ro.created_by AS org_created_by
      FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id
      LEFT JOIN orgs.organizations ro ON ro.id = ap.requested_organization_id
     WHERE ap.reference_id = ${referenceId} FOR UPDATE OF ap`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return {
    id: String(r.id),
    userId: String(r.user_id),
    referenceId: String(r.reference_id),
    status: String(r.status),
    verificationStatus: String(r.verification_status),
    requestedOrganizationId: (r.requested_organization_id as string) ?? null,
    name: String(r.name),
    email: String(r.email),
    applicationType: r.application_type as AgentApplicationType,
    requestedOrganization: r.requested_organization_id
      ? {
          id: String(r.requested_organization_id),
          name: String(r.org_name),
          referenceId: String(r.org_reference_id),
          type: String(r.org_type),
          status: String(r.org_status),
          createdBy: (r.org_created_by as string) ?? null,
        }
      : null,
  };
}

/** The organization this applicant registered while applying, if any (and only if it's still theirs to decide). */
const registeredOrganization = (agent: Locked) =>
  agent.applicationType === "new_organization" && agent.requestedOrganization?.createdBy === agent.userId ? agent.requestedOrganization : null;

const target = (a: Locked) => ({ type: "agent", id: a.id, referenceId: a.referenceId });
const reasonOf = (reason: unknown, required: boolean): string | null => {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (required && text.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });
  if (text.length > 2000) throw invalid("Keep the reason under 2,000 characters.", { reason: "Keep it under 2,000 characters" });
  return text || null;
};

/** Where an approved agent works: the brokerage they asked for, or their own personal organization (D6). */
async function agentMembership(tx: Tx, actor: Actor, agent: Locked): Promise<string> {
  return createAgentMembership(tx, actor.userId, agent, agent.requestedOrganizationId, "agent");
}

/**
 * Gives an agent their workspace: a membership in the organization (if it is still active)
 * or in their own personal organization, holding the given agent-type role.
 */
export async function createAgentMembership(
  tx: Tx,
  createdBy: string,
  agent: { userId: string; name: string; referenceId: string },
  requestedOrganizationId: string | null,
  roleCode: MembershipRole,
): Promise<string> {
  let organizationId = requestedOrganizationId;
  if (organizationId) {
    const active = await tx.execute(sql`SELECT 1 FROM orgs.organizations WHERE id = ${organizationId} AND status = 'active'`);
    if (!active.rows[0]) organizationId = null;
  }
  if (!organizationId) {
    const personal = await tx.execute(sql`
      SELECT o.id FROM orgs.organizations o JOIN orgs.memberships m ON m.organization_id = o.id
       WHERE o.org_type = 'personal' AND m.user_id = ${agent.userId} LIMIT 1`);
    organizationId = (personal.rows[0] as Row | undefined)?.id as string | undefined ?? null;
    if (!organizationId) {
      const created = await tx.execute(sql`
        INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, created_by)
        VALUES (gen_random_uuid(), ${`${agent.name} (independent)`}, ${`agent-${agent.referenceId.toLowerCase()}`}, 'personal', 'active', 'unverified', ${createdBy})
        RETURNING id`);
      organizationId = String((created.rows[0] as Row).id);
    }
  }
  const membership = await tx.execute(sql`
    INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by)
    VALUES (gen_random_uuid(), ${agent.userId}, ${organizationId}, 'active', ${createdBy})
    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', updated_at = now()
    RETURNING id`);
  const membershipId = String((membership.rows[0] as Row).id);
  await tx.execute(sql`
    INSERT INTO orgs.membership_roles (membership_id, role_id)
    SELECT ${membershipId}, id FROM orgs.roles WHERE organization_id IS NULL AND code = ${roleCode}
    ON CONFLICT DO NOTHING`);
  return organizationId;
}

export async function approveAgent(actor: Actor, referenceId: string, options: { verify: boolean }, ctx: RequestContext) {
  assertCan(actor, "agents.verify", "platform");
  let agent!: Locked;
  const { registered } = await db.transaction(async (tx) => {
    agent = await lockAgent(tx, referenceId);
    if (agent.status !== "pending") throw conflict("Only pending applications can be approved.");
    if (agent.userId === actor.userId) throw new AppError("FORBIDDEN", "You can't approve your own application.");
    const verification = options.verify ? "verified" : "unverified";
    // A new organization goes live with its applicant, who becomes its admin.
    const registered = registeredOrganization(agent);
    if (registered) {
      if (registered.status !== "pending") throw conflict(`${registered.name} isn't waiting for approval any more.`);
      await tx.execute(sql`
        UPDATE orgs.organizations SET status = 'active', verification_status = ${verification}, status_reason = NULL, status_changed_at = now(), updated_at = now()
         WHERE id = ${registered.id}`);
      await audit(tx, actor, { event: "ORGANIZATION_APPROVED", target: { type: "organization", id: registered.id, referenceId: registered.referenceId }, organizationId: registered.id, before: { status: "pending" }, after: { status: "active", verificationStatus: verification }, metadata: { agentApplication: agent.referenceId } }, ctx);
    }
    const organizationId = registered
      ? await createAgentMembership(tx, actor.userId, agent, registered.id, OWNER_ROLES[registered.type as ApplicantOrgType] ?? "broker_admin")
      : await agentMembership(tx, actor, agent);
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'active', verification_status = ${verification}, status_reason = NULL,
             approved_by = ${actor.userId}, approved_at = now(), status_changed_at = now(), updated_at = now()
       WHERE id = ${agent.id}`);
    await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'approved', decided_by = ${actor.userId}, decided_at = now(), updated_at = now()
       WHERE agent_profile_id = ${agent.id} AND status IN ('open', 'in_review')`);
    await audit(tx, actor, { event: "AGENT_APPROVED", target: target(agent), organizationId, before: { status: agent.status }, after: { status: "active", verificationStatus: verification } }, ctx);
    await notify(tx, [agent.userId], {
      type: "agent_decision",
      title: "Your agent application is approved",
      body: registered
        ? `${registered.name} is live on Trustbrick and you're its admin. Agents who work with you can apply with its reference, ${registered.referenceId}.`
        : "Your agent workspace is ready. Open it from the menu or go to your dashboard.",
      link: "/dashboard",
    });
    return { organizationId, registered };
  });

  const joined = registered ? null : agent.requestedOrganization?.status === "active" ? agent.requestedOrganization : null;
  void sendEmail(
    agentApprovedMessage(agent.email, {
      name: agent.name,
      organization: registered ? { name: registered.name, referenceId: registered.referenceId, isNew: true } : joined ? { name: joined.name, referenceId: joined.referenceId, isNew: false } : null,
      url: link("/dashboard"),
    }),
  ).catch((e) => console.error("[agents] approval email failed", e));
}

export async function rejectAgent(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "agents.verify", "platform");
  const reason = reasonOf(rawReason, true);
  let agent!: Locked;
  const registered = await db.transaction(async (tx) => {
    agent = await lockAgent(tx, referenceId);
    if (agent.status !== "pending") throw conflict("Only pending applications can be rejected.");
    // The organization they registered goes with the application (they can register it again when reapplying).
    const registered = registeredOrganization(agent);
    if (registered?.status === "pending") {
      await tx.execute(sql`
        UPDATE orgs.organizations SET status = 'rejected', verification_status = 'rejected', status_reason = ${reason}, status_changed_at = now(), updated_at = now()
         WHERE id = ${registered.id}`);
      await audit(tx, actor, { event: "ORGANIZATION_REJECTED", target: { type: "organization", id: registered.id, referenceId: registered.referenceId }, organizationId: registered.id, before: { status: "pending" }, after: { status: "rejected" }, metadata: { reason, agentApplication: agent.referenceId } }, ctx);
    }
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'rejected', verification_status = 'rejected', status_reason = ${reason},
             status_changed_at = now(), updated_at = now() WHERE id = ${agent.id}`);
    await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'rejected', decided_by = ${actor.userId}, decided_at = now(), decision_reason = ${reason}, updated_at = now()
       WHERE agent_profile_id = ${agent.id} AND status IN ('open', 'in_review')`);
    await audit(tx, actor, { event: "AGENT_REJECTED", target: target(agent), before: { status: agent.status }, after: { status: "rejected" }, metadata: { reason } }, ctx);
    await notify(tx, [agent.userId], { type: "agent_decision", title: "Your agent application was not approved", body: reason ?? undefined, link: "/become-an-agent" });
    return registered;
  });

  void sendEmail(agentRejectedMessage(agent.email, { name: agent.name, reason, organizationName: registered?.name ?? null, url: link("/become-an-agent") })).catch((e) =>
    console.error("[agents] rejection email failed", e),
  );
}

export async function setAgentVerification(actor: Actor, referenceId: string, verified: boolean, ctx: RequestContext) {
  assertCan(actor, "agents.verify", "platform");
  await db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    if (agent.status !== "active") throw conflict("Only active agents can be verified.");
    const next = verified ? "verified" : "unverified";
    if (agent.verificationStatus === next) return;
    await tx.execute(sql`UPDATE orgs.agent_profiles SET verification_status = ${next}, updated_at = now() WHERE id = ${agent.id}`);
    await audit(tx, actor, { event: "AGENT_UPDATED", target: target(agent), before: { verificationStatus: agent.verificationStatus }, after: { verificationStatus: next } }, ctx);
  });
}

export async function suspendAgent(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext): Promise<{ paused: number }> {
  assertCan(actor, "agents.suspend", "platform");
  const reason = reasonOf(rawReason, true);
  return db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    if (agent.status !== "active") throw conflict("Only active agents can be suspended.");
    if (agent.userId === actor.userId) throw new AppError("FORBIDDEN", "You can't suspend yourself.");
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'suspended', status_reason = ${reason}, status_changed_at = now(), updated_at = now() WHERE id = ${agent.id}`);
    const paused = await pauseListings(tx, sql`la.agent_user_id = ${agent.userId}`, HOLD_REASONS.agent, actor.userId);
    await audit(tx, actor, { event: "AGENT_SUSPENDED", target: target(agent), before: { status: "active" }, after: { status: "suspended" }, metadata: { reason, listingsPaused: paused } }, ctx);
    await notify(tx, [agent.userId], { type: "security", title: "Your agent access is suspended", body: reason ?? undefined });
    return { paused };
  });
}

export async function reinstateAgent(actor: Actor, referenceId: string, ctx: RequestContext): Promise<{ resumed: number }> {
  assertCan(actor, "agents.suspend", "platform");
  return db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    if (agent.status !== "suspended") throw conflict("Only suspended agents can be reinstated.");
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'active', status_reason = NULL, status_changed_at = now(), updated_at = now() WHERE id = ${agent.id}`);
    const resumed = await resumeListings(tx, sql`la.agent_user_id = ${agent.userId}`, actor.userId);
    await audit(tx, actor, { event: "AGENT_REINSTATED", target: target(agent), before: { status: "suspended" }, after: { status: "active" }, metadata: { listingsResumed: resumed } }, ctx);
    await notify(tx, [agent.userId], { type: "security", title: "Your agent access is restored", link: "/dashboard" });
    return { resumed };
  });
}

export const agentUpdateSchema = z.object({
  phone,
  reraAgentNumber: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(60).optional()),
  experienceYears: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(70).optional()),
  bio: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(600).optional()),
});

/** Admins may edit these fields only; identity (name, email) belongs to the user account. */
export async function updateAgent(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "agents.manage", "platform");
  const parsed = agentUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  await db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    const before = await tx.execute(sql`SELECT phone, rera_agent_number, experience_years, bio FROM orgs.agent_profiles WHERE id = ${agent.id}`);
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET phone = ${input.phone}, rera_agent_number = ${input.reraAgentNumber ?? null},
             experience_years = ${input.experienceYears ?? null}, bio = ${input.bio ?? null}, updated_at = now()
       WHERE id = ${agent.id}`);
    await audit(tx, actor, { event: "AGENT_UPDATED", target: target(agent), before: before.rows[0] as Row, after: { phone: input.phone, rera_agent_number: input.reraAgentNumber ?? null, experience_years: input.experienceYears ?? null, bio: input.bio ?? null } }, ctx);
  });
}

export const canSeeAgentContact = (actor: Actor) => can(actor, "agents.view", "org");

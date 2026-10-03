import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { HOLD_REASONS, pauseListings, resumeListings } from "./listings/lifecycle";
import { notify, notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";
import { getSetting } from "./settings";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── Applying ─────────────────────────────────────────────────────────────────

export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits"));

export const applicationSchema = z.object({
  phone,
  reraAgentNumber: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(60).optional()),
  cityId: z.uuid({ message: "Choose the city you work in" }),
  experienceYears: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(70).optional()),
  organizationReference: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? normalizeReferenceId(v) : undefined),
    z.string().refine((v) => isReferenceId(v, "ORG"), "Enter an organization reference like ORG-7K4M9Q2X").optional(),
  ),
  bio: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(600).optional()),
});

export type AgentApplicationState =
  | { state: "none" }
  | { state: "pending" | "active" | "suspended" | "rejected"; referenceId: string; reason: string | null; submittedAt: string };

export async function agentApplicationFor(userId: string): Promise<AgentApplicationState> {
  const { rows } = await db.execute(sql`SELECT reference_id, status, status_reason, created_at FROM orgs.agent_profiles WHERE user_id = ${userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return { state: "none" };
  return { state: r.status as "pending", referenceId: String(r.reference_id), reason: (r.status_reason as string) ?? null, submittedAt: iso(r.created_at)! };
}

/** A logged-in customer applies to become an agent. Nothing is granted until an admin approves. */
export async function applyAsAgent(user: PersonActor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  if (!(await getSetting("agents.applications_open"))) throw new AppError("FORBIDDEN", "Agent applications are paused at the moment.");
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;

  const limited = await limit([{ key: `agent-apply:user:${user.userId}`, rule: RULES.agentApplicationByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  return db.transaction(async (tx) => {
    const account = await tx.execute(sql`SELECT email_verified, status FROM identity.users WHERE id = ${user.userId}`);
    const a = account.rows[0] as Row | undefined;
    if (!a || a.status !== "active" || !a.email_verified) throw new AppError("FORBIDDEN");

    const city = await tx.execute(sql`SELECT id FROM geography.places WHERE id = ${input.cityId} AND place_type = 'city' AND is_active`);
    if (!city.rows[0]) throw invalid("Choose the city you work in.", { cityId: "Choose the city you work in" });

    let requestedOrg: string | null = null;
    if (input.organizationReference) {
      const org = await tx.execute(sql`
        SELECT id FROM orgs.organizations WHERE reference_id = ${input.organizationReference}
           AND status = 'active' AND org_type IN ('brokerage', 'developer', 'property_manager', 'pg_operator') AND deleted_at IS NULL`);
      if (!org.rows[0]) {
        throw invalid("We couldn't find an active organization with that reference.", { organizationReference: "No active organization has this reference" });
      }
      requestedOrg = String((org.rows[0] as Row).id);
    }

    const existing = await tx.execute(sql`SELECT id, status FROM orgs.agent_profiles WHERE user_id = ${user.userId} FOR UPDATE`);
    const prior = existing.rows[0] as Row | undefined;
    if (prior && prior.status !== "rejected") throw conflict("You have already applied. You'll be notified when it's decided.");

    const values = sql`${input.phone}, ${input.reraAgentNumber ?? null}, ${input.cityId}, ${input.experienceYears ?? null}, ${input.bio ?? null}, ${requestedOrg}`;
    const saved = prior
      ? await tx.execute(sql`
          UPDATE orgs.agent_profiles
             SET (phone, rera_agent_number, city_place_id, experience_years, bio, requested_organization_id) = (${values}),
                 status = 'pending', verification_status = 'pending', status_reason = NULL, status_changed_at = now(), updated_at = now()
           WHERE id = ${String(prior.id)} RETURNING id, reference_id`)
      : await tx.execute(sql`
          INSERT INTO orgs.agent_profiles (id, user_id, phone, rera_agent_number, city_place_id, experience_years, bio, requested_organization_id)
          VALUES (gen_random_uuid(), ${user.userId}, ${values}) RETURNING id, reference_id`);
    const profile = saved.rows[0] as Row;
    const referenceId = String(profile.reference_id);

    const kase = await tx.execute(sql`
      INSERT INTO trust.review_cases (id, case_type, agent_profile_id, status, submitted_by)
      VALUES (gen_random_uuid(), 'agent_application', ${String(profile.id)}, 'open', ${user.userId}) RETURNING reference_id`);

    await audit(tx, user, { event: "AGENT_APPLIED", target: { type: "agent", id: String(profile.id), referenceId }, metadata: { case: (kase.rows[0] as Row).reference_id } }, ctx);
    await notifyPermissionHolders(tx, "agents.verify", {
      type: "agent_application",
      title: `New agent application ${referenceId}`,
      link: `/agents/${referenceId}`,
    });
    return { referenceId };
  });
}

// ── Listing and viewing agents ────────────────────────────────────────────────

export const agentFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["pending", "active", "suspended", "rejected"]).optional().catch(undefined),
  verification: z.enum(["unverified", "pending", "verified", "rejected"]).optional().catch(undefined),
  sort: z.enum(["newest", "oldest", "name", "listings"]).catch("newest"),
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
             (SELECT max(s.updated_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at
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
    SELECT ap.id, ap.user_id, ap.rera_agent_number, ap.experience_years, ap.bio, ap.status_reason, ap.approved_at,
           city.name AS city, ro.name AS requested_org_name, ro.reference_id AS requested_org_reference_id,
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

type Locked = { id: string; userId: string; referenceId: string; status: string; verificationStatus: string; requestedOrganizationId: string | null; name: string };

async function lockAgent(tx: Tx, referenceId: string): Promise<Locked> {
  if (!isReferenceId(referenceId, "AGT")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ap.id, ap.user_id, ap.reference_id, ap.status, ap.verification_status, ap.requested_organization_id, u.name
      FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id
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
  };
}

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
  roleCode: "agent" | "broker_admin",
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
  await db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    if (agent.status !== "pending") throw conflict("Only pending applications can be approved.");
    if (agent.userId === actor.userId) throw new AppError("FORBIDDEN", "You can't approve your own application.");
    const organizationId = await agentMembership(tx, actor, agent);
    const verification = options.verify ? "verified" : "unverified";
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
      body: "Your agent workspace is ready. Open it from the menu or go to your dashboard.",
      link: "/dashboard",
    });
  });
}

export async function rejectAgent(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "agents.verify", "platform");
  const reason = reasonOf(rawReason, true);
  await db.transaction(async (tx) => {
    const agent = await lockAgent(tx, referenceId);
    if (agent.status !== "pending") throw conflict("Only pending applications can be rejected.");
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'rejected', verification_status = 'rejected', status_reason = ${reason},
             status_changed_at = now(), updated_at = now() WHERE id = ${agent.id}`);
    await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'rejected', decided_by = ${actor.userId}, decided_at = now(), decision_reason = ${reason}, updated_at = now()
       WHERE agent_profile_id = ${agent.id} AND status IN ('open', 'in_review')`);
    await audit(tx, actor, { event: "AGENT_REJECTED", target: target(agent), before: { status: agent.status }, after: { status: "rejected" }, metadata: { reason } }, ctx);
    await notify(tx, [agent.userId], { type: "agent_decision", title: "Your agent application was not approved", body: reason ?? undefined, link: "/become-an-agent" });
  });
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

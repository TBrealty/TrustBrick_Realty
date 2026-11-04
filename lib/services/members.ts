import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { AGENT_ORG_ROLES, LEAD_HOLDING_ROLES, ORG_ROLES, ORG_ROLE_RANK, ROLES, type OrgRole, isOrgRole } from "@/lib/authz/catalog";
import { leadScope, listingScope } from "@/lib/authz/scope";
import { type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { agentApprovedMessage, joinRequestDeclinedMessage, memberInvitationMessage, membershipChangedMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { AppError, conflict, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { phone } from "./agents";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { type AcceptInput, INVITATION_TTL_HOURS, guardAcceptance, hashToken, isTokenShape, newInvitationToken, resolveInvitedAccount } from "./invitation-core";
import { notify } from "./notifications";

/**
 * The people of an organization (docs/portals/README.md §6). Owners and Managers add people by
 * email, in one of five roles; the organization vouches for them, so nobody waits for Trustbrick.
 * Owners manage everyone; Managers manage the people below Manager; only Owners make someone a
 * Manager or an Owner. Nobody changes their own role or removes themselves, so an organization
 * always keeps an Owner. Removing someone hands their listings, leads, visits and stays to
 * another member. Teams give Supervisors their scope.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const blank = (v: unknown) => (v === "" || v === null ? undefined : v);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const link = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();

export const roleName = (role: OrgRole | null) => (role ? ROLES[role].name : "No role");
const withArticle = (role: OrgRole) => (/^[AEIOU]/.test(ROLES[role].name) ? `an ${ROLES[role].name}` : `a ${ROLES[role].name}`);

const orgRoleList = sql.raw(ORG_ROLES.map((r) => `'${r}'`).join(", "));
/** A membership's organization role: the most senior one it holds (people normally hold one). */
const roleColumn = sql`(SELECT r.code FROM orgs.membership_roles mr JOIN orgs.roles r ON r.id = mr.role_id AND r.organization_id IS NULL
                         WHERE mr.membership_id = m.id AND r.code IN (${orgRoleList})
                         ORDER BY array_position(ARRAY[${orgRoleList}]::text[], r.code) LIMIT 1)`;

const isOwner = (actor: Actor) => actor.roles.includes("owner");
const inOrganization = (actor: Actor) => actor.workspace === "professional" && actor.organization.orgType !== "personal";

/** The roles this person may give, and take away from others. Empty when they can't manage people. */
export function rolesYouCanGive(actor: Actor): OrgRole[] {
  if (!inOrganization(actor) || !can(actor, "members.manage", "org")) return [];
  return ORG_ROLES.filter((r) => isOwner(actor) || ORG_ROLE_RANK[r] < ORG_ROLE_RANK.manager);
}

/** Whether the actor may change this member's role or remove them. Never themselves. */
export function mayManage(actor: Actor, member: { membershipId: string; role: OrgRole | null }): boolean {
  if (member.membershipId === actor.membershipId) return false;
  const giveable = rolesYouCanGive(actor);
  return member.role ? giveable.includes(member.role) : isOwner(actor);
}

export const canViewMembers = (actor: Actor) => inOrganization(actor) && can(actor, "members.view", "team");
export const canManageMembers = (actor: Actor) => rolesYouCanGive(actor).length > 0;

function memberScope(actor: Actor): SQL {
  const scope = assertCan(actor, "members.view", "team");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  return scope === "team" ? sql`m.id = ANY(${sql.param(actor.teamMembershipIds)}::uuid[])` : sql`TRUE`;
}

// ── Reading ──────────────────────────────────────────────────────────────────

export type MemberRow = {
  membershipId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string | null;
  role: OrgRole | null;
  roleName: string;
  agentReferenceId: string | null;
  /** The person's agent profile, if they have one: a suspended one stops them working as an agent. */
  agentStatus: string | null;
  teams: { id: string; name: string }[];
  listings: number;
  openLeads: number;
  upcomingVisits: number;
  joinedAt: string;
  lastActiveAt: string | null;
  isYou: boolean;
};

export const memberFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(ORG_ROLES).optional().catch(undefined),
  team: z.uuid().optional().catch(undefined),
});
export type MemberFilters = z.infer<typeof memberFilters>;

const MEMBER_LIMIT = 1000;

/** The organization's people (Owners and Managers), or a Supervisor's teams. Most senior first. */
export async function listMembers(actor: Actor, filters: MemberFilters = {}): Promise<MemberRow[]> {
  const where: SQL[] = [memberScope(actor)];
  if (filters.q) {
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(u.reference_id = ${normalizeReferenceId(filters.q)} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR ap.phone LIKE ${like})`);
  }
  if (filters.team) where.push(sql`EXISTS (SELECT 1 FROM orgs.team_members ft WHERE ft.membership_id = m.id AND ft.team_id = ${filters.team})`);
  const { rows } = await db.execute(sql`
    SELECT * FROM (
      SELECT m.id AS membership_id, u.reference_id, u.name, u.email, ap.phone, ap.reference_id AS agent_ref, ap.status AS agent_status, m.created_at,
             ${roleColumn} AS role,
             coalesce((SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
                         FROM orgs.team_members tm JOIN orgs.teams t ON t.id = tm.team_id AND t.deleted_at IS NULL
                        WHERE tm.membership_id = m.id), '[]'::json) AS teams,
             (SELECT count(*) FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id AND l.deleted_at IS NULL
               WHERE la.membership_id = m.id AND la.ended_at IS NULL)::int AS listings,
             (SELECT count(*) FROM crm.leads ld WHERE ld.organization_id = m.organization_id AND ld.agent_user_id = m.user_id
                 AND ld.deleted_at IS NULL AND ld.status NOT IN ('converted', 'lost'))::int AS open_leads,
             (SELECT count(*) FROM crm.visits v WHERE v.organization_id = m.organization_id AND v.agent_user_id = m.user_id
                 AND v.status IN ('requested', 'scheduled'))::int AS upcoming_visits,
             (SELECT max(s.updated_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at
        FROM orgs.memberships m
        JOIN identity.users u ON u.id = m.user_id
        LEFT JOIN orgs.agent_profiles ap ON ap.user_id = m.user_id
       WHERE m.organization_id = ${actor.organization.id} AND m.status = 'active' AND ${sql.join(where, sql` AND `)}
    ) x
    ${filters.role ? sql`WHERE x.role = ${filters.role}` : sql``}
    ORDER BY array_position(ARRAY[${orgRoleList}]::text[], x.role) NULLS LAST, x.name
    LIMIT ${MEMBER_LIMIT}`);
  return (rows as Row[]).map((r) => {
    const role = isOrgRole(r.role) ? r.role : null;
    return {
      membershipId: String(r.membership_id),
      userReferenceId: String(r.reference_id),
      name: String(r.name),
      email: String(r.email),
      phone: (r.phone as string) ?? null,
      role,
      roleName: roleName(role),
      agentReferenceId: (r.agent_ref as string) ?? null,
      agentStatus: (r.agent_status as string) ?? null,
      teams: (r.teams as { id: string; name: string }[]) ?? [],
      listings: Number(r.listings),
      openLeads: Number(r.open_leads),
      upcomingVisits: Number(r.upcoming_visits),
      joinedAt: iso(r.created_at)!,
      lastActiveAt: iso(r.last_active_at),
      isYou: String(r.membership_id) === actor.membershipId,
    };
  });
}

export type MemberDetail = MemberRow & {
  /** What the viewer may do to this member. */
  manage: { roles: OrgRole[]; canChangeRole: boolean; canRemove: boolean };
  /** Who this member's work can be handed to: other active members who work leads. */
  handoverTo: { userReferenceId: string; name: string; roleName: string }[];
  /** Stays this member hosts that are booked or waiting (handed over with the rest). */
  openBookings: number;
};

export async function getMember(actor: Actor, userReferenceId: string): Promise<MemberDetail> {
  if (!isReferenceId(userReferenceId, "USR")) throw notFound();
  const all = await listMembers(actor);
  const member = all.find((m) => m.userReferenceId === userReferenceId);
  if (!member) throw notFound();
  const managing = mayManage(actor, member);
  const bookings = await db.execute(sql`
    SELECT count(*)::int AS n FROM stays.bookings b JOIN orgs.memberships m ON m.user_id = b.host_user_id AND m.id = ${member.membershipId}
     WHERE b.organization_id = ${actor.organization.id} AND b.status IN ('requested', 'confirmed', 'checked_in')`);
  return {
    ...member,
    manage: { roles: managing ? rolesYouCanGive(actor) : [], canChangeRole: managing, canRemove: managing },
    handoverTo: managing
      ? all
          .filter((m) => m.membershipId !== member.membershipId && m.role && LEAD_HOLDING_ROLES.includes(m.role) && !agentBlocked(m))
          .map((m) => ({ userReferenceId: m.userReferenceId, name: m.name, roleName: m.roleName }))
      : [],
    openBookings: Number((bookings.rows[0] as Row).n),
  };
}

/** An agent or supervisor whose agent profile isn't active can't hold anything. */
const agentBlocked = (m: { role: OrgRole | null; agentStatus: string | null }) => m.role !== null && AGENT_ORG_ROLES.includes(m.role) && m.agentStatus !== "active";

export type Assignee = { userReferenceId: string; name: string; roleName: string; isYou: boolean };
type Holder = Assignee & { userId: string; membershipId: string };

/** Active members who work leads (and so can hold a lead or a listing), in the actor's team or organization. */
async function holders(actor: Actor, teamOnly: boolean): Promise<Holder[]> {
  const { rows } = await db.execute(sql`
    SELECT u.id AS user_id, u.reference_id, u.name, ${roleColumn} AS role, ap.status AS agent_status, m.id AS membership_id
      FROM orgs.memberships m JOIN identity.users u ON u.id = m.user_id AND u.status = 'active'
      LEFT JOIN orgs.agent_profiles ap ON ap.user_id = m.user_id
     WHERE m.organization_id = ${actor.organization.id} AND m.status = 'active'
       ${teamOnly ? sql`AND m.id = ANY(${sql.param(actor.teamMembershipIds)}::uuid[])` : sql``}
     ORDER BY u.name`);
  return (rows as Row[])
    .map((r) => ({ role: isOrgRole(r.role) ? r.role : null, agentStatus: (r.agent_status as string) ?? null, r }))
    .filter(({ role, agentStatus }) => role && LEAD_HOLDING_ROLES.includes(role) && !agentBlocked({ role, agentStatus }))
    .map(({ role, r }) => ({
      userId: String(r.user_id),
      membershipId: String(r.membership_id),
      userReferenceId: String(r.reference_id),
      name: String(r.name),
      roleName: roleName(role),
      isYou: String(r.membership_id) === actor.membershipId,
    }));
}

const publicHolder = ({ userReferenceId, name, roleName: role, isYou }: Holder): Assignee => ({ userReferenceId, name, roleName: role, isYou });

/** People a lead can be given to by this actor: in their team (Supervisors) or organization. */
export async function leadAssignees(actor: Actor): Promise<Assignee[]> {
  if (!can(actor, "leads.assign", "team") || !inOrganization(actor)) return [];
  return (await holders(actor, actor.permissions["leads.assign"] === "team")).map(publicHolder);
}

/** People who can be a listing's agent for this actor: who works leads, in their team (Supervisors) or organization. */
export async function listingAgentChoices(actor: Actor): Promise<Assignee[]> {
  if (!inOrganization(actor) || !can(actor, "listings.edit", "team")) return [];
  return (await holders(actor, actor.permissions["listings.edit"] === "team")).map(publicHolder);
}

/**
 * Operators prepare listings but don't work leads, so a listing they create needs someone else as
 * its agent: the person customers' enquiries go to.
 */
export const needsListingAgent = (actor: Actor) => inOrganization(actor) && !can(actor, "leads.view");

/** The member a listing is given to, checked against who this actor may choose. */
export async function resolveListingAgent(actor: Actor, raw: unknown): Promise<{ userId: string; membershipId: string; name: string }> {
  const ref = typeof raw === "string" ? normalizeReferenceId(raw) : "";
  const pick = ref ? (await holders(actor, actor.permissions["listings.edit"] === "team")).find((h) => h.userReferenceId === ref) : undefined;
  if (!pick) throw invalid("Choose the agent for this listing.", { agent: "Choose the agent customers' enquiries go to" });
  return { userId: pick.userId, membershipId: pick.membershipId, name: pick.name };
}

/**
 * Gives a listing to another agent. Its open leads, upcoming visits and stay bookings go with it,
 * so whoever holds the listing holds the conversations about it; closed ones keep their history.
 */
export async function assignListingAgent(actor: Actor, listingReferenceId: string, rawUserReferenceId: unknown, ctx: RequestContext) {
  assertCan(actor, "listings.edit", "team");
  if (!inOrganization(actor) || !isReferenceId(listingReferenceId, "LST")) throw notFound();
  const target = await resolveListingAgent(actor, rawUserReferenceId);

  await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT l.id, l.title FROM marketplace.listings l
       WHERE l.reference_id = ${listingReferenceId} AND l.deleted_at IS NULL AND ${listingScope(actor, "listings.edit")} FOR UPDATE OF l`);
    const listing = found.rows[0] as Row | undefined;
    if (!listing) throw notFound();
    const listingId = String(listing.id);
    const currentRow = await tx.execute(sql`
      SELECT agent_user_id FROM marketplace.listing_agents WHERE listing_id = ${listingId} AND role = 'primary' AND ended_at IS NULL`);
    const previous = ((currentRow.rows[0] as Row | undefined)?.agent_user_id as string | undefined) ?? null;
    if (previous === target.userId) return;

    await tx.execute(sql`UPDATE marketplace.listing_agents SET ended_at = now() WHERE listing_id = ${listingId} AND role = 'primary' AND ended_at IS NULL`);
    const promoted = await tx.execute(sql`
      UPDATE marketplace.listing_agents SET role = 'primary' WHERE listing_id = ${listingId} AND agent_user_id = ${target.userId} AND ended_at IS NULL`);
    if (!promoted.rowCount) {
      await tx.execute(sql`
        INSERT INTO marketplace.listing_agents (id, listing_id, agent_user_id, membership_id, role, assigned_by)
        VALUES (gen_random_uuid(), ${listingId}, ${target.userId}, ${target.membershipId}, 'primary', ${actor.userId})`);
    }
    if (previous) {
      await tx.execute(sql`
        WITH moved AS (
          UPDATE crm.leads SET agent_user_id = ${target.userId}, agent_membership_id = ${target.membershipId}, updated_at = now()
           WHERE listing_id = ${listingId} AND agent_user_id = ${previous} AND deleted_at IS NULL AND status NOT IN ('converted', 'lost') RETURNING id)
        INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
        SELECT gen_random_uuid(), id, 'assigned', ${`The listing went to ${target.name}, with this lead`}, ${actor.userId} FROM moved`);
      await tx.execute(sql`
        UPDATE crm.visits SET agent_user_id = ${target.userId}, updated_at = now()
         WHERE listing_id = ${listingId} AND agent_user_id = ${previous} AND status IN ('requested', 'scheduled')`);
      await tx.execute(sql`
        UPDATE stays.bookings SET host_user_id = ${target.userId}, updated_at = now()
         WHERE listing_id = ${listingId} AND host_user_id = ${previous} AND status IN ('requested', 'confirmed', 'checked_in')`);
      await tx.execute(sql`
        UPDATE stays.conversations SET host_user_id = ${target.userId}, updated_at = now()
         WHERE listing_id = ${listingId} AND host_user_id = ${previous} AND guest_user_id <> ${target.userId}`);
    }
    await audit(
      tx,
      actor,
      {
        event: "LISTING_AGENT_CHANGED",
        target: { type: "listing", id: listingId, referenceId: listingReferenceId },
        organizationId: actor.organization.id,
        before: { agentUserId: previous },
        after: { agentUserId: target.userId },
      },
      ctx,
    );
    if (target.userId !== actor.userId) {
      await notify(tx, [target.userId], {
        type: "lead_assigned",
        title: `${String(listing.title)} is now yours`,
        body: `${actor.name} made you its agent. Its open leads and visits came with it.`,
        link: `/properties/${listingReferenceId}`,
      });
    }
  });
}

// ── Shared steps ─────────────────────────────────────────────────────────────

type Locked = { membershipId: string; userId: string; userReferenceId: string; name: string; email: string; role: OrgRole | null; agentStatus: string | null };

async function lockMember(tx: Tx, actor: Actor, userReferenceId: string): Promise<Locked> {
  if (!isReferenceId(userReferenceId, "USR")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT m.id, m.user_id, u.reference_id, u.name, u.email, ap.status AS agent_status, ${roleColumn} AS role
      FROM orgs.memberships m JOIN identity.users u ON u.id = m.user_id
      LEFT JOIN orgs.agent_profiles ap ON ap.user_id = m.user_id
     WHERE m.organization_id = ${actor.organization.id} AND u.reference_id = ${userReferenceId} AND m.status = 'active'
       FOR UPDATE OF m`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return {
    membershipId: String(r.id),
    userId: String(r.user_id),
    userReferenceId: String(r.reference_id),
    name: String(r.name),
    email: String(r.email),
    role: isOrgRole(r.role) ? r.role : null,
    agentStatus: (r.agent_status as string) ?? null,
  };
}

/** Gives a membership exactly one organization role. Only agents and supervisors stay in teams; supervisors lead theirs. */
async function setOrgRole(tx: Tx, membershipId: string, role: OrgRole) {
  await tx.execute(sql`
    DELETE FROM orgs.membership_roles mr USING orgs.roles r
     WHERE mr.role_id = r.id AND mr.membership_id = ${membershipId} AND r.organization_id IS NULL AND r.code IN (${orgRoleList})`);
  await tx.execute(sql`
    INSERT INTO orgs.membership_roles (membership_id, role_id)
    SELECT ${membershipId}, id FROM orgs.roles WHERE organization_id IS NULL AND code = ${role}`);
  if (AGENT_ORG_ROLES.includes(role)) {
    await tx.execute(sql`UPDATE orgs.team_members SET is_lead = ${role === "supervisor"} WHERE membership_id = ${membershipId}`);
  } else {
    await tx.execute(sql`DELETE FROM orgs.team_members WHERE membership_id = ${membershipId}`);
  }
}

/**
 * Agents and supervisors work in front of customers, so they need an active agent profile. The
 * organization vouches for its people: one is created (unverified) with the phone number given.
 */
async function ensureAgentProfile(tx: Tx, userId: string, details: { phone?: string | null; rera?: string | null }, approvedBy: string, organizationId: string) {
  const prior = await tx.execute(sql`SELECT id, status FROM orgs.agent_profiles WHERE user_id = ${userId} FOR UPDATE`);
  const p = prior.rows[0] as Row | undefined;
  if (p?.status === "active") return;
  if (p?.status === "suspended") throw conflict("Trustbrick has suspended this account's agent access, so it can't work as an agent or supervisor.");
  if (p?.status === "pending") throw conflict("This account's own agent application is waiting for Trustbrick's decision. Try again once it's decided.");
  if (!details.phone) throw invalid("Agents and supervisors need a phone number.", { phone: "Enter their phone number: customers who enquire see it" });
  const values = sql`${details.phone}, ${details.rera ?? null}, ${organizationId}`;
  if (p) {
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET (phone, rera_agent_number, requested_organization_id) = (${values}), application_type = 'join_organization',
             status = 'active', verification_status = 'unverified', status_reason = NULL, status_changed_at = now(),
             approved_by = ${approvedBy}, approved_at = now(), updated_at = now()
       WHERE id = ${String(p.id)}`);
  } else {
    await tx.execute(sql`
      INSERT INTO orgs.agent_profiles (id, user_id, phone, rera_agent_number, requested_organization_id, application_type, status,
                                       verification_status, approved_by, approved_at, status_changed_at)
      VALUES (gen_random_uuid(), ${userId}, ${values}, 'join_organization', 'active', 'unverified', ${approvedBy}, now(), now())`);
  }
}

type Work = { listings: number; leads: number; visits: number; bookings: number };
const hasWork = (w: Work) => w.listings + w.leads + w.visits + w.bookings > 0;

async function workOf(tx: Tx, organizationId: string, m: Locked): Promise<Work> {
  const { rows } = await tx.execute(sql`
    SELECT (SELECT count(*) FROM marketplace.listing_agents la WHERE la.membership_id = ${m.membershipId} AND la.ended_at IS NULL)::int AS listings,
           (SELECT count(*) FROM crm.leads ld WHERE ld.organization_id = ${organizationId} AND ld.agent_user_id = ${m.userId}
               AND ld.deleted_at IS NULL AND ld.status NOT IN ('converted', 'lost'))::int AS leads,
           (SELECT count(*) FROM crm.visits v WHERE v.organization_id = ${organizationId} AND v.agent_user_id = ${m.userId}
               AND v.status IN ('requested', 'scheduled'))::int AS visits,
           (SELECT count(*) FROM stays.bookings b WHERE b.organization_id = ${organizationId} AND b.host_user_id = ${m.userId}
               AND b.status IN ('requested', 'confirmed', 'checked_in'))::int AS bookings`);
  const r = rows[0] as Row;
  return { listings: Number(r.listings), leads: Number(r.leads), visits: Number(r.visits), bookings: Number(r.bookings) };
}

/** The member who takes over someone's work: active, not them, and someone who works leads. */
async function recipientFor(tx: Tx, actor: Actor, from: Locked, raw: unknown): Promise<Locked> {
  const ref = typeof raw === "string" ? normalizeReferenceId(raw) : "";
  const problem = { handoverTo: "Choose who takes over their listings, leads and visits" };
  if (!ref) throw invalid("Choose who takes over their work.", problem);
  const to = await lockMember(tx, actor, ref).catch(() => null);
  if (!to || to.membershipId === from.membershipId || !to.role || !LEAD_HOLDING_ROLES.includes(to.role) || agentBlocked(to)) {
    throw invalid("Choose an active Owner, Manager, Supervisor or Agent to take over.", problem);
  }
  return to;
}

/**
 * Moves everything a member is responsible for in this organization to another member: current
 * listings (the old assignment is ended, so history stays), every lead, and the visits and stay
 * bookings still to come. Past visits and stays keep who handled them.
 */
async function handOver(tx: Tx, actor: Actor, from: Locked, to: Locked): Promise<Work> {
  const org = actor.organization.id;
  const ended = await tx.execute(sql`
    UPDATE marketplace.listing_agents SET ended_at = now() WHERE membership_id = ${from.membershipId} AND ended_at IS NULL RETURNING listing_id, role`);
  const listings = ended.rows as { listing_id: string; role: string }[];
  if (listings.length > 0) {
    const ids = sql.param(listings.map((l) => l.listing_id));
    const roles = sql.param(listings.map((l) => l.role));
    await tx.execute(sql`
      INSERT INTO marketplace.listing_agents (id, listing_id, agent_user_id, membership_id, role, assigned_by)
      SELECT gen_random_uuid(), x.listing_id, ${to.userId}, ${to.membershipId}, x.role, ${actor.userId}
        FROM unnest(${ids}::uuid[], ${roles}::text[]) AS x(listing_id, role)
       WHERE NOT EXISTS (SELECT 1 FROM marketplace.listing_agents c WHERE c.listing_id = x.listing_id AND c.agent_user_id = ${to.userId} AND c.ended_at IS NULL)`);
    // Already on the listing in another capacity: they become its primary agent.
    await tx.execute(sql`
      UPDATE marketplace.listing_agents c SET role = 'primary'
        FROM unnest(${ids}::uuid[], ${roles}::text[]) AS x(listing_id, role)
       WHERE c.listing_id = x.listing_id AND c.agent_user_id = ${to.userId} AND c.ended_at IS NULL AND x.role = 'primary'`);
  }
  const open = await tx.execute(sql`
    SELECT count(*)::int AS n FROM crm.leads
     WHERE organization_id = ${org} AND agent_user_id = ${from.userId} AND deleted_at IS NULL AND status NOT IN ('converted', 'lost')`);
  await tx.execute(sql`
    WITH moved AS (
      UPDATE crm.leads SET agent_user_id = ${to.userId}, agent_membership_id = ${to.membershipId}, updated_at = now()
       WHERE organization_id = ${org} AND agent_user_id = ${from.userId} AND deleted_at IS NULL RETURNING id)
    INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
    SELECT gen_random_uuid(), id, 'assigned', ${`Handed over from ${from.name} to ${to.name}`}, ${actor.userId} FROM moved`);
  const visits = await tx.execute(sql`
    UPDATE crm.visits SET agent_user_id = ${to.userId}, updated_at = now()
     WHERE organization_id = ${org} AND agent_user_id = ${from.userId} AND status IN ('requested', 'scheduled')`);
  const bookings = await tx.execute(sql`
    UPDATE stays.bookings SET host_user_id = ${to.userId}, updated_at = now()
     WHERE organization_id = ${org} AND host_user_id = ${from.userId} AND status IN ('requested', 'confirmed', 'checked_in')`);
  await tx.execute(sql`
    UPDATE stays.conversations SET host_user_id = ${to.userId}, updated_at = now()
     WHERE organization_id = ${org} AND host_user_id = ${from.userId} AND guest_user_id <> ${to.userId}`);
  return { listings: listings.length, leads: Number((open.rows[0] as Row).n), visits: visits.rowCount ?? 0, bookings: bookings.rowCount ?? 0 };
}

async function otherOwners(tx: Tx, organizationId: string, membershipId: string): Promise<number> {
  const { rows } = await tx.execute(sql`
    SELECT count(*)::int AS n FROM orgs.memberships m
      JOIN orgs.membership_roles mr ON mr.membership_id = m.id JOIN orgs.roles r ON r.id = mr.role_id AND r.organization_id IS NULL AND r.code = 'owner'
     WHERE m.organization_id = ${organizationId} AND m.status = 'active' AND m.id <> ${membershipId}`);
  return Number((rows[0] as Row).n);
}

function assertManages(actor: Actor, member: Locked) {
  if (member.membershipId === actor.membershipId) throw new AppError("FORBIDDEN", "You can't change your own role or remove yourself. Ask an Owner.");
  if (!mayManage(actor, member)) throw new AppError("FORBIDDEN", "Only an Owner can change or remove a Manager or an Owner.");
}

// ── Inviting ─────────────────────────────────────────────────────────────────

export const memberInviteSchema = z
  .object({
    name: z.string().trim().min(1, "Enter their name").max(120),
    email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
    role: z.enum(ORG_ROLES, { message: "Choose a role" }),
    phone: z.preprocess(blank, phone.optional()),
    reraAgentNumber: z.preprocess(blank, z.string().trim().max(60, "Use 60 characters or fewer").optional()),
    teamId: z.preprocess(blank, z.uuid().optional()),
  })
  .superRefine((v, c) => {
    const agentRole = AGENT_ORG_ROLES.includes(v.role);
    if (agentRole && !v.phone) c.addIssue({ code: "custom", path: ["phone"], message: "Agents and supervisors need a phone number: customers who enquire see it" });
    if (!agentRole && v.teamId) c.addIssue({ code: "custom", path: ["teamId"], message: "Only agents and supervisors join teams" });
  });

const expireInvitations = (tx: Tx | typeof db) =>
  tx.execute(sql`UPDATE orgs.member_invitations SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at <= now()`);

export async function inviteMember(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const parsed = memberInviteSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  if (!rolesYouCanGive(actor).includes(input.role)) throw new AppError("FORBIDDEN", "Only an Owner can add Managers and Owners.");
  const org = actor.organization;

  const token = newInvitationToken();
  const referenceId = await db
    .transaction(async (tx) => {
      if (input.teamId) {
        const team = await tx.execute(sql`SELECT 1 FROM orgs.teams WHERE id = ${input.teamId} AND organization_id = ${org.id} AND deleted_at IS NULL`);
        if (!team.rows[0]) throw invalid("Choose one of your teams.", { teamId: "Choose one of your teams" });
      }
      const person = await tx.execute(sql`
        SELECT ad.id AS admin_id, ap.status AS agent_status, m.status AS membership_status
          FROM identity.users u
          LEFT JOIN orgs.admin_profiles ad ON ad.user_id = u.id
          LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
          LEFT JOIN orgs.memberships m ON m.user_id = u.id AND m.organization_id = ${org.id}
         WHERE u.email = ${input.email}`);
      const p = person.rows[0] as Row | undefined;
      if (p?.admin_id) throw conflict("That person is a Trustbrick administrator. Staff can't also join an organization.");
      if (p?.membership_status === "active") throw conflict(`That person is already in ${org.name}. Change their role from their page instead.`);
      if (AGENT_ORG_ROLES.includes(input.role) && p?.agent_status === "suspended") {
        throw conflict("Trustbrick has suspended that person's agent access, so they can't join as an agent or supervisor.");
      }

      await expireInvitations(tx);
      const created = await tx.execute(sql`
        INSERT INTO orgs.member_invitations (id, organization_id, email, name, role_code, phone, rera_agent_number, team_id, token_hash, invited_by, expires_at)
        VALUES (gen_random_uuid(), ${org.id}, ${input.email}, ${input.name}, ${input.role}, ${input.phone ?? null}, ${input.reraAgentNumber ?? null},
                ${input.teamId ?? null}, ${hashToken(token)}, ${actor.userId}, now() + ${`${INVITATION_TTL_HOURS} hours`}::interval)
        RETURNING id, reference_id`);
      const inv = created.rows[0] as Row;
      await audit(
        tx,
        actor,
        {
          event: "MEMBER_INVITED",
          target: { type: "invitation", id: String(inv.id), referenceId: String(inv.reference_id) },
          organizationId: org.id,
          metadata: { email: input.email, role: input.role, team: input.teamId ?? null },
        },
        ctx,
      );
      return String(inv.reference_id);
    })
    .catch((error) => {
      if (isUniqueViolation(error)) throw conflict(`That email already has a pending invitation to ${org.name}. Revoke it first to send a new one.`);
      throw error;
    });

  const url = link(`/invite/${token}`);
  void sendEmail(memberInvitationMessage(input.email, { inviterName: actor.name, organization: org.name, role: roleName(input.role), url, expiresHours: INVITATION_TTL_HOURS })).catch((e) =>
    log.error("email.member_invite_failed", { error: String(e) }),
  );
  return { referenceId };
}

export type MemberInvitationRow = {
  referenceId: string;
  name: string;
  email: string;
  role: OrgRole;
  roleName: string;
  team: string | null;
  status: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  canRevoke: boolean;
};

/** This organization's invitations from the last 30 days, pending first. */
export async function listMemberInvitations(actor: Actor): Promise<MemberInvitationRow[]> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  await expireInvitations(db);
  const giveable = rolesYouCanGive(actor);
  const { rows } = await db.execute(sql`
    SELECT i.reference_id, i.name, i.email, i.role_code, i.status, i.created_at, i.expires_at, t.name AS team, u.name AS invited_by
      FROM orgs.member_invitations i
      JOIN identity.users u ON u.id = i.invited_by
      LEFT JOIN orgs.teams t ON t.id = i.team_id AND t.deleted_at IS NULL
     WHERE i.organization_id = ${actor.organization.id} AND i.status IN ('pending', 'expired', 'revoked') AND i.created_at > now() - interval '30 days'
     ORDER BY (i.status = 'pending') DESC, i.created_at DESC LIMIT 100`);
  return (rows as Row[]).map((r) => {
    const role = r.role_code as OrgRole;
    return {
      referenceId: String(r.reference_id),
      name: String(r.name),
      email: String(r.email),
      role,
      roleName: roleName(role),
      team: (r.team as string) ?? null,
      status: String(r.status),
      invitedBy: String(r.invited_by),
      createdAt: iso(r.created_at)!,
      expiresAt: iso(r.expires_at)!,
      canRevoke: r.status === "pending" && giveable.includes(role),
    };
  });
}

export async function revokeMemberInvitation(actor: Actor, referenceId: string, ctx: RequestContext) {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor) || !isReferenceId(referenceId, "INV")) throw notFound();
  await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT id, email, role_code, status FROM orgs.member_invitations
       WHERE reference_id = ${referenceId} AND organization_id = ${actor.organization.id} FOR UPDATE`);
    const r = found.rows[0] as Row | undefined;
    if (!r) throw notFound();
    if (r.status !== "pending") throw conflict("Only pending invitations can be revoked.");
    if (!rolesYouCanGive(actor).includes(r.role_code as OrgRole)) throw new AppError("FORBIDDEN", "Only an Owner can revoke an invitation for a Manager or an Owner.");
    await tx.execute(sql`
      UPDATE orgs.member_invitations SET status = 'revoked', revoked_at = now(), revoked_by = ${actor.userId}, updated_at = now() WHERE id = ${String(r.id)}`);
    await audit(
      tx,
      actor,
      { event: "MEMBER_INVITATION_REVOKED", target: { type: "invitation", id: String(r.id), referenceId }, organizationId: actor.organization.id, metadata: { email: r.email } },
      ctx,
    );
  });
}

// ── Accepting ────────────────────────────────────────────────────────────────

export type MemberInvitationPreview = {
  email: string;
  name: string;
  invitedBy: string;
  expiresAt: string;
  accountExists: boolean;
  organization: string;
  role: string;
};

export async function previewMemberInvitation(token: string): Promise<MemberInvitationPreview | null> {
  if (!isTokenShape(token)) return null;
  const { rows } = await db.execute(sql`
    SELECT i.email, i.name, i.expires_at, i.role_code, u.name AS invited_by, o.name AS organization,
           EXISTS (SELECT 1 FROM identity.users x WHERE x.email = i.email) AS account_exists
      FROM orgs.member_invitations i
      JOIN identity.users u ON u.id = i.invited_by
      JOIN orgs.organizations o ON o.id = i.organization_id
     WHERE i.token_hash = ${hashToken(token)} AND i.status = 'pending' AND i.expires_at > now()`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    email: String(r.email),
    name: String(r.name),
    invitedBy: String(r.invited_by),
    expiresAt: iso(r.expires_at)!,
    accountExists: Boolean(r.account_exists),
    organization: String(r.organization),
    role: roleName(r.role_code as OrgRole),
  };
}

/**
 * Accepts an invitation to an organization in one transaction: the account (if new), the agent
 * profile (agents and supervisors), the membership in its role and the team all appear together,
 * or nothing changes. Someone who was removed earlier comes back with the new role.
 */
export async function acceptMemberInvitation(token: string, input: AcceptInput, ctx: RequestContext): Promise<{ email: string; createdAccount: boolean; membershipId: string }> {
  await guardAcceptance(token, input.ipKey);

  return db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT i.id, i.reference_id, i.email, i.name, i.role_code, i.phone, i.rera_agent_number, i.team_id, i.invited_by, i.status,
             i.expires_at > now() AS live, o.id AS organization_id, o.name AS organization, o.status AS org_status
        FROM orgs.member_invitations i JOIN orgs.organizations o ON o.id = i.organization_id
       WHERE i.token_hash = ${hashToken(token)} FOR UPDATE OF i`);
    const inv = found.rows[0] as Row | undefined;
    if (!inv || inv.status !== "pending" || !inv.live) throw notFound("This invitation has expired or was already used. Ask for a new one.");
    const organizationId = String(inv.organization_id);
    const organization = String(inv.organization);
    if (inv.org_status !== "active") throw conflict(`${organization} isn't active on Trustbrick at the moment, so you can't join it yet.`);
    const role = inv.role_code as OrgRole;
    const invitedBy = String(inv.invited_by);
    const email = String(inv.email);
    const account = await resolveInvitedAccount(tx, email, { ...input, name: input.name ?? inv.name });

    const staff = await tx.execute(sql`SELECT 1 FROM orgs.admin_profiles WHERE user_id = ${account.userId}`);
    if (staff.rows[0]) throw conflict("Administrators can't also join an organization.");
    const prior = await tx.execute(sql`SELECT status FROM orgs.memberships WHERE user_id = ${account.userId} AND organization_id = ${organizationId} FOR UPDATE`);
    if ((prior.rows[0] as Row | undefined)?.status === "active") throw conflict(`You're already in ${organization}.`);
    if (AGENT_ORG_ROLES.includes(role)) {
      await ensureAgentProfile(tx, account.userId, { phone: (inv.phone as string) ?? null, rera: (inv.rera_agent_number as string) ?? null }, invitedBy, organizationId);
    }

    const membershipId = await addToOrganization(tx, { userId: account.userId, organizationId, role, teamId: (inv.team_id as string) ?? null, addedBy: invitedBy });
    await tx.execute(sql`
      UPDATE orgs.member_invitations SET status = 'accepted', accepted_at = now(), accepted_user_id = ${account.userId}, updated_at = now()
       WHERE id = ${String(inv.id)}`);

    const person: PersonActor = { kind: "person", userId: account.userId, referenceId: account.referenceId, role: "member" };
    await audit(
      tx,
      person,
      {
        event: "MEMBER_JOINED",
        target: { type: "membership", id: membershipId, referenceId: account.referenceId },
        organizationId,
        after: { role },
        metadata: { invitation: inv.reference_id, invitedBy, createdAccount: account.createdAccount },
      },
      ctx,
    );
    const nameRow = await tx.execute(sql`SELECT name FROM identity.users WHERE id = ${account.userId}`);
    await notify(tx, [invitedBy], {
      type: "member_joined",
      title: `${String((nameRow.rows[0] as Row).name)} joined ${organization} as ${withArticle(role)}`,
      link: `/team/${account.referenceId}`,
    });
    return { email, createdAccount: account.createdAccount, membershipId };
  });
}

/** Makes someone an active member in one role (again, if they were removed), and puts agents and supervisors in the team given. */
async function addToOrganization(tx: Tx, input: { userId: string; organizationId: string; role: OrgRole; teamId: string | null; addedBy: string }): Promise<string> {
  const membership = await tx.execute(sql`
    INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by)
    VALUES (gen_random_uuid(), ${input.userId}, ${input.organizationId}, 'active', ${input.addedBy})
    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', status_reason = NULL, created_by = EXCLUDED.created_by, updated_at = now()
    RETURNING id`);
  const membershipId = String((membership.rows[0] as Row).id);
  await setOrgRole(tx, membershipId, input.role);
  if (input.teamId && AGENT_ORG_ROLES.includes(input.role)) {
    await tx.execute(sql`
      INSERT INTO orgs.team_members (team_id, membership_id, is_lead)
      SELECT id, ${membershipId}, ${input.role === "supervisor"} FROM orgs.teams
       WHERE id = ${input.teamId} AND organization_id = ${input.organizationId} AND deleted_at IS NULL
      ON CONFLICT DO NOTHING`);
  }
  return membershipId;
}

// ── Requests to join ─────────────────────────────────────────────────────────
//
// An agent can apply to join an organization by its ORG- reference. The request goes to that
// organization's Owners and Managers, not to Trustbrick: they know whether the person works there,
// and they vouch for them as they do for the people they invite.

export type JoinRequestRow = {
  agentReferenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  reraAgentNumber: string | null;
  experienceYears: number | null;
  bio: string | null;
  submittedAt: string;
};

const joinRequestsOf = (organizationId: string) =>
  sql`ap.status = 'pending' AND ap.application_type = 'join_organization' AND ap.requested_organization_id = ${organizationId}`;

/** Agents waiting to join this organization, oldest first. */
export async function listJoinRequests(actor: Actor): Promise<JoinRequestRow[]> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const { rows } = await db.execute(sql`
    SELECT ap.reference_id, u.reference_id AS user_reference_id, u.name, u.email, ap.phone, ap.rera_agent_number, ap.experience_years, ap.bio,
           coalesce(ap.status_changed_at, ap.created_at) AS submitted_at, city.name AS city
      FROM orgs.agent_profiles ap
      JOIN identity.users u ON u.id = ap.user_id
      LEFT JOIN geography.places city ON city.id = ap.city_place_id
     WHERE ${joinRequestsOf(actor.organization.id)}
     ORDER BY submitted_at`);
  return (rows as Row[]).map((r) => ({
    agentReferenceId: String(r.reference_id),
    userReferenceId: String(r.user_reference_id),
    name: String(r.name),
    email: String(r.email),
    phone: String(r.phone),
    city: (r.city as string) ?? null,
    reraAgentNumber: (r.rera_agent_number as string) ?? null,
    experienceYears: r.experience_years === null ? null : Number(r.experience_years),
    bio: (r.bio as string) ?? null,
    submittedAt: iso(r.submitted_at)!,
  }));
}

type LockedRequest = { profileId: string; userId: string; agentReferenceId: string; userReferenceId: string; name: string; email: string };

async function lockJoinRequest(tx: Tx, actor: Actor, agentReferenceId: string): Promise<LockedRequest> {
  if (!isReferenceId(agentReferenceId, "AGT")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ap.id, ap.user_id, ap.reference_id, u.reference_id AS user_reference_id, u.name, u.email
      FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id
     WHERE ap.reference_id = ${agentReferenceId} AND ${joinRequestsOf(actor.organization.id)}
       FOR UPDATE OF ap`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound("This request has already been decided, or was withdrawn.");
  return {
    profileId: String(r.id),
    userId: String(r.user_id),
    agentReferenceId: String(r.reference_id),
    userReferenceId: String(r.user_reference_id),
    name: String(r.name),
    email: String(r.email),
  };
}

export const joinApprovalSchema = z.object({
  role: z.enum(ORG_ROLES, { message: "Choose a role" }).catch("agent"),
  teamId: z.preprocess(blank, z.uuid().optional()),
});

/**
 * Accepts someone's request to join: their agent profile goes live (unverified: verification is
 * Trustbrick's), and they join in the role given. Earlier requests may still have a Trustbrick
 * review case open; it's closed with the decision.
 */
export async function approveJoinRequest(actor: Actor, agentReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ userReferenceId: string }> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const parsed = joinApprovalSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const { role, teamId } = parsed.data;
  if (!rolesYouCanGive(actor).includes(role)) throw new AppError("FORBIDDEN", "Only an Owner can make someone a Manager or an Owner.");
  const org = actor.organization;

  let request!: LockedRequest;
  await db.transaction(async (tx) => {
    request = await lockJoinRequest(tx, actor, agentReferenceId);
    if (teamId) {
      const team = await tx.execute(sql`SELECT 1 FROM orgs.teams WHERE id = ${teamId} AND organization_id = ${org.id} AND deleted_at IS NULL`);
      if (!team.rows[0]) throw invalid("Choose one of your teams.", { teamId: "Choose one of your teams" });
    }
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'active', verification_status = 'unverified', status_reason = NULL, status_changed_at = now(),
             approved_by = ${actor.userId}, approved_at = now(), updated_at = now()
       WHERE id = ${request.profileId}`);
    await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'approved', decided_by = ${actor.userId}, decided_at = now(), updated_at = now()
       WHERE agent_profile_id = ${request.profileId} AND status IN ('open', 'in_review')`);
    const membershipId = await addToOrganization(tx, { userId: request.userId, organizationId: org.id, role, teamId: teamId ?? null, addedBy: actor.userId });
    await audit(
      tx,
      actor,
      { event: "AGENT_APPROVED", target: { type: "agent", id: request.profileId, referenceId: request.agentReferenceId }, organizationId: org.id, before: { status: "pending" }, after: { status: "active" }, metadata: { joinRequest: true } },
      ctx,
    );
    await audit(
      tx,
      actor,
      { event: "MEMBER_JOINED", target: { type: "membership", id: membershipId, referenceId: request.userReferenceId }, organizationId: org.id, after: { role }, metadata: { joinRequest: request.agentReferenceId } },
      ctx,
    );
    await notify(tx, [request.userId], { type: "agent_decision", title: `You've joined ${org.name}`, body: `As ${withArticle(role)}.`, link: "/dashboard" });
  });

  void sendEmail(
    agentApprovedMessage(request.email, { name: request.name, organization: { name: org.name, referenceId: org.referenceId, isNew: false }, url: link("/dashboard") }),
  ).catch((e) => log.error("email.join_approved_failed", { error: String(e) }));
  return { userReferenceId: request.userReferenceId };
}

/** Turns down someone's request to join, with a reason they're told. They can apply again. */
export async function declineJoinRequest(actor: Actor, agentReferenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (reason.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters: they'll see it" });
  if (reason.length > 1000) throw invalid("Keep the reason under 1,000 characters.", { reason: "Keep it under 1,000 characters" });
  const org = actor.organization;

  let request!: LockedRequest;
  await db.transaction(async (tx) => {
    request = await lockJoinRequest(tx, actor, agentReferenceId);
    await tx.execute(sql`
      UPDATE orgs.agent_profiles SET status = 'rejected', verification_status = 'unverified', status_reason = ${reason}, status_changed_at = now(), updated_at = now()
       WHERE id = ${request.profileId}`);
    await tx.execute(sql`
      UPDATE trust.review_cases SET status = 'rejected', decided_by = ${actor.userId}, decided_at = now(), decision_reason = ${reason}, updated_at = now()
       WHERE agent_profile_id = ${request.profileId} AND status IN ('open', 'in_review')`);
    await audit(
      tx,
      actor,
      { event: "AGENT_REJECTED", target: { type: "agent", id: request.profileId, referenceId: request.agentReferenceId }, organizationId: org.id, before: { status: "pending" }, after: { status: "rejected" }, metadata: { reason, joinRequest: true } },
      ctx,
    );
    await notify(tx, [request.userId], { type: "agent_decision", title: `${org.name} didn't accept your request to join`, body: reason, link: "/become-an-agent" });
  });

  void sendEmail(joinRequestDeclinedMessage(request.email, { name: request.name, organization: org.name, reason, url: link("/become-an-agent") })).catch((e) =>
    log.error("email.join_declined_failed", { error: String(e) }),
  );
}

// ── Changing and removing ────────────────────────────────────────────────────

export const roleChangeSchema = z.object({
  role: z.enum(ORG_ROLES, { message: "Choose a role" }),
  phone: z.preprocess(blank, phone.optional()),
  handoverTo: z.preprocess(blank, z.string().optional()),
});

/**
 * Changes a member's role. Becoming an agent or supervisor needs an agent profile (created with
 * the phone number given, if they have none); becoming an Operator, who has no leads, hands their
 * work to someone else first.
 */
export async function changeMemberRole(actor: Actor, userReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ changed: boolean }> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const parsed = roleChangeSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const { role, phone: phoneNumber, handoverTo } = parsed.data;
  if (!rolesYouCanGive(actor).includes(role)) throw new AppError("FORBIDDEN", "Only an Owner can make someone a Manager or an Owner.");

  let member!: Locked;
  const changed = await db.transaction(async (tx) => {
    member = await lockMember(tx, actor, userReferenceId);
    assertManages(actor, member);
    if (member.role === role) return false;
    if (member.role === "owner" && (await otherOwners(tx, actor.organization.id, member.membershipId)) === 0) {
      throw conflict("An organization needs at least one Owner.");
    }
    if (AGENT_ORG_ROLES.includes(role)) await ensureAgentProfile(tx, member.userId, { phone: phoneNumber }, actor.userId, actor.organization.id);
    let handedTo: Locked | null = null;
    if (!LEAD_HOLDING_ROLES.includes(role) && hasWork(await workOf(tx, actor.organization.id, member))) {
      handedTo = await recipientFor(tx, actor, member, handoverTo);
      await handOver(tx, actor, member, handedTo);
    }
    await setOrgRole(tx, member.membershipId, role);
    await audit(
      tx,
      actor,
      {
        event: "MEMBER_ROLE_CHANGED",
        target: { type: "membership", id: member.membershipId, referenceId: member.userReferenceId },
        organizationId: actor.organization.id,
        before: { role: member.role },
        after: { role },
        metadata: handedTo ? { handedTo: handedTo.userReferenceId } : undefined,
      },
      ctx,
    );
    await notify(tx, [member.userId], {
      type: "membership_changed",
      title: `You're now ${withArticle(role)} at ${actor.organization.name}`,
      link: "/dashboard",
    });
    return true;
  });

  if (changed) {
    void sendEmail(
      membershipChangedMessage(member.email, { kind: "role", name: member.name, organization: actor.organization.name, changedBy: actor.name, role: roleName(role), url: link("/dashboard") }),
    ).catch((e) => log.error("email.member_role_failed", { error: String(e) }));
  }
  return { changed };
}

export const removeMemberSchema = z.object({
  handoverTo: z.preprocess(blank, z.string().optional()),
  reason: z.preprocess(blank, z.string().trim().max(500, "Keep it under 500 characters").optional()),
});

/**
 * Removes someone from the organization. Their listings, leads, upcoming visits and stays go to
 * the member chosen; their membership ends (it can be restored by inviting them again). Their own
 * account and agent profile are untouched: they may work elsewhere.
 */
export async function removeMember(actor: Actor, userReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ handedOver: Work | null }> {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const parsed = removeMemberSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));

  let member!: Locked;
  let handedTo: Locked | null = null;
  const handedOver = await db.transaction(async (tx) => {
    member = await lockMember(tx, actor, userReferenceId);
    assertManages(actor, member);
    if (member.role === "owner" && (await otherOwners(tx, actor.organization.id, member.membershipId)) === 0) {
      throw conflict("An organization needs at least one Owner.");
    }
    const work = await workOf(tx, actor.organization.id, member);
    const moved = parsed.data.handoverTo || hasWork(work) ? await recipientFor(tx, actor, member, parsed.data.handoverTo) : null;
    handedTo = moved;
    const counts = moved ? await handOver(tx, actor, member, moved) : null;

    await tx.execute(sql`
      UPDATE orgs.memberships SET status = 'removed', status_reason = ${parsed.data.reason ?? null}, updated_at = now() WHERE id = ${member.membershipId}`);
    await tx.execute(sql`DELETE FROM orgs.team_members WHERE membership_id = ${member.membershipId}`);
    await audit(
      tx,
      actor,
      {
        event: "MEMBER_REMOVED",
        target: { type: "membership", id: member.membershipId, referenceId: member.userReferenceId },
        organizationId: actor.organization.id,
        before: { role: member.role, status: "active" },
        after: { status: "removed" },
        metadata: { reason: parsed.data.reason ?? null, handedTo: moved?.userReferenceId ?? null, handedOver: counts },
      },
      ctx,
    );
    await notify(tx, [member.userId], { type: "membership_changed", title: `You've been removed from ${actor.organization.name}` });
    if (moved && counts && hasWork(counts)) {
      await notify(tx, [moved.userId], {
        type: "membership_changed",
        title: `${member.name}'s work at ${actor.organization.name} is now yours`,
        body: `${counts.listings} listing(s), ${counts.leads} open lead(s), ${counts.visits} visit(s) and ${counts.bookings} booking(s).`,
        link: "/dashboard",
      });
    }
    return counts;
  });

  void sendEmail(
    membershipChangedMessage(member.email, {
      kind: "removed",
      name: member.name,
      organization: actor.organization.name,
      changedBy: actor.name,
      handedTo: (handedTo as Locked | null)?.name ?? null,
    }),
  ).catch((e) => log.error("email.member_removed_failed", { error: String(e) }));
  return { handedOver };
}

// ── Teams ────────────────────────────────────────────────────────────────────

export type TeamRow = {
  id: string;
  name: string;
  members: { userReferenceId: string; name: string; role: OrgRole | null; roleName: string; isLead: boolean }[];
  listings: number;
  openLeads: number;
};

/** Every team (Owners and Managers), or the teams a Supervisor is in. */
export async function listTeams(actor: Actor): Promise<TeamRow[]> {
  const scope = assertCan(actor, "members.view", "team");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
  const mine = scope === "team" ? sql`AND EXISTS (SELECT 1 FROM orgs.team_members me WHERE me.team_id = t.id AND me.membership_id = ${actor.membershipId})` : sql``;
  const { rows } = await db.execute(sql`
    SELECT t.id, t.name,
           coalesce((SELECT json_agg(json_build_object('ref', u.reference_id, 'name', u.name, 'role', ${roleColumn}, 'lead', tm.is_lead) ORDER BY tm.is_lead DESC, u.name)
                       FROM orgs.team_members tm JOIN orgs.memberships m ON m.id = tm.membership_id AND m.status = 'active'
                       JOIN identity.users u ON u.id = m.user_id
                      WHERE tm.team_id = t.id), '[]'::json) AS members,
           (SELECT count(*) FROM marketplace.listing_agents la JOIN orgs.team_members tm ON tm.membership_id = la.membership_id AND tm.team_id = t.id
             WHERE la.ended_at IS NULL)::int AS listings,
           (SELECT count(*) FROM crm.leads ld JOIN orgs.team_members tm ON tm.membership_id = ld.agent_membership_id AND tm.team_id = t.id
             WHERE ld.deleted_at IS NULL AND ld.status NOT IN ('converted', 'lost'))::int AS open_leads
      FROM orgs.teams t
     WHERE t.organization_id = ${actor.organization.id} AND t.deleted_at IS NULL ${mine}
     ORDER BY t.name`);
  return (rows as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    members: (r.members as { ref: string; name: string; role: string | null; lead: boolean }[]).map((m) => {
      const role = isOrgRole(m.role) ? m.role : null;
      return { userReferenceId: m.ref, name: m.name, role, roleName: roleName(role), isLead: m.lead };
    }),
    listings: Number(r.listings),
    openLeads: Number(r.open_leads),
  }));
}

const teamName = z.string().trim().min(2, "Use at least 2 characters").max(60, "Use 60 characters or fewer");

function assertManagesTeams(actor: Actor) {
  assertCan(actor, "members.manage", "org");
  if (!inOrganization(actor)) throw new AppError("FORBIDDEN");
}

const teamTarget = (id: string) => ({ type: "team", id });
const duplicateName = (error: unknown) => {
  if (isUniqueViolation(error)) throw invalid("There's already a team with that name.", { name: "There's already a team with that name" });
  throw error;
};

export async function createTeam(actor: Actor, rawName: unknown, ctx: RequestContext): Promise<{ id: string }> {
  assertManagesTeams(actor);
  const name = teamName.safeParse(rawName);
  if (!name.success) throw invalid("Please check the team's name.", { name: name.error.issues[0]?.message ?? "Enter a name" });
  return db
    .transaction(async (tx) => {
      const { rows } = await tx.execute(sql`INSERT INTO orgs.teams (id, organization_id, name) VALUES (gen_random_uuid(), ${actor.organization.id}, ${name.data}) RETURNING id`);
      const id = String((rows[0] as Row).id);
      await audit(tx, actor, { event: "TEAM_CREATED", target: teamTarget(id), organizationId: actor.organization.id, after: { name: name.data } }, ctx);
      return { id };
    })
    .catch(duplicateName);
}

async function lockTeam(tx: Tx, actor: Actor, teamId: string): Promise<{ id: string; name: string }> {
  if (!z.uuid().safeParse(teamId).success) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT id, name FROM orgs.teams WHERE id = ${teamId} AND organization_id = ${actor.organization.id} AND deleted_at IS NULL FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { id: String(r.id), name: String(r.name) };
}

export async function renameTeam(actor: Actor, teamId: string, rawName: unknown, ctx: RequestContext) {
  assertManagesTeams(actor);
  const name = teamName.safeParse(rawName);
  if (!name.success) throw invalid("Please check the team's name.", { name: name.error.issues[0]?.message ?? "Enter a name" });
  await db
    .transaction(async (tx) => {
      const team = await lockTeam(tx, actor, teamId);
      if (team.name === name.data) return;
      await tx.execute(sql`UPDATE orgs.teams SET name = ${name.data}, updated_at = now() WHERE id = ${team.id}`);
      await audit(tx, actor, { event: "TEAM_UPDATED", target: teamTarget(team.id), organizationId: actor.organization.id, before: { name: team.name }, after: { name: name.data } }, ctx);
    })
    .catch(duplicateName);
}

/** Deletes a team. Its people stay in the organization; their work stays theirs. The audit log keeps its name. */
export async function deleteTeam(actor: Actor, teamId: string, ctx: RequestContext) {
  assertManagesTeams(actor);
  await db.transaction(async (tx) => {
    const team = await lockTeam(tx, actor, teamId);
    await tx.execute(sql`DELETE FROM orgs.teams WHERE id = ${team.id}`);
    await audit(tx, actor, { event: "TEAM_DELETED", target: teamTarget(team.id), organizationId: actor.organization.id, before: { name: team.name } }, ctx);
  });
}

/** Adds an agent or supervisor to a team, or takes them out. A supervisor leads the teams they're in. */
export async function setTeamMember(actor: Actor, teamId: string, userReferenceId: string, inTeam: boolean, ctx: RequestContext) {
  assertManagesTeams(actor);
  await db.transaction(async (tx) => {
    const team = await lockTeam(tx, actor, teamId);
    const member = await lockMember(tx, actor, normalizeReferenceId(userReferenceId));
    if (inTeam) {
      if (!member.role || !AGENT_ORG_ROLES.includes(member.role)) throw invalid("Only agents and supervisors join teams.", { member: "Only agents and supervisors join teams" });
      const added = await tx.execute(sql`
        INSERT INTO orgs.team_members (team_id, membership_id, is_lead) VALUES (${team.id}, ${member.membershipId}, ${member.role === "supervisor"})
        ON CONFLICT DO NOTHING`);
      if (!added.rowCount) return;
    } else {
      const removed = await tx.execute(sql`DELETE FROM orgs.team_members WHERE team_id = ${team.id} AND membership_id = ${member.membershipId}`);
      if (!removed.rowCount) return;
    }
    await audit(
      tx,
      actor,
      { event: "TEAM_MEMBERS_CHANGED", target: teamTarget(team.id), organizationId: actor.organization.id, metadata: { member: member.userReferenceId, [inTeam ? "added" : "removed"]: true } },
      ctx,
    );
    await notify(tx, [member.userId], {
      type: "membership_changed",
      title: inTeam ? `You're now in the ${team.name} team` : `You're no longer in the ${team.name} team`,
      link: "/dashboard",
    });
  });
}

// ── Leads ────────────────────────────────────────────────────────────────────

/** Gives a lead to someone else: within their team for a Supervisor, anyone who works leads for Owners and Managers. */
export async function assignLead(actor: Actor, leadReferenceId: string, rawUserReferenceId: unknown, ctx: RequestContext) {
  assertCan(actor, "leads.assign", "team");
  if (!inOrganization(actor) || !isReferenceId(leadReferenceId, "LEAD")) throw notFound();
  const ref = typeof rawUserReferenceId === "string" ? normalizeReferenceId(rawUserReferenceId) : "";
  const assignee = (await leadAssignees(actor)).find((a) => a.userReferenceId === ref);
  if (!assignee) throw invalid("Choose who takes this lead.", { agent: "Choose someone who works leads in your team or organization" });

  await db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT ld.id, ld.agent_user_id FROM crm.leads ld
       WHERE ld.reference_id = ${leadReferenceId} AND ld.deleted_at IS NULL AND ${leadScope(actor, "leads.assign")} FOR UPDATE`);
    const lead = found.rows[0] as Row | undefined;
    if (!lead) throw notFound();
    const target = await lockMember(tx, actor, assignee.userReferenceId);
    if (lead.agent_user_id === target.userId) return;
    await tx.execute(sql`
      UPDATE crm.leads SET agent_user_id = ${target.userId}, agent_membership_id = ${target.membershipId}, updated_at = now(), last_activity_at = now()
       WHERE id = ${String(lead.id)}`);
    await tx.execute(sql`
      INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
      VALUES (gen_random_uuid(), ${String(lead.id)}, 'assigned', ${`Assigned to ${target.name}`}, ${actor.userId})`);
    await audit(
      tx,
      actor,
      {
        event: "LEAD_ASSIGNED",
        target: { type: "lead", id: String(lead.id), referenceId: leadReferenceId },
        organizationId: actor.organization.id,
        before: { agentUserId: (lead.agent_user_id as string) ?? null },
        after: { agentUserId: target.userId },
      },
      ctx,
    );
    if (target.userId !== actor.userId) {
      await notify(tx, [target.userId], { type: "lead_assigned", title: `Lead ${leadReferenceId} is now yours`, body: `${actor.name} gave it to you.`, link: `/leads/${leadReferenceId}` });
    }
  });
}

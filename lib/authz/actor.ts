import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AGENT_ROLE_CODES, HOST_ROLE_CODES, type Permission, type RoleCode, type Scope, isPermission, scopeRank } from "./catalog";

/**
 * Who is acting, inside which organization, with which permissions at which scope.
 * Built only on the server, from the database, for every request. Nothing here is
 * ever taken from the client: the workspace cookie is a hint that must match a live
 * membership of the logged-in user, or it is ignored.
 */
export type Workspace = {
  membershipId: string;
  organization: { id: string; name: string; referenceId: string; orgType: string };
  kind: "platform" | "professional";
  roles: RoleCode[];
};

export type Actor = {
  userId: string;
  userReferenceId: string;
  name: string;
  email: string;
  membershipId: string;
  organization: Workspace["organization"];
  workspace: Workspace["kind"];
  roles: RoleCode[];
  /** Set for platform staff. */
  staff: { level: "admin" | "superadmin"; referenceId: string } | null;
  /** Set for people with an active agent profile. */
  agent: { profileId: string; referenceId: string } | null;
  /** Set for people with an active host profile. */
  host: { profileId: string; referenceId: string } | null;
  permissions: Partial<Record<Permission, Scope>>;
  /** Memberships that share a team with this actor (including their own), for `team` scope. */
  teamMembershipIds: string[];
};

type Row = Record<string, unknown>;

const agentRoles = sql.raw(AGENT_ROLE_CODES.map((c) => `'${c}'`).join(", "));
const hostRoles = sql.raw(HOST_ROLE_CODES.map((c) => `'${c}'`).join(", "));

/**
 * Roles that are actually in force: active membership in an active organization, platform
 * roles only in the internal organization, professional roles only outside it, and agent
 * roles only while the agent profile is active.
 */
const EFFECTIVE_ROLES = sql`
  SELECT m.id AS membership_id, m.organization_id, o.name AS org_name, o.reference_id AS org_reference_id,
         o.org_type, r.id AS role_id, r.code AS role_code, r.workspace
    FROM orgs.memberships m
    JOIN identity.users u ON u.id = m.user_id AND u.status = 'active'
    JOIN orgs.organizations o ON o.id = m.organization_id AND o.status = 'active' AND o.deleted_at IS NULL
    JOIN orgs.membership_roles mr ON mr.membership_id = m.id
    JOIN orgs.roles r ON r.id = mr.role_id
    LEFT JOIN orgs.agent_profiles ap ON ap.user_id = m.user_id
    LEFT JOIN stays.host_profiles hp ON hp.user_id = m.user_id
   WHERE m.status = 'active'
     AND ((r.workspace = 'platform') = (o.org_type = 'internal'))
     AND (r.code NOT IN (${agentRoles}) OR ap.status = 'active')
     AND (r.code NOT IN (${hostRoles}) OR hp.status = 'active')`;

export async function loadWorkspaces(userId: string): Promise<Workspace[]> {
  const { rows } = await db.execute(sql`
    SELECT * FROM (${EFFECTIVE_ROLES}) er WHERE er.membership_id IN (SELECT id FROM orgs.memberships WHERE user_id = ${userId})
    ORDER BY (er.workspace = 'platform') DESC, er.org_name`);
  const byMembership = new Map<string, Workspace>();
  for (const r of rows as Row[]) {
    const id = String(r.membership_id);
    const existing = byMembership.get(id);
    if (existing) {
      existing.roles.push(r.role_code as RoleCode);
      continue;
    }
    byMembership.set(id, {
      membershipId: id,
      organization: {
        id: String(r.organization_id),
        name: String(r.org_name),
        referenceId: String(r.org_reference_id),
        orgType: String(r.org_type),
      },
      kind: r.workspace === "platform" ? "platform" : "professional",
      roles: [r.role_code as RoleCode],
    });
  }
  return [...byMembership.values()];
}

/** The actor for one of the user's workspaces, or null when that membership is not in force. */
export async function loadActor(userId: string, membershipId: string): Promise<Actor | null> {
  const workspaces = await loadWorkspaces(userId);
  const workspace = workspaces.find((w) => w.membershipId === membershipId);
  if (!workspace) return null;

  const internal = workspace.organization.orgType === "internal";

  const [userResult, grantResult, staffResult, agentResult, teamResult, hostResult] = await Promise.all([
    db.execute(sql`SELECT name, email, reference_id FROM identity.users WHERE id = ${userId} AND status = 'active'`),
    db.execute(sql`
      SELECT g.permission_code, g.scope, p.is_platform
        FROM (
          SELECT rp.permission_code, rp.scope
            FROM (${EFFECTIVE_ROLES}) er
            JOIN orgs.role_permissions rp ON rp.role_id = er.role_id
           WHERE er.membership_id = ${membershipId}
          UNION ALL
          SELECT mp.permission_code, mp.scope FROM orgs.membership_permissions mp WHERE mp.membership_id = ${membershipId}
        ) g
        JOIN orgs.permissions p ON p.code = g.permission_code`),
    db.execute(sql`SELECT level, reference_id FROM orgs.admin_profiles WHERE membership_id = ${membershipId}`),
    db.execute(sql`SELECT id, reference_id FROM orgs.agent_profiles WHERE user_id = ${userId} AND status = 'active'`),
    db.execute(sql`
      SELECT DISTINCT peer.membership_id
        FROM orgs.team_members mine
        JOIN orgs.teams t ON t.id = mine.team_id AND t.deleted_at IS NULL
        JOIN orgs.team_members peer ON peer.team_id = mine.team_id
       WHERE mine.membership_id = ${membershipId}`),
    db.execute(sql`SELECT id, reference_id FROM stays.host_profiles WHERE user_id = ${userId} AND status = 'active'`),
  ]);

  const user = userResult.rows[0] as Row | undefined;
  if (!user) return null;

  const permissions: Partial<Record<Permission, Scope>> = {};
  for (const g of grantResult.rows as Row[]) {
    const code = g.permission_code;
    const scope = g.scope as Scope;
    if (!isPermission(code)) continue;
    // Platform permissions and platform scope mean something only inside the internal organization.
    if (!internal && (g.is_platform === true || scope === "platform")) continue;
    const current = permissions[code];
    if (!current || scopeRank(scope) > scopeRank(current)) permissions[code] = scope;
  }

  const staffRow = staffResult.rows[0] as Row | undefined;
  const agentRow = agentResult.rows[0] as Row | undefined;
  const hostRow = hostResult.rows[0] as Row | undefined;
  const teamIds = (teamResult.rows as Row[]).map((r) => String(r.membership_id));

  return {
    userId,
    userReferenceId: String(user.reference_id),
    name: String(user.name),
    email: String(user.email),
    membershipId,
    organization: workspace.organization,
    workspace: workspace.kind,
    roles: workspace.roles,
    staff: internal && staffRow ? { level: staffRow.level as "admin" | "superadmin", referenceId: String(staffRow.reference_id) } : null,
    agent: agentRow ? { profileId: String(agentRow.id), referenceId: String(agentRow.reference_id) } : null,
    host: hostRow ? { profileId: String(hostRow.id), referenceId: String(hostRow.reference_id) } : null,
    permissions,
    teamMembershipIds: teamIds.includes(membershipId) ? teamIds : [...teamIds, membershipId],
  };
}

/** For audit rows: the most senior role the actor acted in. */
export function actorRoleLabel(actor: Actor | null): string {
  if (!actor) return "system";
  if (actor.staff) return actor.staff.level;
  return actor.roles[0] ?? "member";
}

export function actorReference(actor: Actor): string {
  return actor.staff?.referenceId ?? actor.agent?.referenceId ?? actor.host?.referenceId ?? actor.userReferenceId;
}

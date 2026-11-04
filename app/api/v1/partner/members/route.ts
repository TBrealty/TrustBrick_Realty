import { apiRoute, rawParams, readJson } from "@/lib/api/http";
import { z } from "zod";
import { AGENT_ORG_ROLES, ORG_ROLES, ROLES } from "@/lib/authz/catalog";
import { canManageMembers, inviteMember, listJoinRequests, listMemberInvitations, listMembers, listTeams, memberFilters, rolesYouCanGive } from "@/lib/services/members";

/**
 * The Team screen: the organization's people (a Supervisor's team), its teams, and, for Owners
 * and Managers, the invitations and the roles they may give. `?q=`, `?role=`, `?team=`.
 */
export const GET = apiRoute("v1.partner.members", { auth: "user" }, async ({ actor, url }) => {
  const a = await actor();
  const manages = canManageMembers(a);
  const [members, teams, invitations, requests] = await Promise.all([
    listMembers(a, memberFilters.parse(rawParams(url))),
    listTeams(a),
    manages ? listMemberInvitations(a) : Promise.resolve([]),
    manages ? listJoinRequests(a) : Promise.resolve([]),
  ]);
  return {
    organization: a.organization.name,
    members,
    teams,
    invitations,
    /** Agents asking to join with the organization's reference: its Owners and Managers decide. */
    requests,
    manage: manages ? { roles: rolesYouCanGive(a) } : null,
    roles: ORG_ROLES.map((r) => ({ code: r, name: ROLES[r].name, description: ROLES[r].description, agent: AGENT_ORG_ROLES.includes(r) })),
  };
});

/** Adds someone: `{ name, email, role, phone?, reraAgentNumber?, teamId? }`. They're emailed a link to accept. */
export const POST = apiRoute("v1.partner.member_invite", { auth: "user" }, async ({ actor, request, requestContext }) =>
  inviteMember(await actor(), await readJson(request, z.record(z.string(), z.unknown())), requestContext),
);

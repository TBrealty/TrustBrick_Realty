import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import { loadActor } from "@/lib/authz/actor";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { applyAsAgent } from "@/lib/services/agents";
import { canAcceptTerms } from "@/lib/services/commission";
import { createEnquiry, getLead, listLeads } from "@/lib/services/crm";
import { professionalDashboard } from "@/lib/services/dashboard";
import { createDraft } from "@/lib/services/listings/onboarding";
import { getListingForActor } from "@/lib/services/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import {
  acceptMemberInvitation,
  approveJoinRequest,
  assignLead,
  assignListingAgent,
  changeMemberRole,
  createTeam,
  declineJoinRequest,
  getMember,
  inviteMember,
  listJoinRequests,
  listMemberInvitations,
  listMembers,
  listTeams,
  previewMemberInvitation,
  removeMember,
  revokeMemberInvitation,
  setTeamMember,
} from "@/lib/services/members";
import { canManagePartnerSubscription } from "@/lib/services/subscriptions";
import { resolveRange } from "@/lib/range";
import { actorFor, ctx, locality, makeAdmin, makeAgent, makeOrg, makeSession, makeUser, one, person } from "./support/factory";
import { readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const tag = () => uuidv7().slice(-8);
const ip = () => `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Invitations email a token; the test swaps the stored hash for one it knows. */
async function invite(actor: Actor, input: Record<string, unknown>) {
  const { referenceId } = await inviteMember(actor, input, ctx);
  const token = `${"m".repeat(20)}${uuidv7().replace(/-/g, "").slice(0, 23)}`;
  await db.execute(sql`UPDATE orgs.member_invitations SET token_hash = ${createHash("sha256").update(token).digest("hex")} WHERE reference_id = ${referenceId}`);
  return { referenceId, token };
}

/** Invites someone new and accepts as them; returns their actor in the organization. */
async function join(by: Actor, role: string, extra: Record<string, unknown> = {}) {
  const email = `member.${tag()}@example.test`;
  const { token } = await invite(by, { name: `New ${role}`, email, role, phone: role === "agent" || role === "supervisor" ? "98765 43210" : "", ...extra });
  const { membershipId } = await acceptMemberInvitation(token, { sessionUserId: null, name: `New ${role}`, password: "a-long-test-password", ipKey: ip() }, ctx);
  const user = await one<{ id: string; reference_id: string }>(sql`SELECT id, reference_id FROM identity.users WHERE email = ${email}`);
  return { email, userId: user.id, userReferenceId: user.reference_id, actor: () => actorFor(user.id, membershipId) };
}

let owner: Actor;
let orgId: string;

beforeAll(async () => {
  const org = await makeOrg(`Members Realty ${tag()}`);
  orgId = org.id;
  owner = await (await makeAgent(org.id, "Members Owner", "owner")).actor();
});

describe("roles", () => {
  it("gives each role its powers", async () => {
    const manager = await (await join(owner, "manager")).actor();
    const operator = await (await join(owner, "operator")).actor();
    expect(can(owner, "members.manage", "org") && can(manager, "members.manage", "org")).toBe(true);
    expect(canManagePartnerSubscription(owner) && canAcceptTerms(owner)).toBe(true);
    // Managers run the work, not the money.
    expect(canManagePartnerSubscription(manager) || canAcceptTerms(manager)).toBe(false);
    expect(can(manager, "leads.view", "org")).toBe(true);
    // Operators prepare listings for everyone, and never see leads or clients.
    expect(can(operator, "listings.create", "org") && can(operator, "listings.submit", "org")).toBe(true);
    expect(can(operator, "leads.view") || can(operator, "contacts.view") || can(operator, "members.view")).toBe(false);
    const dashboard = await professionalDashboard(operator, resolveRange({}));
    expect(dashboard.leads.open).toBe(0);
  });

  it("never gives organization permissions to platform staff", async () => {
    const admin = await (await makeAdmin()).actor();
    expect(can(admin, "members.view") || can(admin, "billing.manage")).toBe(false);
  });
});

describe("adding people", () => {
  it("creates the account, agent profile and membership when an agent accepts", async () => {
    const email = `agent.${tag()}@example.test`;
    const { token } = await invite(owner, { name: "Invited Agent", email, role: "agent", phone: "98765 43210", reraAgentNumber: "RERA-M-1" });
    const preview = await previewMemberInvitation(token);
    expect(preview).toMatchObject({ email, role: "Agent", accountExists: false });
    await acceptMemberInvitation(token, { sessionUserId: null, name: "Invited Agent", password: "a-long-test-password", ipKey: ip() }, ctx);
    const user = await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = ${email} AND email_verified`);
    const profile = await one<{ status: string; phone: string }>(sql`SELECT status, phone FROM orgs.agent_profiles WHERE user_id = ${user.id}`);
    expect(profile).toEqual({ status: "active", phone: "9876543210" });
    const agent = await actorFor(user.id);
    expect(agent.organization.id).toBe(orgId);
    expect(agent.roles).toEqual(["agent"]);
    // The link works once.
    expect(await previewMemberInvitation(token)).toBeNull();
  });

  it("an existing account must be signed in as the invited email", async () => {
    const existing = await makeUser("Existing Person");
    const { token } = await invite(owner, { name: "Existing Person", email: existing.email, role: "operator" });
    expect(await code(acceptMemberInvitation(token, { sessionUserId: null, ipKey: ip() }, ctx))).toBe("UNAUTHORIZED");
    await makeSession(existing.id);
    await acceptMemberInvitation(token, { sessionUserId: existing.id, ipKey: ip() }, ctx);
    expect((await actorFor(existing.id)).roles).toEqual(["operator"]);
  });

  it("asks agents and supervisors for a phone number", async () => {
    expect(await code(inviteMember(owner, { name: "No Phone", email: `p.${tag()}@example.test`, role: "supervisor" }, ctx))).toBe("VALIDATION_ERROR");
  });

  it("lets only Owners add Managers and Owners", async () => {
    const manager = await (await join(owner, "manager")).actor();
    expect(await code(inviteMember(manager, { name: "Another Owner", email: `o.${tag()}@example.test`, role: "owner" }, ctx))).toBe("FORBIDDEN");
    expect(await code(inviteMember(manager, { name: "Another Manager", email: `m.${tag()}@example.test`, role: "manager" }, ctx))).toBe("FORBIDDEN");
    expect(await code(inviteMember(manager, { name: "An Agent", email: `a.${tag()}@example.test`, role: "agent", phone: "9876543210" }, ctx))).toBe("OK");
    const agent = await (await join(owner, "agent")).actor();
    expect(await code(inviteMember(agent, { name: "Nope", email: `n.${tag()}@example.test`, role: "operator" }, ctx))).toBe("FORBIDDEN");
  });

  it("refuses a second pending invitation and someone already in the organization", async () => {
    const email = `dup.${tag()}@example.test`;
    await inviteMember(owner, { name: "Dup", email, role: "operator" }, ctx);
    expect(await code(inviteMember(owner, { name: "Dup", email, role: "operator" }, ctx))).toBe("CONFLICT");
    const member = await join(owner, "operator");
    expect(await code(inviteMember(owner, { name: "Again", email: member.email, role: "agent", phone: "9876543210" }, ctx))).toBe("CONFLICT");
  });

  it("revoked invitations stop working", async () => {
    const { referenceId, token } = await invite(owner, { name: "Revoked", email: `r.${tag()}@example.test`, role: "operator" });
    expect((await listMemberInvitations(owner)).some((i) => i.referenceId === referenceId && i.canRevoke)).toBe(true);
    await revokeMemberInvitation(owner, referenceId, ctx);
    expect(await code(acceptMemberInvitation(token, { sessionUserId: null, name: "Revoked", password: "a-long-test-password", ipKey: ip() }, ctx))).toBe("NOT_FOUND");
  });
});

describe("changing roles", () => {
  it("follows the hierarchy, and nobody changes their own role", async () => {
    const manager = await join(owner, "manager");
    const otherManager = await join(owner, "manager");
    const agent = await join(owner, "agent");
    const managerActor = await manager.actor();
    expect(await code(changeMemberRole(managerActor, otherManager.userReferenceId, { role: "agent", phone: "9876543210" }, ctx))).toBe("FORBIDDEN");
    expect(await code(changeMemberRole(managerActor, agent.userReferenceId, { role: "manager" }, ctx))).toBe("FORBIDDEN");
    expect(await code(changeMemberRole(managerActor, manager.userReferenceId, { role: "agent" }, ctx))).toBe("FORBIDDEN");
    expect(await code(changeMemberRole(owner, owner.userReferenceId, { role: "manager" }, ctx))).toBe("FORBIDDEN");
    await changeMemberRole(managerActor, agent.userReferenceId, { role: "supervisor" }, ctx);
    expect((await agent.actor()).roles).toEqual(["supervisor"]);
    await changeMemberRole(owner, otherManager.userReferenceId, { role: "owner" }, ctx);
    expect(canManagePartnerSubscription(await otherManager.actor())).toBe(true);
  });

  it("needs a phone number to make an operator an agent", async () => {
    const operator = await join(owner, "operator");
    expect(await code(changeMemberRole(owner, operator.userReferenceId, { role: "agent" }, ctx))).toBe("VALIDATION_ERROR");
    await changeMemberRole(owner, operator.userReferenceId, { role: "agent", phone: "9876543210" }, ctx);
    expect((await operator.actor()).agent).not.toBeNull();
  });
});

describe("teams and supervisors", () => {
  it("a supervisor sees and assigns within their team only", async () => {
    const supervisor = await join(owner, "supervisor");
    const inTeam = await join(owner, "agent");
    const outside = await join(owner, "agent");
    const { id: teamId } = await createTeam(owner, `North ${tag()}`, ctx);
    await setTeamMember(owner, teamId, supervisor.userReferenceId, true, ctx);
    await setTeamMember(owner, teamId, inTeam.userReferenceId, true, ctx);
    const operator = await join(owner, "operator");
    expect(await code(setTeamMember(owner, teamId, operator.userReferenceId, true, ctx))).toBe("VALIDATION_ERROR");

    const sup = await supervisor.actor();
    const team = (await listTeams(sup)).find((t) => t.id === teamId)!;
    expect(team.members.find((m) => m.userReferenceId === supervisor.userReferenceId)?.isLead).toBe(true);
    const visible = (await listMembers(sup)).map((m) => m.userReferenceId);
    expect(visible).toContain(inTeam.userReferenceId);
    expect(visible).not.toContain(outside.userReferenceId);

    // A lead on the team member's listing: the supervisor sees it and may pass it within the team.
    const agentActor = await inTeam.actor();
    const ref = await readyRentListing(agentActor, { title: "Team flat for supervisors" });
    const admin = await (await makeAdmin(["listings.approve", "listings.view"])).actor();
    await transitionListing(agentActor, ref, "submit", {}, ctx);
    await transitionListing(admin, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    expect((await getListingForActor(sup, ref)).referenceId).toBe(ref);
    const customer = await makeUser("Team Customer");
    const { leadReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, ref, { name: "Team Customer", phone: "9876543210" });
    expect(await code(assignLead(sup, leadReferenceId, outside.userReferenceId, ctx))).toBe("VALIDATION_ERROR");
    await assignLead(sup, leadReferenceId, supervisor.userReferenceId, ctx);
    expect((await getLead(sup, leadReferenceId)).referenceId).toBe(leadReferenceId);
    expect(await code(getLead(agentActor, leadReferenceId))).toBe("NOT_FOUND");
    // An agent can't assign at all.
    expect(await code(assignLead(agentActor, leadReferenceId, inTeam.userReferenceId, ctx))).toBe("FORBIDDEN");
  });
});

describe("removing people", () => {
  it("hands their listings and leads to someone else, and ends their access", async () => {
    const leaving = await join(owner, "agent");
    const staying = await join(owner, "agent");
    const leavingActor = await leaving.actor();
    const ref = await readyRentListing(leavingActor, { title: "Flat that changes hands" });
    const admin = await (await makeAdmin(["listings.approve", "listings.view"])).actor();
    await transitionListing(leavingActor, ref, "submit", {}, ctx);
    await transitionListing(admin, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    const customer = await makeUser("Handover Customer");
    const { leadReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, ref, { name: "Handover Customer", phone: "9876543210" });

    const detail = await getMember(owner, leaving.userReferenceId);
    expect(detail.manage.canRemove).toBe(true);
    expect(detail.handoverTo.some((h) => h.userReferenceId === staying.userReferenceId)).toBe(true);
    // They have work, so someone must take it.
    expect(await code(removeMember(owner, leaving.userReferenceId, {}, ctx))).toBe("VALIDATION_ERROR");
    const { handedOver } = await removeMember(owner, leaving.userReferenceId, { handoverTo: staying.userReferenceId }, ctx);
    expect(handedOver).toMatchObject({ listings: 1, leads: 1 });

    const stayingActor = await staying.actor();
    expect((await getListingForActor(stayingActor, ref)).referenceId).toBe(ref);
    expect((await listLeads(stayingActor, { open: true }, 1)).rows.some((r) => r.referenceId === leadReferenceId)).toBe(true);
    const membership = await one<{ id: string; status: string }>(sql`SELECT id, status FROM orgs.memberships WHERE user_id = ${leaving.userId} AND organization_id = ${orgId}`);
    expect(membership.status).toBe("removed");
    expect(await loadActor(leaving.userId, membership.id)).toBeNull();
    expect((await listMembers(owner)).some((m) => m.userReferenceId === leaving.userReferenceId)).toBe(false);

    // Invited again, they come back.
    const { token } = await invite(owner, { name: "Back Again", email: leaving.email, role: "agent", phone: "9876543210" });
    await makeSession(leaving.userId);
    await acceptMemberInvitation(token, { sessionUserId: leaving.userId, ipKey: ip() }, ctx);
    expect((await actorFor(leaving.userId, membership.id)).roles).toEqual(["agent"]);
  });

  it("a Manager can't remove a Manager or an Owner, and nobody removes themselves", async () => {
    const manager = await (await join(owner, "manager")).actor();
    const other = await join(owner, "manager");
    expect(await code(removeMember(manager, other.userReferenceId, {}, ctx))).toBe("FORBIDDEN");
    expect(await code(removeMember(manager, owner.userReferenceId, {}, ctx))).toBe("FORBIDDEN");
    expect(await code(removeMember(owner, owner.userReferenceId, {}, ctx))).toBe("FORBIDDEN");
    await removeMember(owner, other.userReferenceId, {}, ctx);
  });

  it("people outside the organization can't see or touch its members", async () => {
    const outsider = await (await makeAgent((await makeOrg("Elsewhere Realty")).id, "Outside Owner", "owner")).actor();
    const member = await join(owner, "operator");
    expect(await code(getMember(outsider, member.userReferenceId))).toBe("NOT_FOUND");
    expect(await code(removeMember(outsider, member.userReferenceId, {}, ctx))).toBe("NOT_FOUND");
  });
});

describe("requests to join", () => {
  /** Applies to join the test organization with its ORG- reference, as a new person. */
  async function askToJoin(name: string) {
    const org = await one<{ reference_id: string }>(sql`SELECT reference_id FROM orgs.organizations WHERE id = ${orgId}`);
    const city = await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'hyderabad'`);
    const applicant = await makeUser(name);
    const { referenceId } = await applyAsAgent(
      person(applicant),
      { phone: "9876512345", cityId: city.id, applyingAs: "join_organization", organizationReference: org.reference_id },
      ctx,
    );
    return { applicant, referenceId };
  }

  it("go to the organization's Owners and Managers, not to Trustbrick", async () => {
    const { applicant, referenceId } = await askToJoin("Joining Agent");
    const cases = await one<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM trust.review_cases rc JOIN orgs.agent_profiles ap ON ap.id = rc.agent_profile_id WHERE ap.reference_id = ${referenceId}`);
    expect(cases.n).toBe(0);
    expect((await listJoinRequests(owner)).some((r) => r.agentReferenceId === referenceId)).toBe(true);

    const agent = await (await join(owner, "agent")).actor();
    expect(await code(approveJoinRequest(agent, referenceId, {}, ctx))).toBe("FORBIDDEN");
    const outsider = await (await makeAgent((await makeOrg("Not Their Realty")).id, "Other Owner", "owner")).actor();
    expect(await code(approveJoinRequest(outsider, referenceId, {}, ctx))).toBe("NOT_FOUND");
    const manager = await (await join(owner, "manager")).actor();
    expect(await code(approveJoinRequest(manager, referenceId, { role: "owner" }, ctx))).toBe("FORBIDDEN");

    await approveJoinRequest(manager, referenceId, { role: "agent" }, ctx);
    const joined = await actorFor(applicant.id);
    expect(joined.organization.id).toBe(orgId);
    expect(joined.roles).toEqual(["agent"]);
    expect(joined.agent).not.toBeNull();
    expect((await listJoinRequests(owner)).some((r) => r.agentReferenceId === referenceId)).toBe(false);
    expect(await code(approveJoinRequest(owner, referenceId, {}, ctx))).toBe("NOT_FOUND");
  });

  it("a declined request tells the applicant why, and they can apply again", async () => {
    const { applicant, referenceId } = await askToJoin("Unknown Agent");
    expect(await code(declineJoinRequest(owner, referenceId, "No.", ctx))).toBe("VALIDATION_ERROR");
    await declineJoinRequest(owner, referenceId, "We don't have an agent by this name.", ctx);
    const profile = await one<{ status: string; status_reason: string }>(sql`SELECT status, status_reason FROM orgs.agent_profiles WHERE user_id = ${applicant.id}`);
    expect(profile).toEqual({ status: "rejected", status_reason: "We don't have an agent by this name." });
    expect(await code(actorFor(applicant.id))).not.toBe("OK");
  });
});

describe("whose listing it is", () => {
  it("an Operator's listing belongs to the agent they choose", async () => {
    const operator = await (await join(owner, "operator")).actor();
    const agent = await join(owner, "agent");
    const start = { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Operator Towers, Road 1" };
    expect(await code(createDraft(operator, start, ctx))).toBe("VALIDATION_ERROR");
    const { referenceId } = await createDraft(operator, { ...start, agent: agent.userReferenceId }, ctx);
    const holder = await one<{ agent_user_id: string }>(sql`
      SELECT la.agent_user_id FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id
       WHERE l.reference_id = ${referenceId} AND la.ended_at IS NULL AND la.role = 'primary'`);
    expect(holder.agent_user_id).toBe(agent.userId);
  });

  it("changing a listing's agent takes its open leads with it", async () => {
    const from = await join(owner, "agent");
    const to = await join(owner, "agent");
    const fromActor = await from.actor();
    const ref = await readyRentListing(fromActor, { title: "Flat that gets a new agent" });
    const admin = await (await makeAdmin(["listings.approve", "listings.view"])).actor();
    await transitionListing(fromActor, ref, "submit", {}, ctx);
    await transitionListing(admin, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    const customer = await makeUser("Agent Change Customer");
    const { leadReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, ref, { name: "Agent Change Customer", phone: "9876543210" });

    expect(await code(assignListingAgent(fromActor, ref, to.userReferenceId, ctx))).toBe("FORBIDDEN");
    await assignListingAgent(owner, ref, to.userReferenceId, ctx);
    const toActor = await to.actor();
    expect((await getListingForActor(toActor, ref)).referenceId).toBe(ref);
    expect((await getLead(toActor, leadReferenceId)).referenceId).toBe(leadReferenceId);
    expect(await code(getListingForActor(fromActor, ref))).toBe("NOT_FOUND");
  });
});

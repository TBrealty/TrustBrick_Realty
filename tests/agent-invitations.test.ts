import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { acceptAgentInvitation, inviteAgent, listAgentInvitations, previewAgentInvitation, revokeAgentInvitation } from "@/lib/services/agent-invitations";
import { applyAsAgent, approveAgent } from "@/lib/services/agents";
import { createOrganization } from "@/lib/services/organizations";
import { actorFor, ctx, makeAdmin, makeOrg, makeSession, makeSuperadmin, makeUser, one, person } from "./support/factory";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const tag = () => uuidv7().slice(-8);

let superadmin: Actor;
let admin: Actor;
let cityId: string;

/** Invitations email a token; the test swaps the stored hash for one it knows. */
async function invite(actor: Actor, input: Record<string, unknown>) {
  const { referenceId } = await inviteAgent(actor, input, ctx);
  const token = `${"a".repeat(20)}${uuidv7().replace(/-/g, "").slice(0, 23)}`;
  await db.execute(sql`UPDATE orgs.agent_invitations SET token_hash = ${createHash("sha256").update(token).digest("hex")} WHERE reference_id = ${referenceId}`);
  return { referenceId, token };
}

const details = (overrides: Record<string, unknown> = {}) => ({
  name: "Invited Agent",
  email: `invited.${tag()}@example.test`,
  phone: "98765 43210",
  cityId,
  reraAgentNumber: "RERA-TEST-1",
  experienceYears: "4",
  ...overrides,
});

beforeAll(async () => {
  superadmin = await (await makeSuperadmin()).actor();
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  cityId = (await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'hyderabad'`)).id;
});

describe("who creates what", () => {
  it("the SuperAdmin creates admins and sees everything, but can't create organizations or agents", async () => {
    expect(can(superadmin, "admins.create", "platform")).toBe(true);
    expect(can(superadmin, "settings.manage", "platform")).toBe(true);
    expect(can(superadmin, "agents.view", "platform")).toBe(true);
    expect(can(superadmin, "organizations.view", "platform")).toBe(true);
    expect(can(superadmin, "dashboard.view", "platform")).toBe(true);
    for (const p of ["organizations.manage", "agents.create", "agents.verify", "listings.approve", "users.suspend"] as const) {
      expect(can(superadmin, p, "platform")).toBe(false);
    }
    expect(await code(createOrganization(superadmin, { name: "SA Realty", orgType: "brokerage" }, ctx))).toBe("FORBIDDEN");
    expect(await code(inviteAgent(superadmin, details(), ctx))).toBe("FORBIDDEN");
  });

  it("an operations admin creates organizations and agents", async () => {
    expect(await code(createOrganization(admin, { name: `Ops Realty ${tag()}`, orgType: "brokerage" }, ctx))).toBe("OK");
    expect(await code(inviteAgent(admin, details(), ctx))).toBe("OK");
  });

  it("an admin without the permission can't create agents", async () => {
    const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
    expect(await code(inviteAgent(moderator, details(), ctx))).toBe("FORBIDDEN");
  });

  it("only an admin approves agent applications", async () => {
    const applicant = await makeUser("Applicant");
    const { referenceId } = await applyAsAgent(person(applicant), { phone: "9876501111", cityId }, ctx);
    expect(await code(approveAgent(superadmin, referenceId, { verify: false }, ctx))).toBe("FORBIDDEN");
    expect(await code(approveAgent(admin, referenceId, { verify: false }, ctx))).toBe("OK");
  });
});

describe("admin-created agents", () => {
  it("creates the account, AGT profile and workspace in the organization when accepted", async () => {
    const org = await makeOrg("Invite Realty");
    const input = details({ organizationReference: org.referenceId.toLowerCase(), verified: "on" });
    const { referenceId, token } = await invite(admin, input);
    expect(referenceId).toMatch(/^INV-/);
    expect((await previewAgentInvitation(token))?.organization).toBe("Invite Realty");
    expect((await listAgentInvitations(admin)).some((i) => i.referenceId === referenceId && i.status === "pending")).toBe(true);

    const result = await acceptAgentInvitation(token, { sessionUserId: null, password: "a very long password", ipKey: "ai1" }, ctx);
    expect(result.createdAccount).toBe(true);

    const row = await one<{ user_id: string; reference_id: string; status: string; verification_status: string; phone: string; approved_by: string; email_verified: boolean }>(sql`
      SELECT ap.user_id, ap.reference_id, ap.status, ap.verification_status, ap.phone, ap.approved_by, u.email_verified
        FROM orgs.agent_profiles ap JOIN identity.users u ON u.id = ap.user_id WHERE u.email = ${input.email}`);
    expect(row.reference_id).toMatch(/^AGT-/);
    expect(row).toMatchObject({ status: "active", verification_status: "verified", phone: "9876543210", approved_by: admin.userId, email_verified: true });

    const agent = await actorFor(row.user_id);
    expect(agent.organization.id).toBe(org.id);
    expect(agent.roles).toEqual(["agent"]);
    expect(can(agent, "listings.create")).toBe(true);

    // One use only.
    expect(await previewAgentInvitation(token)).toBeNull();
    expect(await code(acceptAgentInvitation(token, { sessionUserId: null, password: "a very long password", ipKey: "ai2" }, ctx))).toBe("NOT_FOUND");
  });

  it("an independent agent gets their own organization; a broker admin needs one", async () => {
    const { token } = await invite(admin, details());
    await acceptAgentInvitation(token, { sessionUserId: null, password: "a very long password", ipKey: "ai3" }, ctx);
    expect(await code(inviteAgent(admin, details({ role: "broker_admin" }), ctx))).toBe("VALIDATION_ERROR");

    const org = await makeOrg("Broker Co");
    const broker = await invite(admin, details({ organizationReference: org.referenceId, role: "broker_admin" }));
    await acceptAgentInvitation(broker.token, { sessionUserId: null, password: "a very long password", ipKey: "ai4" }, ctx);
    const brokerRow = await one<{ user_id: string }>(sql`SELECT accepted_user_id AS user_id FROM orgs.agent_invitations WHERE reference_id = ${broker.referenceId}`);
    const actor = await actorFor(brokerRow.user_id);
    expect(actor.roles).toEqual(["broker_admin"]);
    expect(actor.permissions["listings.view"]).toBe("org");
  });

  it("an existing account must be logged in as the invited email", async () => {
    const existing = await makeUser("Existing Customer");
    const stranger = await makeUser("Stranger");
    await makeSession(existing.id);
    const { token } = await invite(admin, details({ email: existing.email }));
    expect(await code(acceptAgentInvitation(token, { sessionUserId: stranger.id, ipKey: "ai5" }, ctx))).toBe("UNAUTHORIZED");
    expect(await code(acceptAgentInvitation(token, { sessionUserId: existing.id, ipKey: "ai6" }, ctx))).toBe("OK");
  });

  it("refuses people who are already agents, applicants or staff, and unknown organizations", async () => {
    const applicant = await makeUser("Pending Applicant");
    await applyAsAgent(person(applicant), { phone: "9876502222", cityId }, ctx);
    expect(await code(inviteAgent(admin, details({ email: applicant.email }), ctx))).toBe("CONFLICT");
    const staff = await makeAdmin([]);
    expect(await code(inviteAgent(admin, details({ email: staff.user.email }), ctx))).toBe("CONFLICT");
    expect(await code(inviteAgent(admin, details({ organizationReference: "ORG-00000000" }), ctx))).toBe("VALIDATION_ERROR");
    const pendingOrg = await makeOrg("Pending Org", { status: "pending" });
    expect(await code(inviteAgent(admin, details({ organizationReference: pendingOrg.referenceId }), ctx))).toBe("VALIDATION_ERROR");
  });

  it("one pending invitation per email, and revoking kills the link", async () => {
    const email = `dup.${tag()}@example.test`;
    const first = await invite(admin, details({ email }));
    expect(await code(inviteAgent(admin, details({ email }), ctx))).toBe("CONFLICT");
    await revokeAgentInvitation(admin, first.referenceId, ctx);
    expect(await previewAgentInvitation(first.token)).toBeNull();
    expect(await code(acceptAgentInvitation(first.token, { sessionUserId: null, password: "a very long password", ipKey: "ai7" }, ctx))).toBe("NOT_FOUND");
    expect(await code(inviteAgent(admin, details({ email }), ctx))).toBe("OK");
  });

  it("is audited", async () => {
    const { referenceId, token } = await invite(admin, details());
    await acceptAgentInvitation(token, { sessionUserId: null, password: "a very long password", ipKey: "ai8" }, ctx);
    const events = await db.execute(sql`
      SELECT event_type FROM platform.audit_events
       WHERE target_reference_id = ${referenceId} OR metadata->>'invitation' = ${referenceId} ORDER BY created_at`);
    expect((events.rows as { event_type: string }[]).map((e) => e.event_type)).toEqual(["AGENT_INVITED", "AGENT_CREATED"]);
  });
});

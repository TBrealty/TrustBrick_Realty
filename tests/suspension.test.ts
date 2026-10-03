import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { loadActor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { AppError } from "@/lib/errors";
import { approveAgent, applyAsAgent, reinstateAgent, rejectAgent, suspendAgent } from "@/lib/services/agents";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { transitionOrganization } from "@/lib/services/organizations";
import { reinstateUser, suspendUser } from "@/lib/services/users";
import { ctx, makeAdmin, makeAgent, makeOrg, makeSession, makeUser, one, person, statusOf } from "./support/factory";
import { readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));

let ops: Actor;
let support: Actor;

async function publishedListing(agent: Actor) {
  const ref = await readyRentListing(agent);
  await transitionListing(agent, ref, "submit", {}, ctx);
  await transitionListing(ops, ref, "approve", { reason: "Checked the details and photos." }, ctx);
  return ref;
}

beforeAll(async () => {
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  support = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
});

describe("agent applications", () => {
  it("apply → approve creates a working agent workspace in their own organization", async () => {
    const user = await makeUser("Applicant");
    const city = await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'hyderabad'`);
    const { referenceId } = await applyAsAgent(person(user), { phone: "98765 43210", cityId: city.id }, ctx);
    expect(referenceId).toMatch(/^AGT-/);
    expect(await code(applyAsAgent(person(user), { phone: "9876543210", cityId: city.id }, ctx))).toBe("CONFLICT");
    expect(await code(approveAgent(support, referenceId, { verify: true }, ctx))).toBe("FORBIDDEN");
    await approveAgent(ops, referenceId, { verify: true }, ctx);
    const membership = await one<{ id: string; org_type: string }>(sql`
      SELECT m.id, o.org_type FROM orgs.memberships m JOIN orgs.organizations o ON o.id = m.organization_id WHERE m.user_id = ${user.id}`);
    expect(membership.org_type).toBe("personal");
    const actor = await loadActor(user.id, membership.id);
    expect(actor?.agent?.referenceId).toBe(referenceId);
  });

  it("a rejected application gives no workspace and can be resubmitted", async () => {
    const user = await makeUser("Rejected Applicant");
    const city = await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'pune'`);
    const { referenceId } = await applyAsAgent(person(user), { phone: "9876543211", cityId: city.id }, ctx);
    await rejectAgent(ops, referenceId, "RERA registration number could not be found.", ctx);
    const memberships = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM orgs.memberships WHERE user_id = ${user.id}`);
    expect(memberships.n).toBe(0);
    expect(await code(applyAsAgent(person(user), { phone: "9876543211", cityId: city.id, reraAgentNumber: "P5210000001" }, ctx))).toBe("OK");
  });
});

describe("suspensions change marketplace visibility", () => {
  it("suspending an agent pauses their live listings; reinstating resumes them", async () => {
    const org = await makeOrg("Suspension Realty");
    const agent = await makeAgent(org.id, "To Be Suspended");
    const ref = await publishedListing(await agent.actor());
    const { paused } = await suspendAgent(ops, agent.referenceId, "Customer complaints under investigation.", ctx);
    expect(paused).toBe(1);
    expect(await statusOf(ref)).toBe("paused");
    expect(await loadActor(agent.user.id, agent.membershipId)).toBeNull();
    const { resumed } = await reinstateAgent(ops, agent.referenceId, ctx);
    expect(resumed).toBe(1);
    expect(await statusOf(ref)).toBe("published");
  });

  it("suspending a user logs them out everywhere and pauses their listings", async () => {
    const org = await makeOrg("User Suspension Realty");
    const agent = await makeAgent(org.id, "Suspended User");
    const ref = await publishedListing(await agent.actor());
    await makeSession(agent.user.id);
    await suspendUser(ops, agent.user.referenceId, "Fraudulent listings reported by customers.", ctx);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM identity.sessions WHERE user_id = ${agent.user.id}`)).n).toBe(0);
    expect(await statusOf(ref)).toBe("paused");
    await reinstateUser(ops, agent.user.referenceId, ctx);
    expect(await statusOf(ref)).toBe("published");
  });

  it("the order in which holds are lifted doesn't matter", async () => {
    const org = await makeOrg("Double Hold Realty");
    const agent = await makeAgent(org.id, "Double Hold");
    const ref = await publishedListing(await agent.actor());
    await suspendUser(ops, agent.user.referenceId, "First hold: account under review.", ctx);
    await transitionOrganization(ops, org.referenceId, "suspend", "Second hold: organization under review.", ctx);
    await reinstateUser(ops, agent.user.referenceId, ctx);
    expect(await statusOf(ref)).toBe("paused");
    await transitionOrganization(ops, org.referenceId, "reinstate", null, ctx);
    expect(await statusOf(ref)).toBe("published");
  });

  it("admins can't suspend themselves, staff, or without permission", async () => {
    const adminUser = await one<{ reference_id: string }>(sql`SELECT reference_id FROM identity.users WHERE id = ${ops.userId}`);
    expect(await code(suspendUser(ops, adminUser.reference_id, "Suspending myself for a test.", ctx))).toBe("FORBIDDEN");
    const supportUser = await one<{ reference_id: string }>(sql`SELECT reference_id FROM identity.users WHERE id = ${support.userId}`);
    expect(await code(suspendUser(ops, supportUser.reference_id, "Trying to suspend a staff account.", ctx))).toBe("FORBIDDEN");
    const customer = await makeUser("Innocent");
    expect(await code(suspendUser(support, customer.referenceId, "Support has read-only access.", ctx))).toBe("FORBIDDEN");
  });
});

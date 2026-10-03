import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { AppError } from "@/lib/errors";
import { createEnquiry, getLead, listLeads, updateLeadStatus } from "@/lib/services/crm";
import { dashboardGuard } from "./support/guards";
import { deleteListingMedia, uploadListingMedia } from "@/lib/services/media";
import { updateDetails, updatePricing } from "@/lib/services/listings/onboarding";
import { getListingForActor, listListingsForActor } from "@/lib/services/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, makeAdmin, makeAgent, makeOrg, makeUser } from "./support/factory";
import { readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));

let agentA: Actor;
let agentB: Actor;
let otherOrgAgent: Actor;
let teamLead: Actor;
let broker: Actor;
let refA: string;

beforeAll(async () => {
  const org = await makeOrg("IDOR Realty");
  const other = await makeOrg("Other Realty");
  const a = await makeAgent(org.id, "Agent A");
  const b = await makeAgent(org.id, "Agent B");
  const lead = await makeAgent(org.id, "Team Lead", "team_lead");
  const brokerAgent = await makeAgent(org.id, "Broker", "broker_admin");
  agentA = await a.actor();
  agentB = await b.actor();
  otherOrgAgent = await (await makeAgent(other.id, "Outsider")).actor();

  // Agent A and the team lead share a team; Agent B does not.
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const team = (await db.execute(sql`INSERT INTO orgs.teams (id, organization_id, name) VALUES (gen_random_uuid(), ${org.id}, 'Team One') RETURNING id`)).rows[0] as { id: string };
  await db.execute(sql`INSERT INTO orgs.team_members (team_id, membership_id, is_lead) VALUES (${team.id}, ${lead.membershipId}, true), (${team.id}, ${a.membershipId}, false)`);
  teamLead = await lead.actor();
  broker = await brokerAgent.actor();

  refA = await readyRentListing(agentA, { title: "Agent A's private flat" });
});

describe("insecure direct object references", () => {
  it("another agent cannot read, edit or act on a listing by guessing its reference", async () => {
    expect(await code(getListingForActor(agentB, refA))).toBe("NOT_FOUND");
    expect(await code(updatePricing(agentB, refA, { price: "1000" }))).toBe("NOT_FOUND");
    expect(await code(updateDetails(agentB, refA, { title: "Hijacked title here" }))).toBe("NOT_FOUND");
    expect(await code(transitionListing(agentB, refA, "submit", {}, ctx))).toBe("NOT_FOUND");
    expect(await code(transitionListing(otherOrgAgent, refA, "archive", {}, ctx))).toBe("NOT_FOUND");
    expect(await code(deleteListingMedia(agentB, refA, "00000000-0000-7000-8000-000000000000"))).toBe("NOT_FOUND");
    expect(await code(uploadListingMedia(agentB, refA, "photo", new Blob(["x"]).stream(), "x.jpg"))).toBe("NOT_FOUND");
  });

  it("another agent's table doesn't include the listing", async () => {
    const page = await listListingsForActor(agentB, { group: "all", sort: "updated" }, 1);
    expect(page.rows.some((r) => r.referenceId === refA)).toBe(false);
  });

  it("a team lead sees their team member's listing; a broker admin sees the whole organization's", async () => {
    expect((await getListingForActor(teamLead, refA)).referenceId).toBe(refA);
    expect((await getListingForActor(broker, refA)).referenceId).toBe(refA);
    // Seeing is not editing on someone else's behalf beyond scope: the team lead holds listings.edit at team scope, so this is allowed…
    expect(await code(updatePricing(teamLead, refA, { price: "30500" }))).toBe("OK");
    // …while an agent in another organization never can.
    expect(await code(getListingForActor(otherOrgAgent, refA))).toBe("NOT_FOUND");
  });

  it("leads are visible only to the agent they belong to (and wider scopes)", async () => {
    const admin = await (await makeAdmin(["listings.approve", "listings.view"])).actor();
    await transitionListing(agentA, refA, "submit", {}, ctx);
    await transitionListing(admin, refA, "approve", { reason: "Checked the details and photos." }, ctx);
    const customer = await makeUser("Curious Customer");
    const { leadReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, refA, { name: "Curious Customer", phone: "9876543210", message: "Is it available?" });

    expect((await getLead(agentA, leadReferenceId)).referenceId).toBe(leadReferenceId);
    expect(await code(getLead(agentB, leadReferenceId))).toBe("NOT_FOUND");
    expect(await code(updateLeadStatus(agentB, leadReferenceId, { status: "contacted" }))).toBe("NOT_FOUND");
    expect((await listLeads(agentB, { open: false }, 1)).rows.some((r) => r.referenceId === leadReferenceId)).toBe(false);
    expect((await getLead(broker, leadReferenceId)).referenceId).toBe(leadReferenceId);
    expect(await code(getLead(otherOrgAgent, leadReferenceId))).toBe("NOT_FOUND");
  });

  it("an agent can never reach platform data", async () => {
    expect(await dashboardGuard(agentA)).toBe("FORBIDDEN");
  });
});

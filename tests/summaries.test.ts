import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { AppError } from "@/lib/errors";
import { createEnquiry, updateLeadStatus } from "@/lib/services/crm";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { type AgentSummary, type OrganizationSummary, type UserSummary, loadSummary } from "@/lib/services/summaries";
import { ctx, makeAdmin, makeAgent, makeOrg, makeSuperadmin, makeUser } from "./support/factory";
import { readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));

let ops: Actor;
let agent: Actor;
let agentRef: string;
let org: { id: string; referenceId: string };
let otherOrgAgentRef: string;
let customer: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  org = await makeOrg("Summary Realty");
  const a = await makeAgent(org.id, "Summary Agent");
  agentRef = a.referenceId;
  agent = await a.actor();
  otherOrgAgentRef = (await makeAgent((await makeOrg("Elsewhere Realty")).id, "Elsewhere Agent")).referenceId;

  const listing = await readyRentListing(agent, { title: "Summary test flat" });
  await transitionListing(agent, listing, "submit", {}, ctx);
  await transitionListing(moderator, listing, "approve", { reason: "Checked the details and photos." }, ctx);

  customer = await makeUser("Summary Customer");
  const day = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { leadReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, listing, {
    name: "Summary Customer",
    phone: "9876507777",
    message: "Is it still available?",
    wantsVisit: "on",
    visitDate: day,
    visitTime: "morning",
  });
  for (const status of ["contacted", "qualified", "negotiation", "converted"]) await updateLeadStatus(agent, leadReferenceId, { status });
});

describe("View cards", () => {
  it("a user's card shows what they rented, enquired about and asked to visit", async () => {
    const s = (await loadSummary(ops, "user", customer.referenceId)) as UserSummary;
    expect(s.kind).toBe("user");
    expect(s.totals).toMatchObject({ enquiries: 1, closed: 1, visits: 1 });
    expect(s.byJourney.rent).toEqual({ enquiries: 1, closed: 1 });
    expect(s.byJourney.buy.enquiries).toBe(0);
    expect(s.enquiries?.[0]).toMatchObject({ status: "converted", agent: "Summary Agent", message: "Is it still available?" });
    expect(s.enquiries?.[0].listing).toMatchObject({ title: "Summary test flat", journey: "rent" });
    expect(s.enquiries?.[0].listing?.price).toContain("/mo");
    expect(s.visits).toHaveLength(1);
  });

  it("an agent's card counts their listings, leads and deals", async () => {
    const s = (await loadSummary(ops, "agent", agentRef)) as AgentSummary;
    expect(s.listings).toMatchObject({ total: 1, live: 1 });
    expect(s.listings.byJourney.rent).toBe(1);
    expect(s.leads).toMatchObject({ total: 1, converted: 1, open: 0 });
    expect(s.recentLeads?.[0].customer).toBe("Summary Customer");
    expect(s.visits.total).toBe(1);
  });

  it("an organization's card rolls up its members' work", async () => {
    const s = (await loadSummary(ops, "organization", org.referenceId)) as OrganizationSummary;
    expect(s.orgTypeLabel).toBe("Brokerage");
    expect(s.listings.live).toBe(1);
    expect(s.leads.converted).toBe(1);
    expect(s.members.find((m) => m.name === "Summary Agent")).toMatchObject({ listings: 1, leads: 1 });
  });

  it("follows the viewer's permissions: counts always, details only when allowed", async () => {
    const limited = await (await makeAdmin(["users.view"])).actor();
    const s = (await loadSummary(limited, "user", customer.referenceId)) as UserSummary;
    expect(s.totals.enquiries).toBe(1);
    expect(s.enquiries).toBeNull();
    expect(s.visits).toBeNull();
    expect(s.bookmarks).toBeNull();
    expect(await code(loadSummary(limited, "agent", agentRef))).toBe("FORBIDDEN");
    expect(await code(loadSummary(limited, "organization", org.referenceId))).toBe("FORBIDDEN");

    const sa = await (await makeSuperadmin()).actor();
    expect((await loadSummary(sa, "user", customer.referenceId)).kind).toBe("user");
  });

  it("agents can't open cards, and a broker admin sees only their own organization's agents", async () => {
    expect(await code(loadSummary(agent, "user", customer.referenceId))).toBe("FORBIDDEN");
    const broker = await (await makeAgent(org.id, "Summary Broker", "broker_admin")).actor();
    expect((await loadSummary(broker, "agent", agentRef)).kind).toBe("agent");
    expect(await code(loadSummary(broker, "agent", otherOrgAgentRef))).toBe("NOT_FOUND");
    expect(await code(loadSummary(broker, "organization", org.referenceId))).toBe("FORBIDDEN");
  });

  it("rejects references of the wrong kind", async () => {
    expect(await code(loadSummary(ops, "user", agentRef))).toBe("NOT_FOUND");
    expect(await code(loadSummary(ops, "agent", "AGT-00000000"))).toBe("NOT_FOUND");
  });
});

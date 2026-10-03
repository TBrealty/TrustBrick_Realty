import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { resolveRange } from "@/lib/range";
import { createEnquiry } from "@/lib/services/crm";
import { platformDashboard, professionalDashboard } from "@/lib/services/dashboard";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, makeAdmin, makeAgent, makeOrg, makeUser, one } from "./support/factory";
import { readyRentListing } from "./support/listings";

let moderator: Actor;
let agentA: Actor;
let agentB: Actor;

beforeAll(async () => {
  moderator = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  const org = await makeOrg("Dashboard Realty");
  agentA = await (await makeAgent(org.id, "Dash A")).actor();
  agentB = await (await makeAgent(org.id, "Dash B")).actor();
  for (let i = 0; i < 3; i++) {
    const ref = await readyRentListing(agentA);
    await transitionListing(agentA, ref, "submit", {}, ctx);
    if (i < 2) await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    if (i === 0) {
      const customer = await makeUser(`Dash Customer ${i}`);
      await createEnquiry({ userId: customer.id, email: customer.email }, ref, { name: "Dash Customer", phone: "9876500000" });
    }
  }
  await readyRentListing(agentB);
});

describe("platform dashboard", () => {
  it("matches independent counts", async () => {
    const d = await platformDashboard(moderator, resolveRange({ range: "30d" }), { excludeSample: false });
    const expected = await one<Record<string, number>>(sql`
      SELECT (SELECT count(*) FROM identity.users)::int AS users,
             (SELECT count(*) FROM marketplace.listings WHERE deleted_at IS NULL)::int AS listings,
             (SELECT count(*) FROM marketplace.listings WHERE status = 'published' AND deleted_at IS NULL)::int AS live,
             (SELECT count(*) FROM marketplace.listings WHERE status IN ('submitted', 'under_review') AND deleted_at IS NULL)::int AS pending,
             (SELECT count(*) FROM orgs.agent_profiles)::int AS agents,
             (SELECT count(*) FROM crm.leads WHERE deleted_at IS NULL)::int AS leads,
             (SELECT count(*) FROM orgs.organizations WHERE org_type NOT IN ('internal', 'personal') AND deleted_at IS NULL)::int AS orgs`);
    expect(d.totals.users).toBe(expected.users);
    expect(d.totals.listings).toBe(expected.listings);
    expect(d.totals.liveListings).toBe(expected.live);
    expect(d.totals.pendingListings).toBe(expected.pending);
    expect(d.totals.agents).toBe(expected.agents);
    expect(d.totals.leads).toBe(expected.leads);
    expect(d.totals.organizations).toBe(expected.orgs);
    expect(d.period.listings.current).toBe(expected.listings);
    expect(d.series.listings.reduce((sum, b) => sum + b.count, 0)).toBe(expected.listings);
    expect(d.series.listings.length).toBe(30);
  });

  it("buckets by the selected range", async () => {
    expect((await platformDashboard(moderator, resolveRange({ range: "today" }), { excludeSample: false })).series.users.length).toBe(24);
    expect((await platformDashboard(moderator, resolveRange({ range: "12m" }), { excludeSample: false })).series.users.length).toBe(12);
  });
});

describe("agent dashboard", () => {
  it("only counts the agent's own work", async () => {
    const a = await professionalDashboard(agentA, resolveRange({ range: "30d" }));
    const b = await professionalDashboard(agentB, resolveRange({ range: "30d" }));
    expect(a.listings.total).toBe(3);
    expect(a.listings.live).toBe(2);
    expect(a.listings.pending).toBe(1);
    expect(a.leads.newInPeriod.current).toBe(1);
    expect(b.listings.total).toBe(1);
    expect(b.listings.drafts).toBe(1);
    expect(b.leads.newInPeriod.current).toBe(0);
  });
});

describe("the audit log is append-only", () => {
  it("rejects updates and deletes from the app", async () => {
    await expect(db.execute(sql`UPDATE platform.audit_events SET event_type = 'TAMPERED'`)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM platform.audit_events`)).rejects.toThrow();
    await expect(db.execute(sql`UPDATE marketplace.listing_status_history SET reason = 'rewritten'`)).rejects.toThrow();
  });
});

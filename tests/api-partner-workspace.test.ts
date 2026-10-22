import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import * as agentDetail from "@/app/api/v1/partner/agents/[ref]/route";
import * as agents from "@/app/api/v1/partner/agents/route";
import * as commissionAccept from "@/app/api/v1/partner/commission/accept/route";
import * as commission from "@/app/api/v1/partner/commission/route";
import * as contacts from "@/app/api/v1/partner/contacts/route";
import * as dashboard from "@/app/api/v1/partner/dashboard/route";
import * as amenities from "@/app/api/v1/partner/listings/[ref]/amenities/route";
import * as details from "@/app/api/v1/partner/listings/[ref]/details/route";
import * as location from "@/app/api/v1/partner/listings/[ref]/location/route";
import * as media from "@/app/api/v1/partner/listings/[ref]/media/route";
import * as pricing from "@/app/api/v1/partner/listings/[ref]/pricing/route";
import * as terms from "@/app/api/v1/partner/listings/[ref]/terms/route";
import * as transition from "@/app/api/v1/partner/listings/[ref]/transition/route";
import * as workspace from "@/app/api/v1/partner/listings/[ref]/workspace/route";
import * as listings from "@/app/api/v1/partner/listings/route";
import * as options from "@/app/api/v1/partner/onboarding/options/route";
import * as performance from "@/app/api/v1/partner/performance/route";
import * as blocks from "@/app/api/v1/partner/stays/[ref]/blocks/route";
import * as calendar from "@/app/api/v1/partner/stays/[ref]/calendar/route";
import * as stays from "@/app/api/v1/partner/stays/route";
import * as subscription from "@/app/api/v1/partner/subscription/route";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, makeAdmin, makeAgent, makeHost, makeOrg, makeUser, one } from "./support/factory";
import { readyStay } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-workspace-"));

type Call<P> = { method?: string; token?: string; body?: unknown; raw?: Buffer; params?: P };
async function call<P>(handler: (request: Request, segment?: { params: Promise<P> }) => Promise<Response>, url: string, o: Call<P> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.raw) headers["content-type"] = "image/jpeg";
  const body = o.raw ? new Uint8Array(o.raw) : o.body === undefined ? undefined : JSON.stringify(o.body);
  const response = await handler(new Request(`http://localhost:3000${url}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body }), o.params ? { params: Promise.resolve(o.params) } : undefined);
  return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown> & { [k: string]: unknown }; error?: Record<string, unknown> } };
}

async function tokenFor(userId: string) {
  const token = `t-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-session`;
  await one(sql`INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), ${userId}, ${token}, now() + interval '1 day') RETURNING id`);
  return token;
}

let broker: Actor;
let brokerToken: string;
let orgId: string;
let moderator: Actor;

beforeAll(async () => {
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  const org = await makeOrg("Workspace Realty");
  orgId = org.id;
  broker = await (await makeAgent(org.id, "Workspace Broker", "broker_admin", { accept: false })).actor();
  brokerToken = await tokenFor(broker.userId);
});

describe("onboarding a property from the phone", () => {
  it("creates a draft, fills every step, adds photos and submits it", async () => {
    const opts = await call(options.GET, "/api/v1/partner/onboarding/options", { token: brokerToken });
    const data = opts.body.data as { types: { code: string; category: string; purposes: string[] }[]; cities: { name: string; localities: { id: string; name: string }[] }[]; amenities: { code: string }[]; purposes: string[] };
    expect(data.purposes).toContain("rent");
    const flat = data.types.find((t) => t.code === "apartment")!;
    expect(flat.purposes).toContain("rent");
    const hyderabad = data.cities.find((c) => c.name === "Hyderabad")!;

    // Step 1: what and where. A GPS position comes as a map link.
    const created = await call(listings.POST, "/api/v1/partner/listings", {
      token: brokerToken,
      body: { purpose: "rent", propertyType: "apartment", localityId: hyderabad.localities[0].id, line1: "Tower C, Lake View Road", mapLink: "https://maps.google.com/?q=17.4486,78.3908" },
    });
    expect(created.status).toBe(201);
    const ref = String(created.body.data!.referenceId);

    const before = await call(workspace.GET, `/api/v1/partner/listings/${ref}/workspace`, { token: brokerToken, params: { ref } });
    expect(before.body.data).toMatchObject({ editable: true, quickEdit: false, statusLabel: "Draft", purposeLabel: "Rent out" });
    const gaps = (before.body.data!.gaps as { section: string }[]).map((g) => g.section);
    expect(gaps).toEqual(expect.arrayContaining(["details", "pricing", "media"]));
    expect((before.body.data!.listing as { location: { pinExact: boolean } }).location.pinExact).toBe(true);

    // A mistake comes back field by field.
    const bad = await call(details.PUT, `/api/v1/partner/listings/${ref}/details`, { method: "PUT", token: brokerToken, params: { ref }, body: { title: "Short" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error!.fieldErrors).toHaveProperty("title");

    const steps: [typeof details.PUT, string, Record<string, unknown>][] = [
      [location.PUT, "location", { localityId: hyderabad.localities[0].id, line1: "Tower C, Lake View Road", landmark: "Opposite the park", postalCode: "500081" }],
      [
        details.PUT,
        "details",
        {
          title: "3 BHK with a lake view",
          description: "Corner flat on a high floor with cross ventilation, two covered parking spaces and a clubhouse.",
          lifecycleStatus: "ready",
          ownershipType: "freehold",
          yearBuilt: 2018,
          carpetAreaSqft: 1450,
          floorNumber: 9,
          totalFloors: 18,
          bedrooms: 3,
          bathrooms: 3,
          balconies: 2,
          furnishing: "semi_furnished",
          facing: "east",
          coveredParking: 2,
        },
      ],
      [pricing.PUT, "pricing", { price: 45000, priceNegotiable: true, depositAmount: 135000, maintenanceAmount: 3500, brokerageType: "months_rent", brokerageValue: 1 }],
      [amenities.PUT, "amenities", { amenities: data.amenities.slice(0, 3).map((a) => a.code), custom: ["Rooftop garden"] }],
    ];
    for (const [handler, step, body] of steps) {
      const saved = await call(handler, `/api/v1/partner/listings/${ref}/${step}`, { method: "PUT", token: brokerToken, params: { ref }, body });
      expect([step, saved.status]).toEqual([step, 200]);
    }
    const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c9b79c" } }).jpeg().toBuffer();
    expect((await call(media.POST, `/api/v1/partner/listings/${ref}/media?kind=photo`, { token: brokerToken, params: { ref }, raw: photo })).status).toBe(201);

    // Submitting needs the organization's commission terms accepted first.
    const ready = await call(workspace.GET, `/api/v1/partner/listings/${ref}/workspace`, { token: brokerToken, params: { ref } });
    expect((ready.body.data!.gaps as { section: string }[]).map((g) => g.section)).toEqual(["commission"]);
    expect((await call(commissionAccept.POST, "/api/v1/partner/commission/accept", { token: brokerToken, method: "POST" })).status).toBe(200);
    const submitted = await call(transition.POST, `/api/v1/partner/listings/${ref}/transition`, { token: brokerToken, params: { ref }, body: { action: "submit" } });
    expect(submitted.body.data).toMatchObject({ status: "submitted" });

    const after = await call(workspace.GET, `/api/v1/partner/listings/${ref}/workspace`, { token: brokerToken, params: { ref } });
    expect(after.body.data).toMatchObject({ editable: false, statusLabel: "Waiting for approval" });
    expect((after.body.data!.actions as { action: string }[]).map((a) => a.action)).toEqual(["withdraw"]);

    // Approved: quick edits apply straight away, and it can be marked rented out.
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    const live = await call(workspace.GET, `/api/v1/partner/listings/${ref}/workspace`, { token: brokerToken, params: { ref } });
    expect(live.body.data).toMatchObject({ quickEdit: true, deal: { purpose: "rent", price: 45000, suggestedBrokerage: 45000 } });
    const quick = await call(terms.PUT, `/api/v1/partner/listings/${ref}/terms`, { method: "PUT", token: brokerToken, params: { ref }, body: { price: 42000, depositAmount: 126000, offerTitle: "No brokerage this month" } });
    expect(quick.status).toBe(200);
    const closed = await call(transition.POST, `/api/v1/partner/listings/${ref}/transition`, {
      token: brokerToken,
      params: { ref },
      body: { action: "mark_closed", close: { outcome: "closed_deal", dealValue: 42000, brokerage: 42000 } },
    });
    expect(closed.body.data).toMatchObject({ status: "transacted" });

    const list = await call(listings.GET, "/api/v1/partner/listings?group=all", { token: brokerToken });
    expect(list.body.data!.counts).toBeDefined();
    expect((list.body.data!.rows as { referenceId: string }[]).map((r) => r.referenceId)).toContain(ref);
  });
});

describe("the rest of the partner workspace", () => {
  it("has the dashboard, performance, clients, commission, subscription and team", async () => {
    const dash = await call(dashboard.GET, "/api/v1/partner/dashboard?range=7d", { token: brokerToken });
    expect(dash.body.data).toMatchObject({ range: { key: "7d" }, listings: expect.any(Object), leads: expect.any(Object) });
    expect((await call(performance.GET, "/api/v1/partner/performance", { token: brokerToken })).status).toBe(200);
    expect((await call(contacts.GET, "/api/v1/partner/contacts", { token: brokerToken })).status).toBe(200);
    const money = await call(commission.GET, "/api/v1/partner/commission?status=all", { token: brokerToken });
    expect(money.body.data).toMatchObject({ mayAccept: true, acceptance: expect.any(Object), ledger: { rows: expect.any(Array) } });
    const plan = await call(subscription.GET, "/api/v1/partner/subscription", { token: brokerToken });
    expect(plan.body.data).toMatchObject({ canManage: true, plans: expect.any(Array) });

    const teammate = await makeAgent(orgId, "Workspace Teammate");
    const team = await call(agents.GET, "/api/v1/partner/agents", { token: brokerToken });
    const refs = (team.body.data!.rows as { referenceId: string }[]).map((r) => r.referenceId);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const mate = (team.body.data!.rows as { referenceId: string; name: string }[]).find((r) => r.name === "Workspace Teammate")!;
    expect((await call(agentDetail.GET, `/api/v1/partner/agents/${mate.referenceId}`, { token: brokerToken, params: { ref: mate.referenceId } })).status).toBe(200);
    // A plain agent can't see the team.
    expect((await call(agents.GET, "/api/v1/partner/agents", { token: await tokenFor((await teammate.actor()).userId) })).status).toBe(403);
    // Customers have no workspace at all.
    expect((await call(dashboard.GET, "/api/v1/partner/dashboard", { token: await tokenFor((await makeUser("No Workspace")).id) })).status).toBe(403);
  });

  it("lets a host block nights on a stay's calendar", async () => {
    const host = await (await makeHost("Calendar Host", { verified: true })).actor();
    const token = await tokenFor(host.userId);
    const stay = await readyStay(host, { title: "Calendar cottage by the sea" });
    expect(((await call(stays.GET, "/api/v1/partner/stays", { token })).body.data!.items as { referenceId: string }[]).map((s) => s.referenceId)).toContain(stay);
    const month = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 7);
    const blocked = await call(blocks.POST, `/api/v1/partner/stays/${stay}/blocks`, { token, params: { ref: stay }, body: { from: `${month}-10`, to: `${month}-12`, reason: "Family visiting" } });
    expect(blocked.status).toBe(201);
    const cal = await call(calendar.GET, `/api/v1/partner/stays/${stay}/calendar?month=${month}`, { token, params: { ref: stay } });
    expect(cal.body.data!.blocks).toEqual([expect.objectContaining({ from: `${month}-10`, reason: "Family visiting" })]);
  });
});

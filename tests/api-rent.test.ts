import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as me from "@/app/api/v1/me/route";
import * as landlordInvitation from "@/app/api/v1/partner/landlord-invitations/[ref]/route";
import * as landlordBank from "@/app/api/v1/partner/landlord/bank/route";
import * as landlordPan from "@/app/api/v1/partner/landlord/pan/route";
import * as landlordProof from "@/app/api/v1/partner/landlord/properties/[ref]/proof/route";
import * as landlordProperty from "@/app/api/v1/partner/landlord/properties/[ref]/route";
import * as landlordRequest from "@/app/api/v1/partner/landlord/requests/[ref]/route";
import * as landlordHome from "@/app/api/v1/partner/landlord/route";
import * as landlordSettlements from "@/app/api/v1/partner/landlord/settlements/route";
import * as listingLandlord from "@/app/api/v1/partner/listings/[ref]/landlord/route";
import * as listingRent from "@/app/api/v1/partner/listings/[ref]/rent/route";
import * as listingTenancy from "@/app/api/v1/partner/listings/[ref]/tenancy/route";
import * as summary from "@/app/api/v1/partner/summary/route";
import * as tenancyAction from "@/app/api/v1/partner/tenancies/[ref]/route";
import * as rentPay from "@/app/api/v1/rent/charges/[ref]/pay/route";
import * as rentPayment from "@/app/api/v1/rent/payments/[ref]/route";
import * as rentReceipt from "@/app/api/v1/rent/receipts/[ref]/route";
import * as rent from "@/app/api/v1/rent/route";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { fakeWebhook } from "@/lib/payments/fake";
import { reviewOwnershipProof } from "@/lib/services/rent/admin";
import { acceptLandlordInvitation } from "@/lib/services/rent/landlords";
import { acceptTenancyInvitation } from "@/lib/services/rent/tenancies";
import { receiveWebhook } from "@/lib/services/stays/payments";
import { ctx, makeAdmin, makeAgent, makeOrg, makeUser, one } from "./support/factory";
import { readyRentListing } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-rent-api-"));

type Body = { data?: Record<string, unknown> & Record<string, any>; error?: Record<string, unknown> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Call<P> = { method?: string; token?: string; body?: unknown; raw?: Buffer; params?: P; headers?: Record<string, string> };
async function call<P>(handler: (request: Request, segment?: { params: Promise<P> }) => Promise<Response>, url: string, o: Call<P> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const body = o.raw ? new Uint8Array(o.raw) : o.body === undefined ? undefined : JSON.stringify(o.body);
  const response = await handler(new Request(`http://localhost:3000${url}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body }), o.params ? { params: Promise.resolve(o.params) } : undefined);
  return { status: response.status, body: (await response.json()) as Body };
}
async function tokenFor(userId: string) {
  const token = `t-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-session`;
  await one(sql`INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), ${userId}, ${token}, now() + interval '1 day') RETURNING id`);
  return token;
}
const tokenOf = (url: string) => url.split("/").pop()!;
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 32)]);

let agent: Actor;
let agentToken: string;
let listing: string;
let propertyRef: string;
let landlordToken: string;
let tenantToken: string;
let tenancyRef: string;
let ops: Actor;

afterAll(async () => {
  await db.execute(sql`DELETE FROM platform.system_settings WHERE key = 'payments.rent_online'`);
});

beforeAll(async () => {
  const org = await makeOrg("App Rent Brokerage");
  agent = await (await makeAgent(org.id, "App Rent Agent")).actor();
  agentToken = await tokenFor(agent.userId);
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  listing = await readyRentListing(agent, { title: "App rental flat", rent: 25000 });
  propertyRef = (await one<{ reference_id: string }>(sql`SELECT p.reference_id FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id WHERE l.reference_id = ${listing}`)).reference_id;
});

describe("the app, end to end", () => {
  it("an agent sees a rented property's landlord box and adds a new landlord", async () => {
    const s = await call(summary.GET, "/api/v1/partner/summary", { token: agentToken });
    expect(s.body.data!.can).toMatchObject({ rent: true });
    expect(s.body.data!.rent).toBeNull();
    const before = await call(listingRent.GET, `/api/v1/partner/listings/${listing}/rent`, { token: agentToken, params: { ref: listing } });
    expect(before.body.data).toMatchObject({ landlord: null, invitation: null, tenancy: null, can: { invite: true, tenancy: true } });
    const bad = await call(listingLandlord.POST, `/api/v1/partner/listings/${listing}/landlord`, { token: agentToken, params: { ref: listing }, body: { mode: "new", name: "", email: "x", phone: "1" } });
    expect(bad.status).toBe(422);
    const invite = await call(listingLandlord.POST, `/api/v1/partner/listings/${listing}/landlord`, { token: agentToken, params: { ref: listing }, body: { mode: "new", name: "Asha Owner", email: "asha.owner.app@example.test", phone: "9876533333" } });
    expect(invite.status).toBe(201);
    // A fresh link replaces the first.
    const inv = (await call(listingRent.GET, `/api/v1/partner/listings/${listing}/rent`, { token: agentToken, params: { ref: listing } })).body.data!.invitation;
    const again = await call(landlordInvitation.POST, "/", { token: agentToken, params: { ref: inv.referenceId }, body: { action: "resend" } });
    expect(again.body.data!.url).not.toBe(invite.body.data!.url);
    const done = await acceptLandlordInvitation(tokenOf(String(again.body.data!.url)), { sessionUserId: null, name: "Asha Owner", password: "a-strong-password-9", confirm: "a-strong-password-9", phone: "9876533333", ipKey: "10.0.0.20" }, ctx);
    expect(done.createdAccount).toBe(true);
    landlordToken = await tokenFor((await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = 'asha.owner.app@example.test'`)).id);
  });

  it("the landlord's tab: properties, bank account, PAN and proof, all from the app", async () => {
    const s = await call(summary.GET, "/api/v1/partner/summary", { token: landlordToken });
    expect(s.body.data).toMatchObject({ listings: null, leads: null, rent: { properties: 1, waiting: 0 } });
    const home = await call(landlordHome.GET, "/api/v1/partner/landlord", { token: landlordToken });
    expect(home.body.data!.properties).toHaveLength(1);
    expect(home.body.data!.bank).toBeNull();
    const bank = await call(landlordBank.PUT, "/", { token: landlordToken, method: "PUT", body: { method: "bank", holderName: "Asha Owner", accountNumber: "601234567890", confirmAccountNumber: "601234567890", ifsc: "ICIC0001234" } });
    expect(bank.body.data).toMatchObject({ status: "verified", accountLast4: "7890", bankName: "ICICI Bank" });
    expect((await call(landlordPan.PUT, "/", { token: landlordToken, method: "PUT", body: { pan: "PQRSX6789K" } })).status).toBe(200);
    const proof = await call(landlordProof.POST, `/?kind=sale_deed`, { token: landlordToken, params: { ref: propertyRef }, raw: PDF, headers: { "content-type": "application/pdf", "x-file-name": "deed.pdf" } });
    expect(proof.status).toBe(201);
    const detail = await call(landlordProperty.GET, "/", { token: landlordToken, params: { ref: propertyRef } });
    expect(detail.body.data!.property).toMatchObject({ status: "under_review", proof: { kind: "sale_deed" } });
    // The agent can't use the landlord's routes, nor read another's property.
    expect((await call(landlordHome.GET, "/", { token: agentToken })).status).toBe(403);
    expect((await call(landlordProperty.GET, "/", { token: agentToken, params: { ref: propertyRef } })).status).toBe(403);
    const link = await one<{ id: string }>(sql`SELECT pl.id FROM rent.property_landlords pl JOIN real_estate.properties p ON p.id = pl.property_id WHERE p.reference_id = ${propertyRef} AND pl.status <> 'ended'`);
    await reviewOwnershipProof(ops, link.id, "approve", "", ctx);
  });

  it("the agent sets up the tenancy; the landlord confirms in the app", async () => {
    const created = await call(listingTenancy.POST, "/", {
      token: agentToken,
      params: { ref: listing },
      body: { tenantName: "Ravi Renter", tenantEmail: "ravi.renter.app@example.test", tenantPhone: "9876544444", monthlyRent: "25000", dueDay: "10", deposit: "50000", startDate: "2026-10-01" },
    });
    expect(created.status).toBe(201);
    tenancyRef = String(created.body.data!.referenceId);
    expect((await call(summary.GET, "/", { token: landlordToken })).body.data!.rent).toMatchObject({ waiting: 1 });
    const accepted = await acceptTenancyInvitation(tokenOf(String(created.body.data!.url)), { sessionUserId: null, name: "Ravi Renter", password: "a-strong-password-8", confirm: "a-strong-password-8", phone: "9876544444", ipKey: "10.0.0.21" }, ctx);
    expect(accepted.createdAccount).toBe(true);
    tenantToken = await tokenFor((await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = 'ravi.renter.app@example.test'`)).id);
    // Only the landlord confirms; the agent's "confirm" is refused.
    expect((await call(tenancyAction.POST, "/", { token: agentToken, params: { ref: tenancyRef }, body: { action: "confirm" } })).status).toBe(403);
    expect((await call(tenancyAction.POST, "/", { token: landlordToken, params: { ref: tenancyRef }, body: { action: "confirm" } })).status).toBe(200);
    const panel = await call(listingRent.GET, "/", { token: agentToken, params: { ref: listing } });
    expect(panel.body.data!.tenancy).toMatchObject({ status: "active", monthlyRent: 25000, dueDay: 10 });
  });

  it("the tenant pays in the app and gets a receipt; the landlord sees it", async () => {
    expect((await call(me.GET, "/", { token: tenantToken })).body.data).toMatchObject({ tenant: true });
    const t = await one<{ id: string }>(sql`SELECT id FROM rent.tenancies WHERE reference_id = ${tenancyRef}`);
    await db.execute(sql`INSERT INTO rent.charges (id, tenancy_id, due_date, amount) VALUES (gen_random_uuid(), ${t.id}, (now() AT TIME ZONE 'Asia/Kolkata')::date + 3, 25000)`);
    const offline = await call(rent.GET, "/", { token: tenantToken });
    expect(offline.body.data).toMatchObject({ online: false });
    await db.execute(sql`INSERT INTO platform.system_settings (key, value) VALUES ('payments.rent_online', 'true'::jsonb) ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb`);
    const r = await call(rent.GET, "/", { token: tenantToken });
    expect(r.body.data!.online).toBe(true);
    const charge = r.body.data!.tenancies[0].charges.find((c: { status: string }) => c.status === "due");
    // Someone else can't pay it.
    expect((await call(rentPay.POST, "/", { token: landlordToken, method: "POST", params: { ref: charge.referenceId } })).status).toBe(404);
    const start = await call(rentPay.POST, "/", { token: tenantToken, method: "POST", params: { ref: charge.referenceId } });
    expect(start.status).toBe(201);
    expect(String(start.body.data!.checkout.url)).toMatch(/^http:\/\/localhost:3000\/pay\/test\//);
    const paymentRef = String(start.body.data!.paymentReferenceId);
    const hook = fakeWebhook(paymentRef, "upi", "auto", 25000);
    expect(await receiveWebhook("fake", hook.body, hook.headers)).toMatchObject({ status: 200 });
    expect((await call(rentPayment.GET, "/", { token: tenantToken, params: { ref: paymentRef } })).body.data).toMatchObject({ state: "paid", amount: 25000, landlordName: "Asha Owner" });
    expect((await call(rentReceipt.GET, "/", { token: tenantToken, params: { ref: paymentRef } })).body.data).toMatchObject({ landlordPan: "PQRSX6789K", amount: 25000 });
    expect((await call(rentReceipt.GET, "/", { token: landlordToken, params: { ref: paymentRef } })).status).toBe(404);
    const paid = await call(landlordSettlements.GET, "/", { token: landlordToken });
    expect(paid.body.data!.rows[0]).toMatchObject({ amount: 25000, status: "ready" });
  });

  it("an existing landlord is asked in the app and accepts there", async () => {
    const second = await readyRentListing(agent, { title: "Second app rental", rent: 15000 });
    const asked = await call(listingLandlord.POST, "/", { token: agentToken, params: { ref: second }, body: { mode: "existing", who: "asha.owner.app@example.test" } });
    expect(asked.body.data).toMatchObject({ landlordName: "Asha Owner" });
    const home = await call(landlordHome.GET, "/", { token: landlordToken });
    expect(home.body.data!.requests).toHaveLength(1);
    expect((await call(landlordRequest.POST, "/", { token: landlordToken, params: { ref: home.body.data!.requests[0].referenceId }, body: { accept: true } })).status).toBe(200);
    expect((await call(landlordHome.GET, "/", { token: landlordToken })).body.data!.properties).toHaveLength(2);
  });

  it("a customer with nothing to do with it is refused", async () => {
    const stranger = await makeUser("Rent Stranger");
    const token = await tokenFor(stranger.id);
    expect((await call(rent.GET, "/", { token })).body.data).toMatchObject({ tenancies: [] });
    expect((await call(listingRent.GET, "/", { token, params: { ref: listing } })).status).toBe(403);
    expect((await call(rentPayment.GET, "/", { token: (await tokenFor(stranger.id)), params: { ref: "RPY-00000000" } })).status).toBe(404);
  });
});

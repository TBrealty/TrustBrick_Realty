import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import * as bookingAction from "@/app/api/v1/partner/bookings/[ref]/actions/route";
import * as bookingConversation from "@/app/api/v1/partner/bookings/[ref]/conversation/route";
import * as booking from "@/app/api/v1/partner/bookings/[ref]/route";
import * as bookings from "@/app/api/v1/partner/bookings/route";
import * as conversationMessages from "@/app/api/v1/partner/conversations/[ref]/messages/route";
import * as conversations from "@/app/api/v1/partner/conversations/route";
import * as leadNotes from "@/app/api/v1/partner/leads/[ref]/notes/route";
import * as lead from "@/app/api/v1/partner/leads/[ref]/route";
import * as leadStatus from "@/app/api/v1/partner/leads/[ref]/status/route";
import * as leads from "@/app/api/v1/partner/leads/route";
import * as mediaItem from "@/app/api/v1/partner/listings/[ref]/media/[id]/route";
import * as mediaOrder from "@/app/api/v1/partner/listings/[ref]/media-order/route";
import * as media from "@/app/api/v1/partner/listings/[ref]/media/route";
import * as listing from "@/app/api/v1/partner/listings/[ref]/route";
import * as tourLink from "@/app/api/v1/partner/listings/[ref]/tour-link/route";
import * as listings from "@/app/api/v1/partner/listings/route";
import * as summary from "@/app/api/v1/partner/summary/route";
import * as visit from "@/app/api/v1/partner/visits/[ref]/route";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { createEnquiry } from "@/lib/services/crm";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createBooking } from "@/lib/services/stays/bookings";
import { sendGuestMessage } from "@/lib/services/stays/messages";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { ctx, makeAdmin, makeAgent, makeHost, makeOrg, makeUser, one } from "./support/factory";
import { readyRentListing, readyStay } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-partner-"));

type Call<P> = { method?: string; token?: string; body?: unknown; raw?: Buffer; params?: P; headers?: Record<string, string> };
async function call<P>(handler: (request: Request, segment?: { params: Promise<P> }) => Promise<Response>, url: string, o: Call<P> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const body = o.raw ? new Uint8Array(o.raw) : o.body === undefined ? undefined : JSON.stringify(o.body);
  const response = await handler(new Request(`http://localhost:3000${url}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body }), o.params ? { params: Promise.resolve(o.params) } : undefined);
  return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>; error?: Record<string, unknown> } };
}

/** An app session for someone, as the sign-in endpoint would give. */
async function tokenFor(userId: string) {
  const token = `t-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-session`;
  await one(sql`INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), ${userId}, ${token}, now() + interval '1 day') RETURNING id`);
  return token;
}

const day = (offset: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

let agent: Actor;
let agentToken: string;
let host: Actor;
let hostToken: string;
let moderator: Actor;
let rental: string;
let stay: string;

beforeAll(async () => {
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  agent = await (await makeAgent((await makeOrg("Partner Realty")).id, "Partner Agent")).actor();
  agentToken = await tokenFor(agent.userId);
  host = await (await makeHost("Partner Host", { verified: true })).actor();
  hostToken = await tokenFor(host.userId);
  rental = await readyRentListing(agent, { title: "Partner api flat" });
  await transitionListing(agent, rental, "submit", {}, ctx);
  await transitionListing(moderator, rental, "approve", { reason: "Checked the details and photos." }, ctx);
  stay = await readyStay(host, { title: "Partner api cottage", price: 3500, minNights: 1, maxNights: 10, maxGuests: 4 });
  await transitionListing(host, stay, "submit", {}, ctx);
  await transitionListing(moderator, stay, "approve", { reason: "Checked the details and photos." }, ctx);
});

describe("partner access", () => {
  it("needs a workspace", async () => {
    const customer = await makeUser("Plain Customer");
    expect((await call(summary.GET, "/api/v1/partner/summary", { token: await tokenFor(customer.id) })).status).toBe(403);
    expect((await call(summary.GET, "/api/v1/partner/summary")).status).toBe(401);
  });
});

describe("an agent's leads and visits", () => {
  it("sees a new enquiry, moves it along, notes it and confirms the visit", async () => {
    const customer = await makeUser("Lead Customer");
    const { leadReferenceId, visitReferenceId } = await createEnquiry({ userId: customer.id, email: customer.email }, rental, {
      name: "Lead Customer",
      phone: "98765 44444",
      message: "Can I see it on Saturday?",
      wantsVisit: true,
      visitDate: day(3),
      visitTime: "morning",
    });

    const home = await call(summary.GET, "/api/v1/partner/summary", { token: agentToken });
    expect(home.status).toBe(200);
    expect(home.body.data).toMatchObject({ leads: { new: 1, open: 1 }, visits: { upcoming: 1 }, bookings: { counts: { requests: 0 } } });

    const list = await call(leads.GET, "/api/v1/partner/leads?open=1", { token: agentToken });
    expect((list.body.data!.rows as { referenceId: string }[]).map((r) => r.referenceId)).toEqual([leadReferenceId]);

    expect((await call(leadStatus.POST, `/api/v1/partner/leads/${leadReferenceId}/status`, { token: agentToken, params: { ref: leadReferenceId }, body: { status: "converted" } })).status).toBe(409);
    const moved = await call(leadStatus.POST, `/api/v1/partner/leads/${leadReferenceId}/status`, { token: agentToken, params: { ref: leadReferenceId }, body: { status: "contacted", note: "Called back" } });
    expect(moved.body.data).toMatchObject({ status: "contacted" });
    const noted = await call(leadNotes.POST, `/api/v1/partner/leads/${leadReferenceId}/notes`, { token: agentToken, params: { ref: leadReferenceId }, body: { note: "Prefers mornings" } });
    expect((noted.body.data!.activities as { body: string }[])[0].body).toBe("Prefers mornings");

    const when = new Date(Date.now() + 3 * 86_400_000).toISOString();
    expect((await call(visit.POST, `/api/v1/partner/visits/${visitReferenceId}`, { token: agentToken, params: { ref: visitReferenceId! }, body: { action: "schedule", scheduledAt: when } })).status).toBe(200);
    const detail = await call(lead.GET, `/api/v1/partner/leads/${leadReferenceId}`, { token: agentToken, params: { ref: leadReferenceId } });
    expect(detail.body.data).toMatchObject({ status: "visit_scheduled", visits: [{ status: "scheduled" }] });
    // The customer is told, so their phone gets a push.
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${customer.id} AND type = 'visit_updated'`)).n).toBe(1);

    // Another agency's agent can't see it.
    const other = await (await makeAgent((await makeOrg("Other Partner Realty")).id, "Other Partner Agent")).actor();
    expect((await call(lead.GET, `/api/v1/partner/leads/${leadReferenceId}`, { token: await tokenFor(other.userId), params: { ref: leadReferenceId } })).status).toBe(404);
  });
});

describe("a host's bookings and inbox", () => {
  it("accepts a request and replies to the guest", async () => {
    const guest = await makeUser("Partner Guest");
    const { referenceId } = await createBooking({ userId: guest.id, email: guest.email }, stay, { checkIn: day(20), checkOut: day(22), adults: "2", children: "0", name: "Partner Guest", phone: "98765 55555", agree: "on" }, ctx);

    const home = await call(summary.GET, "/api/v1/partner/summary", { token: hostToken });
    expect(home.body.data).toMatchObject({ leads: null, bookings: { counts: { requests: 1 } } });
    const requests = await call(bookings.GET, "/api/v1/partner/bookings?group=requests", { token: hostToken });
    expect((requests.body.data!.rows as { referenceId: string }[]).map((r) => r.referenceId)).toContain(referenceId);

    const detail = await call(booking.GET, `/api/v1/partner/bookings/${referenceId}`, { token: hostToken, params: { ref: referenceId } });
    expect(detail.body.data!.actions).toEqual(expect.arrayContaining(["accept", "decline"]));
    expect((await call(bookingAction.POST, `/api/v1/partner/bookings/${referenceId}/actions`, { token: hostToken, params: { ref: referenceId }, body: { action: "guest_cancel" } })).status).toBe(403);
    const accepted = await call(bookingAction.POST, `/api/v1/partner/bookings/${referenceId}/actions`, { token: hostToken, params: { ref: referenceId }, body: { action: "accept" } });
    expect(accepted.body.data).toMatchObject({ status: "confirmed" });
    expect(accepted.body.data!.guestContact).toMatchObject({ phone: expect.any(String) });

    await sendGuestMessage({ userId: guest.id }, { listing: stay }, "What time can we check in?", ctx);
    const inbox = await call(conversations.GET, "/api/v1/partner/conversations?show=unread", { token: hostToken });
    expect(inbox.body.data).toMatchObject({ unread: 1 });
    const started = await call(bookingConversation.POST, `/api/v1/partner/bookings/${referenceId}/conversation`, { token: hostToken, params: { ref: referenceId } });
    const convo = String(started.body.data!.referenceId);
    const replied = await call(conversationMessages.POST, `/api/v1/partner/conversations/${convo}/messages`, { token: hostToken, params: { ref: convo }, body: { body: "From 2 pm." } });
    expect(replied.status).toBe(201);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${guest.id} AND type = 'host_message'`)).n).toBe(1);
  });
});

describe("a listing's tour from the phone", () => {
  it("uploads, names, orders and removes rooms, and sets the link, on a live listing", async () => {
    const list = await call(listings.GET, "/api/v1/partner/listings?q=Partner%20api%20flat", { token: agentToken });
    expect((list.body.data!.rows as { referenceId: string }[]).map((r) => r.referenceId)).toContain(rental);
    const before = await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token: agentToken, params: { ref: rental } });
    expect(before.body.data).toMatchObject({ status: "published", tourMode: "live", tour: { rooms: [] } });

    const pano = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: "#6f8a7a" } }).jpeg().toBuffer();
    const flat = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#6f8a7a" } }).jpeg().toBuffer();
    const upload = (raw: Buffer, name: string) =>
      call(media.POST, `/api/v1/partner/listings/${rental}/media?kind=panorama`, { token: agentToken, params: { ref: rental }, raw, method: "POST", headers: { "x-file-name": encodeURIComponent(name), "content-type": "image/jpeg" } });
    expect((await upload(flat, "flat.jpg")).status).toBe(422);
    const hall = await upload(pano, "hall.jpg");
    const bedroom = await upload(pano, "bedroom.jpg");
    expect(hall.status).toBe(201);
    const hallId = String(hall.body.data!.id);
    const bedroomId = String(bedroom.body.data!.id);

    await call(mediaItem.PUT, `/api/v1/partner/listings/${rental}/media/${hallId}`, { method: "PUT", token: agentToken, params: { ref: rental, id: hallId }, body: { name: "Hall" } });
    await call(mediaOrder.PUT, `/api/v1/partner/listings/${rental}/media-order`, { method: "PUT", token: agentToken, params: { ref: rental }, body: { ids: [bedroomId, hallId] } });
    expect((await call(tourLink.PUT, `/api/v1/partner/listings/${rental}/tour-link`, { method: "PUT", token: agentToken, params: { ref: rental }, body: { url: "https://kuula.co/share/N1kwH" } })).body.data).toEqual({
      link: { provider: "Kuula", url: "https://kuula.co/share/N1kwH" },
    });
    const after = await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token: agentToken, params: { ref: rental } });
    expect((after.body.data!.tour as { rooms: { id: string; name: string }[] }).rooms.map((r) => [r.id, r.name])).toEqual([
      [bedroomId, ""],
      [hallId, "Hall"],
    ]);
    expect(after.body.data).toMatchObject({ tourReviewWaiting: true });

    expect((await call(mediaItem.DELETE, `/api/v1/partner/listings/${rental}/media/${bedroomId}`, { method: "DELETE", token: agentToken, params: { ref: rental, id: bedroomId } })).status).toBe(200);
    // Photos still need the listing withdrawn first.
    const photo = await call(media.POST, `/api/v1/partner/listings/${rental}/media?kind=photo`, { token: agentToken, params: { ref: rental }, raw: flat, method: "POST", headers: { "content-type": "image/jpeg" } });
    expect(photo.status).toBe(409);
  });
});

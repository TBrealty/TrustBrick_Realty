import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import * as signIn from "@/app/api/v1/auth/sign-in/route";
import * as signOut from "@/app/api/v1/auth/sign-out/route";
import * as signUp from "@/app/api/v1/auth/sign-up/route";
import * as bookmark from "@/app/api/v1/bookmarks/[ref]/route";
import * as bookmarks from "@/app/api/v1/bookmarks/route";
import * as devices from "@/app/api/v1/devices/route";
import * as enquiries from "@/app/api/v1/listings/[ref]/enquiries/route";
import * as detail from "@/app/api/v1/listings/[ref]/route";
import * as tourRoute from "@/app/api/v1/listings/[ref]/tour/route";
import * as search from "@/app/api/v1/listings/route";
import * as me from "@/app/api/v1/me/route";
import * as notificationsRead from "@/app/api/v1/notifications/read/route";
import * as notificationsRoute from "@/app/api/v1/notifications/route";
import * as trial from "@/app/api/v1/subscription/trial/route";
import * as conversationMessages from "@/app/api/v1/conversations/[ref]/messages/route";
import * as conversations from "@/app/api/v1/conversations/route";
import * as availability from "@/app/api/v1/listings/[ref]/availability/route";
import * as book from "@/app/api/v1/listings/[ref]/bookings/route";
import * as messageHost from "@/app/api/v1/listings/[ref]/messages/route";
import * as quote from "@/app/api/v1/listings/[ref]/quote/route";
import * as tripCancel from "@/app/api/v1/trips/[ref]/cancel/route";
import * as trip from "@/app/api/v1/trips/[ref]/route";
import * as trips from "@/app/api/v1/trips/route";
import { sendHostMessage } from "@/lib/services/stays/messages";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { uploadListingMedia } from "@/lib/services/media";
import { notify } from "@/lib/services/notifications";
import { deliverPendingPush } from "@/lib/services/push";
import { ctx, makeAdmin, makeAgent, makeHost, makeOrg, one } from "./support/factory";
import { readyRentListing, readyStay } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-api-"));

type Call<P> = { method?: string; token?: string; body?: unknown; params?: P; headers?: Record<string, string>; ip?: string };

/** Calls a route handler the way the app would. */
async function call<P>(handler: (request: Request, segment?: { params: Promise<P> }) => Promise<Response>, url: string, o: Call<P> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": o.ip ?? `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const response = await handler(
    new Request(`http://localhost:3000${url}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }),
    o.params ? { params: Promise.resolve(o.params) } : undefined,
  );
  return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown> & { [k: string]: unknown }; error?: Record<string, unknown> } };
}

const PASSWORD = "a-long-test-password-2026";
let agent: Actor;
let moderator: Actor;
let ref: string;

/** A person who signed up through the API and confirmed their email; returns their token. */
async function signedUpUser(name: string) {
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${Math.random().toString(36).slice(2, 8)}@example.test`;
  const up = await call(signUp.POST, "/api/v1/auth/sign-up", { method: "POST", body: { name, email, password: PASSWORD } });
  expect(up.status).toBe(201);
  await db.execute(sql`UPDATE identity.users SET email_verified = true WHERE email = ${email}`);
  const inn = await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", body: { email, password: PASSWORD } });
  expect(inn.status).toBe(200);
  return { email, token: String(inn.body.data!.token) };
}

beforeAll(async () => {
  const org = await makeOrg("Api Realty");
  agent = await (await makeAgent(org.id, "Api Agent")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  ref = await readyRentListing(agent, { title: "Api test flat with a tour" });
  const panorama = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: "#889977" } }).jpeg().toBuffer();
  await uploadListingMedia(agent, ref, "panorama", new Blob([new Uint8Array(panorama)]).stream(), "hall.jpg");
  await transitionListing(agent, ref, "submit", {}, ctx);
  await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
});

describe("signing in from the app", () => {
  it("signs up, refuses an unconfirmed email, then signs in and returns a token", async () => {
    const email = `app.user.${Math.random().toString(36).slice(2, 8)}@example.test`;
    expect((await call(signUp.POST, "/api/v1/auth/sign-up", { method: "POST", body: { name: "App User", email, password: "short" } })).status).toBe(422);
    expect((await call(signUp.POST, "/api/v1/auth/sign-up", { method: "POST", body: { name: "App User", email, password: PASSWORD } })).status).toBe(201);

    const unconfirmed = await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", body: { email, password: PASSWORD } });
    expect(unconfirmed).toMatchObject({ status: 403, body: { error: { reason: "EMAIL_NOT_VERIFIED" } } });

    await db.execute(sql`UPDATE identity.users SET email_verified = true WHERE email = ${email}`);
    expect((await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", body: { email, password: "wrong-password" } })).status).toBe(401);
    const ok = await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", body: { email, password: PASSWORD } });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ user: { email, name: "App User" } });
    expect(String(ok.body.data!.token).length).toBeGreaterThan(20);

    const profile = await call(me.GET, "/api/v1/me", { token: String(ok.body.data!.token) });
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ user: { email }, workspaces: [], activeWorkspace: null, plan: { code: "customer_free" } });
  });

  it("rejects a missing or made-up token, and a signed-out one", async () => {
    expect((await call(me.GET, "/api/v1/me")).status).toBe(401);
    expect((await call(me.GET, "/api/v1/me", { token: "not-a-real-session-token" })).status).toBe(401);
    const { token } = await signedUpUser("Signing Out");
    expect((await call(signOut.POST, "/api/v1/auth/sign-out", { method: "POST", token })).status).toBe(200);
    expect((await call(me.GET, "/api/v1/me", { token })).status).toBe(401);
  });

  it("rate-limits sign-in attempts from one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", ip: "10.250.1.1", body: { email: "nobody@example.test", password: "x" } })).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("lets agents pick their workspace with a header", async () => {
    const membership = await one<{ id: string }>(sql`SELECT m.id FROM orgs.memberships m WHERE m.user_id = ${agent.userId}`);
    const session = await one<{ token: string }>(sql`
      INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), ${agent.userId}, ${`agent-${Math.random().toString(36).slice(2)}-token-value`}, now() + interval '1 day') RETURNING token`);
    const profile = await call(me.GET, "/api/v1/me", { token: session.token, headers: { "x-trustbrick-workspace": membership.id } });
    expect(profile.body.data).toMatchObject({ activeWorkspace: membership.id });
    expect((profile.body.data!.workspaces as unknown[]).length).toBe(1);
  });
});

describe("browsing", () => {
  it("searches with the website's filters, and opens a listing", async () => {
    const results = await call(search.GET, "/api/v1/listings?kind=rent&tour=1&q=Api%20test%20flat");
    expect(results.status).toBe(200);
    const items = results.body.data!.items as { referenceId: string; tour: unknown; saved: boolean }[];
    expect(items.map((i) => i.referenceId)).toContain(ref);
    expect(items.find((i) => i.referenceId === ref)).toMatchObject({ tour: { rooms: 1 }, saved: false });
    expect((await call(search.GET, "/api/v1/listings?kind=castles")).status).toBe(422);

    const page = await call(detail.GET, `/api/v1/listings/${ref}`, { params: { ref } });
    expect(page.body.data).toMatchObject({ referenceId: ref, tourAccess: "sign_in_required", saved: false });
    expect(page.body.data!.contact).toMatchObject({ hasOpenEnquiry: false });
    expect((await call(detail.GET, "/api/v1/listings/LST-NOPE1234", { params: { ref: "LST-NOPE1234" } })).status).toBe(404);
  });

  it("opens the tour for Plus members only", async () => {
    expect(await call(tourRoute.GET, `/api/v1/listings/${ref}/tour`, { params: { ref } })).toMatchObject({ status: 401, body: { error: { reason: "SIGN_IN_REQUIRED" } } });
    const { token } = await signedUpUser("Tour Viewer");
    expect(await call(tourRoute.GET, `/api/v1/listings/${ref}/tour`, { params: { ref }, token })).toMatchObject({ status: 403, body: { error: { reason: "PLUS_REQUIRED" } } });

    const started = await call(trial.POST, "/api/v1/subscription/trial", { method: "POST", token, body: { plan: "customer_plus", cycle: "monthly" } });
    expect(started.status).toBe(201);
    const tour = await call(tourRoute.GET, `/api/v1/listings/${ref}/tour`, { params: { ref }, token });
    expect(tour.status).toBe(200);
    expect((tour.body.data!.rooms as { url: string }[])[0].url).toMatch(/^\/media\//);
    expect((await call(detail.GET, `/api/v1/listings/${ref}`, { params: { ref }, token })).body.data).toMatchObject({ tourAccess: "open" });
  });

  it("saves homes and sends enquiries", async () => {
    const { token } = await signedUpUser("Saver");
    expect((await call(bookmark.PUT, `/api/v1/bookmarks/${ref}`, { method: "PUT", params: { ref } })).status).toBe(401);
    expect((await call(bookmark.PUT, `/api/v1/bookmarks/${ref}`, { method: "PUT", params: { ref }, token })).body.data).toEqual({ saved: true });
    const saved = await call(bookmarks.GET, "/api/v1/bookmarks", { token });
    expect((saved.body.data!.items as { referenceId: string }[]).map((i) => i.referenceId)).toContain(ref);
    await call(bookmark.DELETE, `/api/v1/bookmarks/${ref}`, { method: "DELETE", params: { ref }, token });
    expect(((await call(bookmarks.GET, "/api/v1/bookmarks", { token })).body.data!.items as unknown[]).length).toBe(0);

    const bad = await call(enquiries.POST, `/api/v1/listings/${ref}/enquiries`, { method: "POST", params: { ref }, token, body: { name: "", phone: "1" } });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error!.fieldErrors as object)).toContain("name");
    const sent = await call(enquiries.POST, `/api/v1/listings/${ref}/enquiries`, {
      method: "POST",
      params: { ref },
      token,
      body: { name: "Saver", phone: "+91 98765 43210", message: "Is it still available?", wantsVisit: false },
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data!.leadReferenceId).toMatch(/^LEAD?-|^[A-Z]+-/);
  });
});

describe("push notifications", () => {
  it("registers a phone, sends to it, and stops when the app signs out", async () => {
    const { email, token } = await signedUpUser("Push Person");
    const user = await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = ${email}`);
    expect((await call(devices.POST, "/api/v1/devices", { method: "POST", token, body: { token: "not-a-push-token", platform: "android" } })).status).toBe(422);
    const pushToken = `ExponentPushToken[${Math.random().toString(36).slice(2, 14)}xyz]`;
    expect((await call(devices.POST, "/api/v1/devices", { method: "POST", token, body: { token: pushToken, platform: "android", appVersion: "1.0.0" } })).status).toBe(201);

    await deliverPendingPush(); // whatever was waiting from other tests
    await notify(db, [user.id], { type: "booking_confirmed", title: "Your stay is confirmed", body: "Garden villa, 12–14 Nov", link: "/account/bookings" });
    expect(await deliverPendingPush()).toMatchObject({ notifications: 1, messages: 1 });
    expect(await deliverPendingPush()).toMatchObject({ notifications: 0, messages: 0 }); // never twice

    const list = await call(notificationsRoute.GET, "/api/v1/notifications", { token });
    expect(list.body.data).toMatchObject({ unread: 1 });
    expect((await call(notificationsRead.POST, "/api/v1/notifications/read", { method: "POST", token, body: {} })).body.data).toEqual({ unread: 0 });

    // Signing out removes the phone with its session.
    await call(signOut.POST, "/api/v1/auth/sign-out", { method: "POST", token });
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.push_devices WHERE token = ${pushToken}`)).n).toBe(0);
    await notify(db, [user.id], { type: "booking_confirmed", title: "Another", link: "/account/bookings" });
    expect(await deliverPendingPush()).toMatchObject({ notifications: 1, messages: 0 });
  });
});

describe("stays and messages", () => {
  const day = (offset: number) => {
    const d = new Date(`${todayInIndia()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  let host: Actor;
  let stay: string;

  beforeAll(async () => {
    host = await (await makeHost("Api Host", { verified: true })).actor();
    stay = await readyStay(host, { title: "Api test cottage", price: 3000, minNights: 1, maxNights: 10, maxGuests: 4 });
    await transitionListing(host, stay, "submit", {}, ctx);
    await transitionListing(moderator, stay, "approve", { reason: "Checked the details and photos." }, ctx);
  });

  it("quotes, requests a stay, and lists and cancels the trip", async () => {
    const { token } = await signedUpUser("Api Guest");
    const dates = { checkIn: day(30), checkOut: day(32), adults: 2 };
    const priced = await call(quote.POST, `/api/v1/listings/${stay}/quote`, { method: "POST", params: { ref: stay }, body: dates });
    expect(priced.body.data).toMatchObject({ ok: true, nights: 2 });
    expect((await call(quote.POST, `/api/v1/listings/${stay}/quote`, { method: "POST", params: { ref: stay }, body: { ...dates, adults: 9 } })).body.data).toMatchObject({ ok: false, field: "adults" });

    expect((await call(book.POST, `/api/v1/listings/${stay}/bookings`, { method: "POST", params: { ref: stay }, token, body: { ...dates, name: "Api Guest", phone: "98765 11111" } })).status).toBe(422); // didn't agree
    const booked = await call(book.POST, `/api/v1/listings/${stay}/bookings`, { method: "POST", params: { ref: stay }, token, body: { ...dates, name: "Api Guest", phone: "98765 11111", agree: true } });
    expect(booked.status).toBe(201);
    const ref = String(booked.body.data!.referenceId);
    // A request doesn't hold the dates until the host accepts it.
    expect((await call(availability.GET, `/api/v1/listings/${stay}/availability`, { params: { ref: stay } })).body.data).toEqual({ unavailable: [] });

    const list = await call(trips.GET, "/api/v1/trips", { token });
    expect((list.body.data!.items as { referenceId: string }[]).map((t) => t.referenceId)).toContain(ref);
    const detail = await call(trip.GET, `/api/v1/trips/${ref}`, { params: { ref }, token });
    expect(detail.body.data).toMatchObject({ referenceId: ref, address: null, canCancel: true });
    const cancelled = await call(tripCancel.POST, `/api/v1/trips/${ref}/cancel`, { method: "POST", params: { ref }, token, body: { reason: "Plans changed" } });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data!.status).not.toBe("requested");
    // Someone else's trip is invisible.
    const other = await signedUpUser("Api Other Guest");
    expect((await call(trip.GET, `/api/v1/trips/${ref}`, { params: { ref }, token: other.token })).status).toBe(404);
  });

  it("messages the host, and gets their reply as a notification", async () => {
    const { email, token } = await signedUpUser("Api Chatter");
    const sent = await call(messageHost.POST, `/api/v1/listings/${stay}/messages`, { method: "POST", params: { ref: stay }, token, body: { body: "Is there parking?" } });
    expect(sent.status).toBe(201);
    const conversation = String(sent.body.data!.referenceId);
    const inbox = await call(conversations.GET, "/api/v1/conversations", { token });
    expect((inbox.body.data!.items as { referenceId: string }[]).map((c) => c.referenceId)).toContain(conversation);

    await sendHostMessage(host, conversation, "Yes, one covered spot.");
    const guest = await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = ${email}`);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${guest.id} AND type = 'host_message'`)).n).toBe(1);

    const polled = await call(conversationMessages.GET, `/api/v1/conversations/${conversation}/messages?after=1`, { params: { ref: conversation }, token });
    expect((polled.body.data!.messages as { body: string; mine: boolean }[]).map((m) => [m.body, m.mine])).toEqual([["Yes, one covered spot.", false]]);
    expect((await call(conversationMessages.POST, `/api/v1/conversations/${conversation}/messages`, { method: "POST", params: { ref: conversation }, token, body: { body: "  " } })).status).toBe(422);
  });
});

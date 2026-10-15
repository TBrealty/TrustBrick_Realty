import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as discard from "@/app/api/v1/partner/captures/[id]/route";
import * as finish from "@/app/api/v1/partner/captures/[id]/finish/route";
import * as shot from "@/app/api/v1/partner/captures/[id]/shots/[index]/route";
import * as captures from "@/app/api/v1/partner/listings/[ref]/captures/route";
import * as listing from "@/app/api/v1/partner/listings/[ref]/route";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { processCaptures } from "@/lib/services/tour-captures";
import { storage } from "@/lib/storage";
import { ctx, makeAdmin, makeAgent, makeOrg, one } from "./support/factory";
import { readyRentListing } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-captures-"));
process.env.STITCHER_URL = "http://stitcher.test";

type Call<P> = { method?: string; token?: string; body?: unknown; raw?: Buffer; params?: P };
async function call<P>(handler: (request: Request, segment?: { params: Promise<P> }) => Promise<Response>, url: string, o: Call<P> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.raw) headers["content-type"] = "image/jpeg";
  const body = o.raw ? new Uint8Array(o.raw) : o.body === undefined ? undefined : JSON.stringify(o.body);
  const response = await handler(new Request(`http://localhost:3000${url}`, { method: o.method ?? (body ? "POST" : "GET"), headers, body }), o.params ? { params: Promise.resolve(o.params) } : undefined);
  return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>; error?: Record<string, unknown> } };
}

async function tokenFor(userId: string) {
  const token = `t-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-session`;
  await one(sql`INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (gen_random_uuid(), ${userId}, ${token}, now() + interval '1 day') RETURNING id`);
  return token;
}

/** The stitching service, played by the test: answers with a 2:1 panorama, an error, or nothing. */
function stitcher(answer: "panorama" | "cannot" | "down") {
  const real = globalThis.fetch;
  const seen: { shots: number; hfov: number }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("http://stitcher.test")) return real(input, init);
    const payload = JSON.parse(String(init?.body)) as { hfov: number; shots: unknown[] };
    seen.push({ shots: payload.shots.length, hfov: payload.hfov });
    if (answer === "down") throw new TypeError("fetch failed");
    if (answer === "cannot") return Response.json({ error: "Too few matches between the photos." }, { status: 422 });
    const pano = await sharp({ create: { width: 4096, height: 2048, channels: 3, background: "#7a8f9c" } }).jpeg().toBuffer();
    return new Response(new Uint8Array(pano), { headers: { "content-type": "image/jpeg", "x-stitch-info": JSON.stringify({ photos: payload.shots.length, aligned: true }) } });
  });
  return seen;
}

let agent: Actor;
let token: string;
let rental: string;
let photo: Buffer;

beforeAll(async () => {
  const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  agent = await (await makeAgent((await makeOrg("Capture Realty")).id, "Capture Agent")).actor();
  token = await tokenFor(agent.userId);
  rental = await readyRentListing(agent, { title: "Capture flat" });
  await transitionListing(agent, rental, "submit", {}, ctx);
  await transitionListing(moderator, rental, "approve", { reason: "Checked the details and photos." }, ctx);
  photo = await sharp({ create: { width: 1500, height: 2000, channels: 3, background: "#b4a38e" } }).jpeg().toBuffer();
});

afterEach(() => vi.restoreAllMocks());

/** Starts a capture and sends all its photos, as the app does. */
async function capture(roomName: string, shotCount = 14) {
  const started = await call(captures.POST, `/api/v1/partner/listings/${rental}/captures`, { token, params: { ref: rental }, body: { roomName, hfov: 52, shotCount } });
  expect(started.status).toBe(201);
  const id = String(started.body.data!.id);
  for (let i = 0; i < shotCount; i++) {
    const yaw = (i % 12) * 30;
    const sent = await call(shot.PUT, `/api/v1/partner/captures/${id}/shots/${i}?yaw=${yaw}&pitch=${i < 12 ? 0 : i === 12 ? 90 : -90}&roll=0.5`, { method: "PUT", token, params: { id, index: String(i) }, raw: photo });
    expect(sent.status).toBe(200);
  }
  return id;
}

describe("360° photos from the guided camera", () => {
  it("collects the photos, then the stitched panorama joins the tour under the room's name", async () => {
    const seen = stitcher("panorama");
    const id = await capture("Living room");
    // Sending a photo again replaces it rather than adding one.
    await call(shot.PUT, `/api/v1/partner/captures/${id}/shots/3?yaw=91&pitch=1&roll=0`, { method: "PUT", token, params: { id, index: "3" }, raw: photo });
    const done = await call(finish.POST, `/api/v1/partner/captures/${id}/finish`, { token, params: { id } });
    expect(done.body.data).toMatchObject({ status: "queued", shots: 14, shotCount: 14, roomName: "Living room" });

    const editor = await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token, params: { ref: rental } });
    expect(editor.body.data!.captures).toEqual([expect.objectContaining({ id, status: "queued" })]);

    expect(await processCaptures()).toBe(1);
    expect(seen).toEqual([{ shots: 14, hfov: 52 }]);
    const row = await one<{ status: string; media_id: string; shots: { key: string; yaw: number }[] }>(sql`SELECT status, media_id, shots FROM marketplace.tour_captures WHERE id = ${id}`);
    expect(row.status).toBe("done");
    expect(row.shots.find((s) => s.key.endsWith("/003.jpg"))?.yaw).toBe(91);
    // The panorama is a normal 360° room of the tour, named, and the separate photos are gone.
    const room = await one<{ media_type: string; alt_text: string; width: number }>(sql`SELECT media_type, alt_text, width FROM real_estate.media WHERE id = ${row.media_id}`);
    expect(room).toEqual({ media_type: "panorama", alt_text: "Living room", width: 4096 });
    expect(await storage().read(row.shots[0].key)).toBeNull();
    // On a live listing, it goes to review like any tour change, and the agent hears it's ready.
    const after = await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token, params: { ref: rental } });
    expect(after.body.data).toMatchObject({ captures: [], tourReviewWaiting: true });
    expect((after.body.data!.tour as { rooms: { name: string }[] }).rooms.map((r) => r.name)).toContain("Living room");
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${agent.userId} AND type = 'tour_capture' AND title LIKE '%Living room%ready%'`)).n).toBe(1);
  });

  it("can't be finished before the photos arrive, and only its taker can add to it", async () => {
    const started = await call(captures.POST, `/api/v1/partner/listings/${rental}/captures`, { token, params: { ref: rental }, body: { roomName: "Kitchen", hfov: 52, shotCount: 26 } });
    const id = String(started.body.data!.id);
    expect((await call(finish.POST, `/api/v1/partner/captures/${id}/finish`, { token, params: { id } })).status).toBe(409);
    const other = await (await makeAgent((await makeOrg("Other Capture Realty")).id, "Other Capture Agent")).actor();
    const stranger = await call(shot.PUT, `/api/v1/partner/captures/${id}/shots/0?yaw=0&pitch=0`, { method: "PUT", token: await tokenFor(other.userId), params: { id, index: "0" }, raw: photo });
    expect(stranger.status).toBe(404);
    const outside = await call(shot.PUT, `/api/v1/partner/captures/${id}/shots/26?yaw=0&pitch=0`, { method: "PUT", token, params: { id, index: "26" }, raw: photo });
    expect(outside.status).toBe(422);
    const badAngle = await call(shot.PUT, `/api/v1/partner/captures/${id}/shots/0?yaw=0&pitch=120`, { method: "PUT", token, params: { id, index: "0" }, raw: photo });
    expect(badAngle.status).toBe(422);
    expect((await call(discard.DELETE, `/api/v1/partner/captures/${id}`, { method: "DELETE", token, params: { id } })).status).toBe(200);
    expect((await call(captures.POST, `/api/v1/partner/listings/${rental}/captures`, { token, params: { ref: rental }, body: { roomName: "Too few", hfov: 52, shotCount: 4 } })).status).toBe(422);
  });

  it("waits when the stitching service is down, and gives up with a notification when the photos can't be joined", async () => {
    stitcher("down");
    const id = await capture("Bedroom");
    await call(finish.POST, `/api/v1/partner/captures/${id}/finish`, { token, params: { id } });
    await processCaptures();
    expect(await one(sql`SELECT status, attempts FROM marketplace.tour_captures WHERE id = ${id}`)).toEqual({ status: "queued", attempts: 1 });

    vi.restoreAllMocks();
    stitcher("cannot");
    await processCaptures();
    const failed = await one<{ status: string; error: string; shots: { key: string }[] }>(sql`SELECT status, error, shots FROM marketplace.tour_captures WHERE id = ${id}`);
    expect(failed).toMatchObject({ status: "failed", error: "Too few matches between the photos." });
    expect(await storage().read(failed.shots[0].key)).toBeNull();
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${agent.userId} AND type = 'tour_capture' AND title LIKE '%Bedroom%couldn%'`)).n).toBe(1);
    // It shows in the editor until dismissed.
    const editor = await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token, params: { ref: rental } });
    expect(editor.body.data!.captures).toEqual([expect.objectContaining({ id, status: "failed" })]);
    await call(discard.DELETE, `/api/v1/partner/captures/${id}`, { method: "DELETE", token, params: { id } });
    expect((await call(listing.GET, `/api/v1/partner/listings/${rental}`, { token, params: { ref: rental } })).body.data!.captures).toEqual([]);
  });
});

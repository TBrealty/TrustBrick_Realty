import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseFilters } from "@/lib/listings/filters";
import { getListing, searchListings } from "@/lib/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { listListingsForActor, listingTableFilters } from "@/lib/services/listings/queries";
import { deleteListingMedia, resolveMediaForServing, updateMediaAlt, uploadListingMedia } from "@/lib/services/media";
import { startTrial } from "@/lib/services/subscriptions";
import { decideTourReview } from "@/lib/services/tour-review";
import { canViewTour, tourDataForProperty, updateTourLink } from "@/lib/services/tours";
import { describeTour, glbProblem, isPanoramaShape, parseTourLink } from "@/lib/tours/terms";
import { ctx, makeAdmin, makeAgent, makeOrg, makeUser, one, person, statusOf } from "./support/factory";
import { readyRentListing } from "./support/listings";

process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "tb-tours-"));

const stream = (b: Buffer) => new Blob([new Uint8Array(b)]).stream();
const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));

/** The smallest valid binary glTF: a header and one JSON chunk. */
function glb(options: { lie?: boolean } = {}) {
  let json = Buffer.from('{"asset":{"version":"2.0"}}');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + (options.lie ? 100 : 0), 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json]);
}

const pano = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#7a8a6b" } }).jpeg().toBuffer();

let agent: Actor;
let moderator: Actor;
let ref: string;
let propertyId: string;

beforeAll(async () => {
  const org = await makeOrg("Tour Realty");
  agent = await (await makeAgent(org.id, "Tour Agent")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  ref = await readyRentListing(agent, { title: "Tour test flat" });
  propertyId = (await one<{ property_id: string }>(sql`SELECT property_id FROM marketplace.listings WHERE reference_id = ${ref}`)).property_id;
});

describe("the rules", () => {
  it("knows a 360° photo by its shape", () => {
    expect(isPanoramaShape(6000, 3000)).toBe(true);
    expect(isPanoramaShape(5376, 2688)).toBe(true);
    expect(isPanoramaShape(4000, 3000)).toBe(false);
    expect(isPanoramaShape(3000, 3000)).toBe(false);
  });

  it("checks a .glb header against the file", () => {
    expect(glbProblem(glb())).toBeNull();
    expect(glbProblem(glb({ lie: true }))).toMatch(/incomplete/);
    expect(glbProblem(Buffer.from("not a model at all, really not"))).toMatch(/isn't a .glb/);
  });

  it("accepts tour links only from known providers, rebuilt from their ID", () => {
    expect(parseTourLink("https://my.matterport.com/show/?m=SxQL3iGyoDo&play=1&utm=x")).toEqual({
      provider: expect.objectContaining({ name: "Matterport" }),
      url: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    });
    expect(parseTourLink(" https://kuula.co/share/collection/7lVqF?fs=1 ")?.url).toBe("https://kuula.co/share/collection/7lVqF");
    expect(parseTourLink("https://kuula.co/share/N1kwH")?.url).toBe("https://kuula.co/share/N1kwH");
    expect(parseTourLink("https://app.cloudpano.com/tours/abc123XYZ")?.provider.name).toBe("CloudPano");
    for (const bad of [
      "http://my.matterport.com/show/?m=SxQL3iGyoDo",
      "https://my.matterport.com.evil.example/show/?m=SxQL3iGyoDo",
      "https://evil.example/kuula.co/share/abc",
      "javascript:alert(1)",
      "https://my.matterport.com/show/?m=<script>",
      "https://user:pw@kuula.co/share/abcd",
      "https://kuula.co/share/abcd/extra",
      "not a link",
    ]) {
      expect(parseTourLink(bad)).toBeNull();
    }
  });

  it("describes what a tour has", () => {
    expect(describeTour({ rooms: 1, model: false, link: null })).toBe("360° tour of 1 room");
    expect(describeTour({ rooms: 4, model: true, link: "Matterport" })).toBe("360° tour of 4 rooms, 3D model and 3D tour on Matterport");
  });
});

describe("adding a tour", () => {
  it("takes 360° photos, and turns away ordinary photos", async () => {
    const item = await uploadListingMedia(agent, ref, "panorama", stream(await pano(4400, 2200)), "living.jpg");
    expect(item.kind).toBe("panorama");
    expect([item.width, item.height]).toEqual([4400, 2200]);
    // The viewer gets the 4K rendition; the thumbnail is small.
    expect(item.url).toMatch(/\/w4096\.webp$/);
    expect(item.thumbnailUrl).toMatch(/\/w640\.webp$/);
    expect(await code(uploadListingMedia(agent, ref, "panorama", stream(await pano(1600, 1200)), "flat.jpg"))).toBe("VALIDATION_ERROR");
    expect(await code(uploadListingMedia(agent, ref, "panorama", stream(await pano(1200, 600)), "small.jpg"))).toBe("VALIDATION_ERROR");
  });

  it("takes one .glb model, and checks it", async () => {
    expect(await code(uploadListingMedia(agent, ref, "model_3d", stream(glb({ lie: true })), "broken.glb"))).toBe("VALIDATION_ERROR");
    expect(await code(uploadListingMedia(agent, ref, "model_3d", stream(await pano(4000, 2000)), "image.glb"))).toBe("VALIDATION_ERROR");
    const model = await uploadListingMedia(agent, ref, "model_3d", stream(glb()), "flat.glb");
    expect(model.kind).toBe("model_3d");
    expect(model.mimeType).toBe("model/gltf-binary");
    expect(await code(uploadListingMedia(agent, ref, "model_3d", stream(glb()), "second.glb"))).toBe("VALIDATION_ERROR");
  });

  it("saves a hosted tour link in its clean form, and clears it", async () => {
    expect(await code(updateTourLink(agent, ref, "https://example.com/tour"))).toBe("VALIDATION_ERROR");
    expect((await updateTourLink(agent, ref, "https://my.matterport.com/show/?m=SxQL3iGyoDo&brand=0"))?.url).toBe("https://my.matterport.com/show/?m=SxQL3iGyoDo");
    const stored = await one<{ tour_url: string }>(sql`SELECT tour_url FROM real_estate.properties WHERE id = ${propertyId}`);
    expect(stored.tour_url).toBe("https://my.matterport.com/show/?m=SxQL3iGyoDo");
    expect(await updateTourLink(agent, ref, "")).toBeNull();
    await updateTourLink(agent, ref, "https://kuula.co/share/N1kwH");
  });

  it("is only for the listing's own team", async () => {
    const other = await (await makeAgent((await makeOrg("Other Realty")).id, "Other Agent")).actor();
    expect(await code(updateTourLink(other, ref, "https://kuula.co/share/N1kwH"))).toBe("NOT_FOUND");
    expect(await code(uploadListingMedia(other, ref, "panorama", stream(await pano(4000, 2000)), "x.jpg"))).toBe("NOT_FOUND");
  });
});

describe("who can open it", () => {
  it("lets the team in at any status, and Plus members only once the listing is public", async () => {
    const free = await makeUser("Free Viewer");
    const plus = await makeUser("Plus Viewer");
    await startTrial({ userId: plus.id, audit: person(plus) }, { kind: "user", userId: plus.id }, { plan: "customer_plus", cycle: "monthly" }, ctx);

    expect(await canViewTour({ userId: null, actor: agent }, propertyId)).toBe(true);
    expect(await canViewTour({ userId: null, actor: moderator }, propertyId)).toBe(true);
    expect(await canViewTour({ userId: plus.id, actor: null }, propertyId)).toBe(false); // still a draft

    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);

    expect(await canViewTour({ userId: plus.id, actor: null }, propertyId)).toBe(true);
    expect(await canViewTour({ userId: free.id, actor: null }, propertyId)).toBe(false);
    expect(await canViewTour({ userId: null, actor: null }, propertyId)).toBe(false);
  });

  it("marks tour files for the subscription check when they're served", async () => {
    const tour = await tourDataForProperty(propertyId);
    expect(tour.rooms).toHaveLength(1);
    expect(tour.model).not.toBeNull();
    expect(tour.link?.provider).toBe("Kuula");
    const served = await resolveMediaForServing(tour.rooms[0].url.replace(/^\/media\//, ""), null);
    expect(served?.tourOfProperty).toBe(propertyId);
  });

  it("tells everyone a listing has a tour, without the link", async () => {
    const listing = await getListing(ref);
    expect(listing?.tour).toEqual({ rooms: 1, model: true, link: "Kuula" });
    expect(JSON.stringify(listing)).not.toContain("kuula.co");
    const withTour = await searchListings("rent", parseFilters("rent", { tour: "1", q: "Tour test flat" }));
    expect(withTour.items.map((i) => i.referenceId)).toContain(ref);
    const plain = await readyRentListing(agent, { title: "Tour test plain flat" });
    await transitionListing(agent, plain, "submit", {}, ctx);
    await transitionListing(moderator, plain, "approve", { reason: "Checked the details and photos." }, ctx);
    const filtered = await searchListings("rent", parseFilters("rent", { tour: "1" }));
    expect(filtered.items.map((i) => i.referenceId)).not.toContain(plain);
    expect((await getListing(plain))?.tour).toBeNull();
  });
});

describe("changing the tour of a live listing", () => {
  const openTourCase = async () =>
    (await db.execute(sql`
      SELECT rc.reference_id, rc.status, jsonb_array_length(rc.flags->'tour'->'changes') AS changes
        FROM trust.review_cases rc JOIN marketplace.listings l ON l.id = rc.listing_id
       WHERE l.reference_id = ${ref} AND rc.case_type = 'tour_review' AND rc.status IN ('open', 'in_review')`)).rows[0] as
      | { reference_id: string; status: string; changes: number }
      | undefined;
  let plusViewer: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    plusViewer = await makeUser("Plus Tour Viewer");
    await startTrial({ userId: plusViewer.id, audit: person(plusViewer) }, { kind: "user", userId: plusViewer.id }, { plan: "customer_plus", cycle: "monthly" }, ctx);
  });

  it("lets the team change the tour without withdrawing, but nothing else", async () => {
    expect(await statusOf(ref)).toBe("published");
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    expect(await code(uploadListingMedia(agent, ref, "photo", stream(jpg), "x.jpg"))).toBe("CONFLICT");
    expect(await openTourCase()).toBeUndefined();

    const room = await uploadListingMedia(agent, ref, "panorama", stream(await pano(4000, 2000)), "kitchen.jpg");
    expect(await openTourCase()).toMatchObject({ status: "open", changes: 1 });
    await updateMediaAlt(agent, ref, room.id, "Kitchen");
    await updateTourLink(agent, ref, "https://kuula.co/share/N1kwH"); // the same link: not a change
    expect((await openTourCase())?.changes).toBe(2);
    // Live straight away.
    expect((await getListing(ref))?.tour?.rooms).toBe(2);
    expect(await canViewTour({ userId: plusViewer.id, actor: null }, propertyId)).toBe(true);
  });

  it("lets a reviewer hide it with a remark, and keeps it hidden until a fix is approved", async () => {
    const kase = (await openTourCase())!.reference_id;
    expect(await code(decideTourReview(agent, kase, "hide", "Rooms are from another flat.", ctx))).toBe("FORBIDDEN");
    expect(await code(decideTourReview(moderator, kase, "hide", "Wrong", ctx))).toBe("VALIDATION_ERROR");
    await decideTourReview(moderator, kase, "hide", "These rooms are from a different flat.", ctx);
    expect(await code(decideTourReview(moderator, kase, "approve", "", ctx))).toBe("CONFLICT");

    const hiddenEverywhere = async () => {
      expect((await getListing(ref))?.tour).toBeNull();
      expect(await canViewTour({ userId: plusViewer.id, actor: null }, propertyId)).toBe(false);
      const filtered = await searchListings("rent", parseFilters("rent", { tour: "1", q: "Tour test flat" }));
      expect(filtered.items.map((i) => i.referenceId)).not.toContain(ref);
    };
    await hiddenEverywhere();
    expect(await canViewTour({ userId: null, actor: agent }, propertyId)).toBe(true);
    expect((await tourDataForProperty(propertyId)).hidden?.reason).toBe("These rooms are from a different flat.");
    const told = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE type = 'tour_decision' AND link = ${`/properties/${ref}/tour`}`);
    expect(told.n).toBe(1);

    // The fix goes for review, and the tour stays hidden meanwhile.
    const kitchen = (await tourDataForProperty(propertyId)).rooms.find((r) => r.name === "Kitchen")!;
    await deleteListingMedia(agent, ref, kitchen.id);
    const next = await openTourCase();
    expect(next).toMatchObject({ status: "open", changes: 1 });
    expect(next!.reference_id).not.toBe(kase);
    await hiddenEverywhere();

    // Still not right: it stays hidden, with the new reason.
    await decideTourReview(moderator, next!.reference_id, "hide", "The balcony room still shows documents.", ctx);
    expect((await tourDataForProperty(propertyId)).hidden?.reason).toBe("The balcony room still shows documents.");
    await updateTourLink(agent, ref, "");
    await hiddenEverywhere();

    // Approving a fix shows it again.
    await decideTourReview(moderator, (await openTourCase())!.reference_id, "approve", "", ctx);
    expect(await openTourCase()).toBeUndefined();
    expect((await tourDataForProperty(propertyId)).hidden).toBeNull();
    expect((await getListing(ref))?.tour).not.toBeNull();
    expect(await canViewTour({ userId: plusViewer.id, actor: null }, propertyId)).toBe(true);
  });

  it("keeps tour reviews apart from the listing's own review", async () => {
    await uploadListingMedia(agent, ref, "panorama", stream(await pano(4000, 2000)), "balcony.jpg");
    const tourCase = (await openTourCase())!.reference_id;
    await transitionListing(agent, ref, "withdraw", {}, ctx);
    // A withdrawal doesn't touch the open tour review; the listing's review covers it on approval.
    expect((await openTourCase())?.reference_id).toBe(tourCase);
    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    expect(await openTourCase()).toBeUndefined();
    const closed = await one<{ status: string }>(sql`SELECT status FROM trust.review_cases WHERE reference_id = ${tourCase}`);
    expect(closed.status).toBe("approved");
  });
});

describe("the properties list", () => {
  const list = async (tour?: string) =>
    (await listListingsForActor(agent, listingTableFilters.parse({ q: "Tour test", ...(tour ? { tour } : {}) }), 1)).rows;

  it("shows each listing's tour to its team, and filters by it", async () => {
    const row = (await list()).find((r) => r.referenceId === ref)!;
    expect(row.tour).toMatchObject({ hidden: false, reviewCase: null });
    expect(row.tour!.rooms).toBeGreaterThan(0);
    expect((await list("has")).map((r) => r.referenceId)).toContain(ref);
    expect((await list("none")).map((r) => r.referenceId)).not.toContain(ref);
    expect((await list("none")).every((r) => r.tour === null)).toBe(true);

    // A change opens a review; hiding it keeps the tour on the team's list, marked hidden.
    await updateTourLink(agent, ref, "https://app.cloudpano.com/tours/abc123XYZ");
    const waiting = (await list("review")).find((r) => r.referenceId === ref)!;
    expect(waiting.tour?.reviewCase).toMatch(/^VER-/);
    await decideTourReview(moderator, waiting.tour!.reviewCase!, "hide", "Wrong property in the CloudPano tour.", ctx);
    const hidden = (await list("hidden")).find((r) => r.referenceId === ref)!;
    expect(hidden.tour).toMatchObject({ hidden: true, reviewCase: null, link: "CloudPano" });
  });
});

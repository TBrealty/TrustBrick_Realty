import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseFilters } from "@/lib/listings/filters";
import { searchListings } from "@/lib/listings/queries";
import { createDraft, updateDetails, updatePricing } from "@/lib/services/listings/onboarding";
import { getListingForActor } from "@/lib/services/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, locality, makeAdmin, makeAgent, makeOrg, makeSuperadmin, one, statusOf } from "./support/factory";
import { BUILDING, readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));

async function isPublic(referenceId: string, title: string) {
  const result = await searchListings("rent", parseFilters("rent", { q: title }));
  return result.items.some((i) => i.referenceId === referenceId);
}

let agent: Actor;
let moderator: Actor;
let support: Actor;

beforeAll(async () => {
  const org = await makeOrg("Lifecycle Realty");
  agent = await (await makeAgent(org.id, "Lifecycle Agent")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  support = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
});

describe("onboarding", () => {
  it("creates a draft with a PRP property, an LST listing and the agent as primary", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "sale", propertyType: "villa", localityId: await locality("kokapet"), line1: "Plot 12, Sample Enclave" }, ctx);
    expect(referenceId).toMatch(/^LST-/);
    const listing = await getListingForActor(agent, referenceId);
    expect(listing.status).toBe("draft");
    expect(listing.propertyReferenceId).toMatch(/^PRP-/);
    expect(listing.agent?.userId).toBe(agent.userId);
    expect(listing.organization.id).toBe(agent.organization.id);
  });

  it("rejects a property type that doesn't fit the purpose", async () => {
    const result = await code(createDraft(agent, { purpose: "rent", propertyType: "residential_plot", localityId: await locality(), line1: "Somewhere 1" }, ctx));
    expect(result).toBe("VALIDATION_ERROR");
  });

  it("only accepts fields for the listing's own category", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Tower A" }, ctx);
    await updateDetails(agent, referenceId, {
      title: "Studio flat by the lake",
      lifecycleStatus: "ready",
      carpetAreaSqft: "500",
      bedrooms: "1",
      bathrooms: "1",
      balconies: "0",
      furnishing: "furnished",
      coveredParking: "0",
      ...BUILDING,
      floorNumber: "2",
      totalFloors: "9",
      // Not residential fields: silently not part of the schema, so never written.
      plotAreaSqyd: "999",
      status: "published",
      organizationId: "00000000-0000-0000-0000-000000000000",
    });
    const listing = await getListingForActor(agent, referenceId);
    expect(listing.status).toBe("draft");
    expect(listing.land).toBeNull();
    expect(listing.organization.id).toBe(agent.organization.id);
  });

  it("keeps the PG price at the lowest rent for a free bed", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "pg", propertyType: "pg", localityId: await locality("madhapur"), line1: "Sample PG" }, ctx);
    await updatePricing(agent, referenceId, {
      rooms: [
        { occupancy: "single", rentPerBed: "15000", bedsAvailable: "2", hasAc: "true", attachedBathroom: "true" },
        { occupancy: "triple", rentPerBed: "7000", bedsAvailable: "0", hasAc: "false", attachedBathroom: "false" },
        { occupancy: "double", rentPerBed: "9000", bedsAvailable: "3", hasAc: "false", attachedBathroom: "true" },
      ],
    });
    const listing = await getListingForActor(agent, referenceId);
    expect(listing.pricing.price).toBe(9000);
  });
});

describe("submission, review and publishing", () => {
  it("won't submit without the required pieces", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Incomplete" }, ctx);
    expect(await code(transitionListing(agent, referenceId, "submit", {}, ctx))).toBe("VALIDATION_ERROR");
  });

  it("runs the full workflow: submit → review → approve → public", async () => {
    const title = "Lakeside 2 BHK for the workflow test";
    const ref = await readyRentListing(agent, { title });
    const submitted = await transitionListing(agent, ref, "submit", {}, ctx);
    expect(submitted.status).toBe("submitted");
    expect(submitted.caseReferenceId).toMatch(/^VER-/);
    expect(await isPublic(ref, title)).toBe(false);

    // Moderators are told.
    const notified = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${moderator.userId} AND type = 'listing_submitted'`);
    expect(notified.n).toBeGreaterThan(0);

    await transitionListing(moderator, ref, "start_review", {}, ctx);
    expect(await statusOf(ref)).toBe("under_review");
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos.", markPropertyVerified: true }, ctx);
    expect(await statusOf(ref)).toBe("published");
    expect(await isPublic(ref, title)).toBe(true);

    const listing = await getListingForActor(agent, ref);
    expect(listing.property.verificationStatus).toBe("verified");
    expect(listing.history.map((h) => h.toStatus)).toEqual(["published", "approved", "under_review", "submitted", "draft"]);
    expect(listing.cases[0].status).toBe("approved");

    const audits = await db.execute(sql`SELECT event_type FROM platform.audit_events WHERE target_reference_id = ${ref} ORDER BY created_at`);
    expect((audits.rows as { event_type: string }[]).map((r) => r.event_type)).toEqual(
      expect.arrayContaining(["LISTING_SUBMITTED", "LISTING_REVIEW_STARTED", "LISTING_APPROVED", "LISTING_PUBLISHED"]),
    );
    const prices = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM marketplace.listing_prices p JOIN marketplace.listings l ON l.id = p.listing_id WHERE l.reference_id = ${ref}`);
    expect(prices.n).toBe(1);
  });

  it("approval needs a remark, which is kept on the case, the history and the agent's notification", async () => {
    const ref = await readyRentListing(agent);
    await transitionListing(agent, ref, "submit", {}, ctx);
    expect(await code(transitionListing(moderator, ref, "approve", {}, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(transitionListing(moderator, ref, "approve", { reason: "ok" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await statusOf(ref)).toBe("submitted");
    const remark = "Photos and address match the documents we were sent.";
    await transitionListing(moderator, ref, "approve", { reason: remark }, ctx);
    const listing = await getListingForActor(agent, ref);
    expect(listing.status).toBe("published");
    expect(listing.cases[0]).toMatchObject({ status: "approved", decisionReason: remark });
    expect(listing.history.find((h) => h.toStatus === "approved")?.reason).toBe(remark);
    const note = await one<{ body: string }>(sql`SELECT body FROM platform.notifications WHERE user_id = ${agent.userId} AND type = 'listing_approved' ORDER BY created_at DESC LIMIT 1`);
    expect(note.body).toBe(remark);
  });

  it("rejection needs a reason the agent can see, and the agent can edit and resubmit", async () => {
    const ref = await readyRentListing(agent);
    await transitionListing(agent, ref, "submit", {}, ctx);
    expect(await code(transitionListing(moderator, ref, "reject", { reason: "no" }, ctx))).toBe("VALIDATION_ERROR");
    await transitionListing(moderator, ref, "reject", { reason: "The photos are of a different building." }, ctx);
    const listing = await getListingForActor(agent, ref);
    expect(listing.status).toBe("rejected");
    expect(listing.statusReason).toBe("The photos are of a different building.");
    await updatePricing(agent, ref, { price: "31000" });
    expect((await transitionListing(agent, ref, "submit", {}, ctx)).status).toBe("submitted");
  });

  it("forbids the wrong people from moderating", async () => {
    const ref = await readyRentListing(agent);
    await transitionListing(agent, ref, "submit", {}, ctx);
    expect(await code(transitionListing(agent, ref, "approve", { reason: "Checked the details and photos." }, ctx))).toBe("FORBIDDEN");
    expect(await code(transitionListing(support, ref, "approve", { reason: "Checked the details and photos." }, ctx))).toBe("FORBIDDEN");
    expect(await statusOf(ref)).toBe("submitted");
  });

  it("refuses transitions the lifecycle doesn't allow", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Draft only" }, ctx);
    expect(await code(transitionListing(moderator, referenceId, "approve", { reason: "Checked the details and photos." }, ctx))).toBe("CONFLICT");
    expect(await code(transitionListing(moderator, referenceId, "republish", {}, ctx))).toBe("CONFLICT");
    expect(await code(transitionListing(agent, referenceId, "pause", {}, ctx))).toBe("FORBIDDEN");
  });

  it("won't edit a live listing until it's withdrawn, and withdrawing takes it off the marketplace", async () => {
    const title = "Live listing edit guard";
    const ref = await readyRentListing(agent, { title });
    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    expect(await code(updatePricing(agent, ref, { price: "1" }))).toBe("CONFLICT");
    await transitionListing(agent, ref, "withdraw", {}, ctx);
    expect(await isPublic(ref, title)).toBe(false);
    await updatePricing(agent, ref, { price: "28000" });
  });

  it("unpublishing by a moderator hides the listing and notifies the agent", async () => {
    const title = "Unpublish me for the test";
    const ref = await readyRentListing(agent, { title });
    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    await transitionListing(moderator, ref, "unpublish", { reason: "Reported as unavailable by several customers." }, ctx);
    expect(await isPublic(ref, title)).toBe(false);
    const n = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${agent.userId} AND type = 'listing_paused'`);
    expect(n.n).toBeGreaterThan(0);
  });

  it("never publishes without an admin's approval, even for a verified agent", async () => {
    const org = await makeOrg("Fast Lane Realty");
    const verified = await (await makeAgent(org.id, "Verified Agent", "agent", { verified: true })).actor();
    const ref = await readyRentListing(verified, { localitySlug: "whitefield" });
    expect((await transitionListing(verified, ref, "submit", {}, ctx)).status).toBe("submitted");
    expect(await statusOf(ref)).toBe("submitted");
  });
});

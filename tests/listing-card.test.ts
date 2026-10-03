import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { AppError } from "@/lib/errors";
import { parseFilters } from "@/lib/listings/filters";
import { searchListings } from "@/lib/listings/queries";
import { listingCard, updateListingTerms } from "@/lib/services/listings/card";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createDraft, updatePricing } from "@/lib/services/listings/onboarding";
import { ctx, locality, makeAdmin, makeAgent, makeOrg, makeSuperadmin, one, statusOf } from "./support/factory";
import { readyRentListing } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const TITLE = "Card test 2 BHK near the lake";

let agent: Actor;
let otherAgent: Actor;
let moderator: Actor;
let ops: Actor;
let ref: string;

const publicItem = async () => (await searchListings("rent", parseFilters("rent", { q: TITLE }))).items.find((i) => i.referenceId === ref);

beforeAll(async () => {
  const org = await makeOrg("Card Realty");
  agent = await (await makeAgent(org.id, "Card Agent")).actor();
  otherAgent = await (await makeAgent(org.id, "Other Card Agent")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  ref = await readyRentListing(agent, { title: TITLE, rent: 30000 });
  await transitionListing(agent, ref, "submit", {}, ctx);
  await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
});

describe("the property card", () => {
  it("shows everything, and what the agent may change", async () => {
    const card = await listingCard(agent, ref);
    expect(card).toMatchObject({ referenceId: ref, status: "published", priceLabel: "₹30,000/mo", publicUrl: `/listings/${ref}` });
    expect(card.sections.map((s) => s.title)).toEqual(["Property", "Price and terms", "Location", "Responsibility"]);
    expect(card.can.editTerms).toBe(true);
    expect(card.can.availability).toEqual([expect.objectContaining({ action: "mark_closed", label: "Mark as rented out" })]);
    expect(card.priceHistory).toHaveLength(1);
  });

  it("is read-only for the SuperAdmin and hidden from other agents", async () => {
    const sa = await (await makeSuperadmin()).actor();
    const card = await listingCard(sa, ref);
    expect(card.can.editTerms).toBe(false);
    expect(card.can.availability).toEqual([]);
    expect(await code(updateListingTerms(sa, ref, { price: "1000" }, ctx))).toBe("FORBIDDEN");
    expect(await code(listingCard(otherAgent, ref))).toBe("NOT_FOUND");
    expect(await code(updateListingTerms(otherAgent, ref, { price: "1000" }, ctx))).toBe("NOT_FOUND");
    const support = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
    expect(await code(updateListingTerms(support, ref, { price: "1000" }, ctx))).toBe("FORBIDDEN");
  });
});

describe("quick edits on a live listing", () => {
  it("changes the price and adds an offer without another review, with history and audit", async () => {
    const result = await updateListingTerms(
      agent,
      ref,
      { price: "28,000".replace(",", ""), depositAmount: "84000", priceNegotiable: "on", offerTitle: "No brokerage", offerDetails: "Book this month and pay no brokerage.", offerValidUntil: future(20) },
      ctx,
    );
    expect(result.changed).toEqual(expect.arrayContaining(["price", "price_negotiable", "deposit_amount", "offer_title", "offer_details", "offer_valid_until"]));
    expect(await statusOf(ref)).toBe("published");

    const card = await listingCard(agent, ref);
    expect(card.priceLabel).toBe("₹28,000/mo");
    expect(card.offer).toMatchObject({ title: "No brokerage", active: true });
    expect(card.priceHistory.map((h) => [h.price, h.to === null])).toEqual([
      ["₹28,000/mo", true],
      ["₹30,000/mo", false],
    ]);

    const item = await publicItem();
    expect(item?.price).toBe(28000);
    expect(item?.offer?.title).toBe("No brokerage");

    const audited = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type = 'LISTING_TERMS_UPDATED' AND target_reference_id = ${ref}`);
    expect(audited.n).toBe(1);
    expect((await updateListingTerms(agent, ref, { price: "28000", depositAmount: "84000", priceNegotiable: "on", offerTitle: "No brokerage", offerDetails: "Book this month and pay no brokerage.", offerValidUntil: future(20) }, ctx)).changed).toEqual([]);
  });

  it("validates the offer and the price", async () => {
    expect(await code(updateListingTerms(agent, ref, { price: "28000", offerDetails: "Details without a title" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(updateListingTerms(agent, ref, { price: "28000", offerTitle: "Old offer", offerValidUntil: "2020-01-01" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(updateListingTerms(agent, ref, { price: "10" }, ctx))).toBe("VALIDATION_ERROR");
  });

  it("an admin can change it too, and the agent is told", async () => {
    await updateListingTerms(ops, ref, { price: "27500", depositAmount: "84000" }, ctx);
    const card = await listingCard(agent, ref);
    expect(card.priceLabel).toBe("₹27,500/mo");
    expect(card.offer).toBeNull();
    const told = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${agent.userId} AND type = 'listing_updated'`);
    expect(told.n).toBe(1);
  });
});

describe("availability", () => {
  it("marking it rented takes it off the marketplace; marking it available brings it back", async () => {
    // A rental says how it closed; this one was let by the owner, so there's no commission.
    expect(await code(transitionListing(agent, ref, "mark_closed", {}, ctx))).toBe("VALIDATION_ERROR");
    await transitionListing(agent, ref, "mark_closed", { close: { outcome: "closed_elsewhere" } }, ctx);
    expect(await statusOf(ref)).toBe("transacted");
    expect(await publicItem()).toBeUndefined();
    const closed = await listingCard(agent, ref);
    expect(closed.statusLabel).toBe("Rented out");
    expect(closed.can.editTerms).toBe(false);
    expect(await code(updateListingTerms(agent, ref, { price: "27000" }, ctx))).toBe("CONFLICT");
    const open = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM marketplace.listing_prices p JOIN marketplace.listings l ON l.id = p.listing_id WHERE l.reference_id = ${ref} AND upper_inf(p.effective)`);
    expect(open.n).toBe(0);

    // An admin reopens it; the SuperAdmin and a moderator without listings.manage can't.
    const sa = await (await makeSuperadmin()).actor();
    expect(await code(transitionListing(sa, ref, "reopen", {}, ctx))).toBe("FORBIDDEN");
    await transitionListing(ops, ref, "reopen", {}, ctx);
    expect(await statusOf(ref)).toBe("published");
    expect((await publicItem())?.price).toBe(27500);
  });

  it("another agent can't mark it", async () => {
    expect(await code(transitionListing(otherAgent, ref, "mark_closed", {}, ctx))).toBe("NOT_FOUND");
  });
});

describe("PG beds", () => {
  it("updates rent and free beds per room, and the listing price follows the cheapest free bed", async () => {
    const { referenceId } = await createDraft(agent, { purpose: "pg", propertyType: "pg", localityId: await locality("madhapur"), line1: "Card test PG" }, ctx);
    await updatePricing(agent, referenceId, {
      rooms: [
        { occupancy: "single", rentPerBed: "15000", bedsAvailable: "2" },
        { occupancy: "double", rentPerBed: "9000", bedsAvailable: "3" },
      ],
    });
    const card = await listingCard(agent, referenceId);
    const [single, double] = card.rooms;
    expect(double.label).toBe("Double");
    await updateListingTerms(
      agent,
      referenceId,
      { rooms: [{ id: single.id, rentPerBed: "14000", bedsAvailable: "1" }, { id: double.id, rentPerBed: "9000", bedsAvailable: "0" }], offerTitle: "Free Wi-Fi" },
      ctx,
    );
    const after = await listingCard(agent, referenceId);
    expect(after.priceLabel).toBe("from ₹14,000/bed");
    expect(after.rooms.map((r) => r.bedsAvailable)).toEqual([1, 0]);

    // Room fields sent to a non-PG listing are ignored, never applied to another listing's rooms.
    expect(await code(updateListingTerms(agent, ref, { price: "27500", depositAmount: "84000", rooms: [{ id: single.id, rentPerBed: "600", bedsAvailable: "0" }] }, ctx))).toBe("OK");
    expect((await listingCard(agent, referenceId)).rooms[0]).toMatchObject({ rentPerBed: 14000, bedsAvailable: 1 });
    expect(await code(updateListingTerms(otherAgent, referenceId, { rooms: [] }, ctx))).toBe("NOT_FOUND");
  });
});

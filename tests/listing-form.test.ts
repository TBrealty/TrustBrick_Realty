import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { brokerageLabel } from "@/lib/listings/brokerage";
import { parseMapLink } from "@/lib/listings/map-link";
import { getListing } from "@/lib/listings/queries";
import { submissionGaps, transitionListing } from "@/lib/services/listings/lifecycle";
import { createDraft, updateAmenities, updateDetails, updatePricing } from "@/lib/services/listings/onboarding";
import { getListingForActor } from "@/lib/services/listings/queries";
import { ctx, locality, makeAdmin, makeAgent, makeOrg } from "./support/factory";
import { BUILDING, readyRentListing } from "./support/listings";

const fields = (p: Promise<unknown>) => p.then(() => ({})).catch((e: unknown) => (e instanceof AppError ? (e.fieldErrors ?? {}) : { threw: String(e) }));
const pin = (link: string) => {
  const r = parseMapLink(link);
  return r.ok ? [r.pin.latitude, r.pin.longitude] : r.reason;
};

let agent: Actor;

beforeAll(async () => {
  const org = await makeOrg("Form Realty");
  agent = await (await makeAgent(org.id, "Form Agent")).actor();
});

describe("the map pin comes from a Google Maps or Apple Maps link", () => {
  it("reads Google links, preferring the dropped pin to the view's centre", () => {
    expect(pin("https://www.google.com/maps/place/Kondapur/@17.4600,78.3500,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d17.4631!4d78.3563")).toEqual([17.4631, 78.3563]);
    expect(pin("https://www.google.com/maps/@17.448312,78.391541,17z")).toEqual([17.448312, 78.391541]);
    expect(pin("https://maps.google.com/?q=17.4483,78.3915")).toEqual([17.4483, 78.3915]);
    expect(pin("https://www.google.com/maps/search/?api=1&query=15.5527%2C73.7517")).toEqual([15.5527, 73.7517]);
    expect(pin("https://www.google.co.in/maps/search/17.4483,+78.3915")).toEqual([17.4483, 78.3915]);
  });

  it("reads Apple links, and coordinates pasted on their own", () => {
    expect(pin("https://maps.apple.com/?ll=12.9716,77.5946&q=Dropped%20Pin")).toEqual([12.9716, 77.5946]);
    expect(pin("https://maps.apple.com/place?coordinate=19.0760,72.8777&name=Marked%20Location")).toEqual([19.076, 72.8777]);
    expect(pin("17.448312, 78.391541")).toEqual([17.448312, 78.391541]);
  });

  it("knows short links need following, and refuses what isn't a map or isn't in India", () => {
    expect(pin("https://maps.app.goo.gl/AbCdEf123")).toBe("short_link");
    expect(pin("https://goo.gl/maps/AbCdEf123")).toBe("short_link");
    expect(pin("https://maps.apple/p/AbCdEf123")).toBe("short_link");
    expect(pin("https://example.com/maps?q=17.4,78.3")).toBe("not_a_map_link");
    expect(pin("https://www.google.com/maps?q=51.5072,-0.1276")).toBe("outside_india");
    expect(pin("https://www.google.com/maps/place/Some+Shop")).toBe("no_pin");
  });

  it("saves the pin from the link, or the locality's centre without one", async () => {
    const withLink = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Tower C", mapLink: "https://maps.google.com/?q=17.463100,78.356300" }, ctx);
    const exact = await getListingForActor(agent, withLink.referenceId);
    expect([exact.location.latitude, exact.location.longitude].map((n) => n.toFixed(4))).toEqual(["17.4631", "78.3563"]);
    expect(exact.location.pinExact).toBe(true);

    const without = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Tower D" }, ctx);
    expect((await getListingForActor(agent, without.referenceId)).location.pinExact).toBe(false);

    expect(await fields(createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Tower E", mapLink: "https://example.com" }, ctx))).toHaveProperty("mapLink");
  });

  it("no longer takes the flat number with the location; it's saved with the details", async () => {
    const ref = await readyRentListing(agent);
    const listing = await getListingForActor(agent, ref);
    expect(listing.location.unitNumber).toMatch(/^B-\d{4}$/);
  });
});

describe("details the form now insists on", () => {
  let ref: string;
  const flat = { title: "Two-bedroom flat near the lake", lifecycleStatus: "ready", carpetAreaSqft: "900", bedrooms: "2", bathrooms: "2", balconies: "1", furnishing: "furnished", coveredParking: "1" };

  beforeAll(async () => {
    ({ referenceId: ref } = await createDraft(agent, { purpose: "rent", propertyType: "apartment", localityId: await locality(), line1: "Tower F" }, ctx));
  });

  it("keeps titles to 50 characters", async () => {
    const e = await fields(updateDetails(agent, ref, { ...flat, ...BUILDING, floorNumber: "2", totalFloors: "9", title: "A".repeat(51) }));
    expect(e).toHaveProperty("title");
  });

  it("needs the year built, floor, total floors, facing and ownership", async () => {
    const e = await fields(updateDetails(agent, ref, flat));
    expect(Object.keys(e)).toEqual(expect.arrayContaining(["yearBuilt", "floorNumber", "totalFloors", "facing", "ownershipType"]));
    await updateDetails(agent, ref, { ...flat, ...BUILDING, floorNumber: "2", totalFloors: "9" });
  });

  it("flags older drafts that don't have them yet", async () => {
    const listing = await getListingForActor(agent, ref);
    await db.execute(sql`UPDATE real_estate.properties SET year_built = NULL, total_floors = NULL WHERE id = ${listing.propertyId}`);
    const gaps = await submissionGaps(db, listing.id);
    expect(gaps.find((g) => g.section === "details")?.message).toBe("Add the year built and the floor and total floors");
  });
});

describe("brokerage", () => {
  let rent: string;
  let sale: string;

  beforeAll(async () => {
    rent = await readyRentListing(agent);
    ({ referenceId: sale } = await createDraft(agent, { purpose: "sale", propertyType: "apartment", localityId: await locality(), line1: "Tower G" }, ctx));
  });

  it("takes half a month's rent and a flexible amount, with no amount to enter", async () => {
    await updatePricing(agent, rent, { price: "30000", brokerageType: "half_month", brokerageValue: "7", brokerageNegotiable: "on" });
    let p = (await getListingForActor(agent, rent)).pricing;
    expect([p.brokerageType, p.brokerageValue, p.brokerageNegotiable]).toEqual(["half_month", null, true]);

    await updatePricing(agent, rent, { price: "30000", brokerageType: "flexible", brokerageNegotiable: "on" });
    p = (await getListingForActor(agent, rent)).pricing;
    expect([p.brokerageType, p.brokerageValue, p.brokerageNegotiable]).toEqual(["flexible", null, false]);
    expect(brokerageLabel("flexible", null)).toBe("Flexible, to be agreed");
  });

  it("asks for an amount only where the choice has one", async () => {
    expect(await fields(updatePricing(agent, rent, { price: "30000", brokerageType: "months_rent" }))).toHaveProperty("brokerageValue");
    await updatePricing(agent, rent, { price: "30000", brokerageType: "months_rent", brokerageValue: "1", brokerageNegotiable: "on" });
    expect(brokerageLabel("months_rent", 1, true)).toBe("1 month's rent, negotiable");
    expect(brokerageLabel("months_rent", 2)).toBe("2 months' rent");
  });

  it("keeps months of rent to rentals", async () => {
    expect(await fields(updatePricing(agent, sale, { price: "9000000", brokerageType: "half_month" }))).toHaveProperty("brokerageType");
    await updatePricing(agent, sale, { price: "9000000", brokerageType: "percent", brokerageValue: "1" });
    expect(brokerageLabel("percent", 1)).toBe("1% of the price");
  });
});

describe("custom amenities", () => {
  let ref: string;
  beforeAll(async () => {
    ref = await readyRentListing(agent);
  });

  it("saves the agent's own amenities, tidied and without repeats", async () => {
    await updateAmenities(agent, ref, { amenities: ["gym"], custom: ["  rooftop   garden ", "Rooftop garden", "EV charging (2 points)"] });
    const listing = await getListingForActor(agent, ref);
    expect(listing.amenities).toEqual(["gym"]);
    expect(listing.customAmenities).toEqual(["Rooftop garden", "EV charging (2 points)"]);
  });

  it("ticks the standard amenity when a typed one matches it", async () => {
    await updateAmenities(agent, ref, { amenities: [], custom: ["lift", "Terrace"] });
    const listing = await getListingForActor(agent, ref);
    expect(listing.amenities).toEqual(["lift"]);
    expect(listing.customAmenities).toEqual(["Terrace"]);
  });

  it("shows them to customers once the listing is live", async () => {
    const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    const live = await getListing(ref);
    expect(live?.amenities.map((a) => a.name)).toEqual(["Lift", "Terrace"]);
  });

  it("refuses too many, or odd characters", async () => {
    expect(await fields(updateAmenities(agent, ref, { custom: Array.from({ length: 21 }, (_, i) => `Extra ${i + 1}`) }))).toHaveProperty("custom");
    expect(await fields(updateAmenities(agent, ref, { custom: ["<script>"] }))).toHaveProperty(["custom.0"]);
  });
});

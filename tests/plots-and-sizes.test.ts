import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { KIND_META, LISTING_KINDS, activeFilterCount, parseFilters, sizeRangesFor } from "@/lib/listings/filters";
import { kindOf } from "@/lib/listings/describe";
import { getBrowseOptions, searchListings } from "@/lib/listings/queries";
import { SERVICE_SHELLS, otherServices } from "@/lib/listings/services";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createDraft, updateDetails, updatePricing } from "@/lib/services/listings/onboarding";
import { attachPhoto, ctx, locality, makeAdmin, makeAgent, makeOrg } from "./support/factory";
import { BUILDING } from "./support/listings";

// A tag in every title, so searches here only ever see this file's listings.
const TAG = `Sizetest${Date.now().toString(36)}`;

let agent: Actor;
let moderator: Actor;
let plot: string;
let flat: string;

async function publish(ref: string) {
  await transitionListing(agent, ref, "submit", {}, ctx);
  await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
}

/** Buy results for this file's listings, with extra URL parameters. */
const buy = async (params: Record<string, string | string[]> = {}) =>
  (await searchListings("buy", parseFilters("buy", { q: TAG, ...params }))).items.map((i) => i.referenceId);

beforeAll(async () => {
  const org = await makeOrg("Plots Realty");
  agent = await (await makeAgent(org.id, "Plot Agent")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();

  // An open plot of 240 sq yd, entered by the agent the way plots are sold.
  ({ referenceId: plot } = await createDraft(agent, { purpose: "sale", propertyType: "open_plot", localityId: await locality("kokapet"), line1: "Survey 12, Layout Road" }, ctx));
  await updateDetails(agent, plot, { title: `${TAG} open plot, 240 sq yd`, description: "East-facing open plot in an approved layout.", plotAreaSqyd: "240", zoning: "residential", ownershipType: "freehold" });
  await updatePricing(agent, plot, { price: "9600000" });
  await attachPhoto(plot);
  await publish(plot);

  // A 2 BHK flat of 1,200 sq ft carpet.
  ({ referenceId: flat } = await createDraft(agent, { purpose: "sale", propertyType: "apartment", localityId: await locality("kokapet"), line1: "Tower A" }, ctx));
  await updateDetails(agent, flat, {
    title: `${TAG} two-bedroom flat`,
    description: "A bright two-bedroom flat.",
    lifecycleStatus: "ready",
    carpetAreaSqft: "1200",
    bedrooms: "2",
    bathrooms: "2",
    balconies: "1",
    coveredParking: "1",
    furnishing: "semi_furnished",
    ...BUILDING,
    unitNumber: "A-1203",
    floorNumber: "12",
    totalFloors: "20",
  });
  await updatePricing(agent, flat, { price: "11500000" });
  await attachPhoto(flat);
  await publish(flat);
});

describe("size ranges in the filter", () => {
  it("opens the range that fits the chosen types: sq yd for plots, sq ft for homes", () => {
    expect(sizeRangesFor([])).toEqual({ sqft: false, sqyd: false });
    expect(sizeRangesFor(["open_plot"])).toEqual({ sqft: false, sqyd: true });
    expect(sizeRangesFor(["apartment"])).toEqual({ sqft: true, sqyd: false });
    expect(sizeRangesFor(["residential_plot", "villa"])).toEqual({ sqft: true, sqyd: true });
  });

  it("orders a reversed range and ignores a range whose type isn't chosen", () => {
    const f = parseFilters("buy", { type: "open_plot", sqyd_min: "300", sqyd_max: "200", sqft_min: "900" });
    expect([f.sqydMin, f.sqydMax]).toEqual([200, 300]);
    // No home type is chosen, so the sq ft range left in the URL does nothing.
    expect(f.sqftMin).toBeUndefined();
    expect(activeFilterCount(f)).toBe(2);
    expect(parseFilters("rent", { type: "apartment", sqft_min: "900" }).sqftMin).toBeUndefined();
  });
});

describe("plots under Buy", () => {
  it("lists Plot and Open plot as Buy property types", async () => {
    const types = (await getBrowseOptions("buy")).types.map((t) => t.name);
    expect(types).toEqual(expect.arrayContaining(["Apartment", "Plot", "Open plot"]));
  });

  it("shows plots alongside homes", async () => {
    expect(await buy()).toEqual(expect.arrayContaining([plot, flat]));
  });

  it("filters plots by plot area in sq yd", async () => {
    expect(await buy({ type: "open_plot", sqyd_min: "200", sqyd_max: "250" })).toEqual([plot]);
    expect(await buy({ type: "open_plot", sqyd_min: "250" })).toEqual([]);
  });

  it("filters homes by carpet area in sq ft", async () => {
    expect(await buy({ type: "apartment", sqft_min: "1000", sqft_max: "1500" })).toEqual([flat]);
    expect(await buy({ type: "apartment", sqft_min: "1500" })).toEqual([]);
  });

  it("applies each range only to its own kind of property when both are chosen", async () => {
    // The plot range doesn't rule out the flat, and the flat's range doesn't rule out the plot.
    const both = await buy({ type: ["apartment", "open_plot"], sqyd_min: "200", sqyd_max: "250", sqft_min: "1000", sqft_max: "1500" });
    expect(both.sort()).toEqual([plot, flat].sort());
    expect(await buy({ type: ["apartment", "open_plot"], sqyd_min: "250", sqft_min: "1000" })).toEqual([flat]);
  });

  it("doesn't let bedroom or furnishing choices hide plots the buyer also asked for", async () => {
    expect((await buy({ type: ["apartment", "open_plot"], bhk: "2", furnishing: "semi_furnished" })).sort()).toEqual([plot, flat].sort());
    // Without a plot type, choosing bedrooms still means homes.
    expect(await buy({ bhk: "2" })).toEqual([flat]);
  });
});

describe("Buy as a dedicated service", () => {
  const shell = SERVICE_SHELLS.buy!;

  it("keeps plots in Buy and other land in Invest", () => {
    const land = (typeCode: string) => ({ transactionType: "sale" as const, category: "land", projectStatus: null, typeCode });
    expect(kindOf(land("residential_plot"))).toBe("buy");
    expect(kindOf(land("open_plot"))).toBe("buy");
    expect(kindOf(land("commercial_plot"))).toBe("invest");
  });

  it("marks the section a result set belongs to", () => {
    expect(shell.sectionFor(parseFilters("buy", {}))).toBe("all");
    expect(shell.sectionFor(parseFilters("buy", { status: "ready" }))).toBe("ready");
    expect(shell.sectionFor(parseFilters("buy", { status: "under_construction" }))).toBe("new");
    expect(shell.sectionFor(parseFilters("buy", { type: ["residential_plot", "open_plot"] }))).toBe("plots");
    // Every section and quick search is a Buy page.
    expect([...shell.sections, ...shell.quickSearches].every((l) => l.href.startsWith("/buy"))).toBe(true);
  });

  it("offers every other service, and only those, as the way across", () => {
    expect(otherServices("buy").map((s) => s.href)).toEqual(["/rent", "/pg", "/stays", "/invest", "/legal-verification"]);
  });
});

describe("every service is dedicated", () => {
  it("gives every service a shell whose sections and searches stay inside it", () => {
    for (const kind of LISTING_KINDS) {
      const shell = SERVICE_SHELLS[kind];
      expect(shell, kind).toBeDefined();
      const path = KIND_META[kind].path;
      for (const link of [...shell!.sections, ...shell!.quickSearches]) expect(link.href.split("?")[0], `${kind}: ${link.label}`).toBe(path);
      expect(otherServices(kind).map((o) => o.href)).not.toContain(path);
      expect(otherServices(kind)).toHaveLength(LISTING_KINDS.length); // the other listing services, and Legal Verification
    }
  });

  it("marks the current section for each service", () => {
    expect(SERVICE_SHELLS.rent!.sectionFor(parseFilters("rent", { available_now: "1" }))).toBe("now");
    expect(SERVICE_SHELLS.rent!.sectionFor(parseFilters("rent", { type: ["independent_house", "villa"] }))).toBe("houses");
    expect(SERVICE_SHELLS.pg!.sectionFor(parseFilters("pg", { gender: "women" }))).toBe("women");
    expect(SERVICE_SHELLS.pg!.sectionFor(parseFilters("pg", {}))).toBe("all");
    expect(SERVICE_SHELLS.stay!.sectionFor(parseFilters("stay", { space: "private_room" }))).toBe("room");
    expect(SERVICE_SHELLS.stay!.sectionFor(parseFilters("stay", { instant: "1" }))).toBe("instant");
    expect(SERVICE_SHELLS.invest!.sectionFor(parseFilters("invest", { category: "land" }))).toBe("land");
    expect(SERVICE_SHELLS.invest!.sectionFor(parseFilters("invest", { category: ["land", "commercial"] }))).toBe("all");
  });
});

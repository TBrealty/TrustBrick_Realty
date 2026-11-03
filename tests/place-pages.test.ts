import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { findPlace, placeIntro, placeMetadata, placePath, placeTitle } from "@/lib/listings/places";
import { placesWithListings } from "@/lib/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, makeAdmin, makeAgent, makeOrg } from "./support/factory";
import { readyRentListing } from "./support/listings";

describe("city and locality landing pages", () => {
  beforeAll(async () => {
    const agent = await (await makeAgent((await makeOrg("Place Pages Realty")).id, "Place Agent")).actor();
    const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
    const ref = await readyRentListing(agent, { title: "Kokapet flat for the place pages", rent: 33_333, localitySlug: "kokapet" });
    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
  });

  it("finds a city and its locality, with what's listed there", async () => {
    const city = await findPlace("rent", "hyderabad");
    expect(city).toMatchObject({ name: "Hyderabad", locality: null, path: "/rent/hyderabad" });
    expect(city!.stats.localities.map((l) => l.slug)).toContain("kokapet");

    const locality = await findPlace("rent", "hyderabad", "kokapet");
    expect(locality).toMatchObject({ name: "Kokapet, Hyderabad", path: "/rent/hyderabad/kokapet" });
    expect(locality!.stats.total).toBeGreaterThanOrEqual(1);
    expect(locality!.stats.minPrice).toBeLessThanOrEqual(33_333);
    expect(placeTitle("rent", locality!.name)).toBe("Homes for rent in Kokapet, Hyderabad");
    expect(placeIntro(locality!)).toMatch(/^Homes for rent in Kokapet, Hyderabad/);
    expect(placeIntro(locality!, { withCount: true })).toMatch(/^\d+ homes? for rent in Kokapet, Hyderabad/);
    // Listed, so it's for search engines.
    expect(placeMetadata(locality!)).toMatchObject({ alternates: { canonical: expect.stringMatching(/\/rent\/hyderabad\/kokapet$/) } });
    expect(placeMetadata(locality!).robots).toBeUndefined();
  });

  it("keeps empty pages out of search results, and refuses places that don't exist", async () => {
    const empty = await findPlace("stay", "hyderabad", "kokapet");
    expect(empty!.stats.total).toBe(0);
    expect(placeIntro(empty!)).toMatch(/^No homestays in Kokapet, Hyderabad on Trustbrick yet/);
    expect(placeMetadata(empty!).robots).toEqual({ index: false, follow: true });

    expect(await findPlace("rent", "atlantis")).toBeNull();
    expect(await findPlace("rent", "hyderabad", "atlantis")).toBeNull();
  });

  it("lists the places with listings for the sitemap", async () => {
    const places = await placesWithListings("rent");
    expect(places).toContainEqual({ city: "hyderabad", locality: "kokapet" });
    expect(placePath("stay", "north-goa", "calangute")).toBe("/stays/north-goa/calangute");
  });
});

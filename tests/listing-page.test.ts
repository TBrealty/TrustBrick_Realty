import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { keyFactTiles } from "@/lib/listings/describe";
import { getListing, listingTrust, similarListings } from "@/lib/listings/queries";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { ctx, makeAdmin, makeAgent, makeOrg } from "./support/factory";
import { readyRentListing } from "./support/listings";

let agent: Actor;
let admin: Actor;

/** A rent listing, submitted and approved, so it's live. */
async function live(title: string, localitySlug?: string) {
  const ref = await readyRentListing(agent, { title, localitySlug });
  await transitionListing(agent, ref, "submit", {}, ctx);
  await transitionListing(admin, ref, "approve", { reason: "Checked the details and photos." }, ctx);
  return (await getListing(ref))!;
}

beforeAll(async () => {
  agent = await (await makeAgent((await makeOrg("Listing Page Realty")).id, "Page Agent", "agent", { verified: true })).actor();
  admin = await (await makeAdmin(["listings.approve", "listings.view"])).actor();
});

describe("the listing page", () => {
  it("says what Trustbrick checked, and only that", async () => {
    const listing = await live("Checked flat near the metro");
    const trust = await listingTrust(listing.id);
    expect(trust.reviewedAt).not.toBeNull();
    expect(trust.person).toMatchObject({ name: "Page Agent", role: "agent", approved: true, verified: true });
    // The organization wasn't verified and the property wasn't checked: neither is claimed.
    expect(trust.organization).toMatchObject({ name: "Listing Page Realty", verified: false });
    expect(trust.propertyVerified).toBe(false);
  });

  it("suggests other homes of the same kind nearby, never itself", async () => {
    const one = await live("First flat in this locality");
    const two = await live("Second flat in this locality");
    const similar = await similarListings(one.id, "rent");
    const ids = similar.rows.map((r) => r.id);
    expect(ids).toContain(two.id);
    expect(ids).not.toContain(one.id);
    expect(similar.rows.every((r) => r.category === "residential")).toBe(true);
  });

  it("labels the key facts for a home to rent", async () => {
    const listing = await live("Flat with labelled facts");
    const tiles = Object.fromEntries(keyFactTiles(listing));
    expect(tiles).toMatchObject({ Bedrooms: "2 BHK", Furnishing: "Semi-furnished" });
    expect(tiles["Carpet area"]).toMatch(/1,050/);
    expect(tiles.Available).toBeDefined();
  });
});

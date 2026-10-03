// SAMPLE listings for local development ONLY.
//
// Every organization, property and listing written here is flagged as a sample
// (organizations.is_sample, properties.source = 'sample', listings.is_sample) and
// is badged as such in the UI. Names are deliberately generic ("Sample …") so they
// cannot be mistaken for real developers or projects, and RERA numbers are
// visibly fake. Output is deterministic, so URLs stay stable between runs.
//
//   npm run db:seed:sample
import pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { PLACES, seedReference } from "./reference.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {}

// ── Safety: never against production, never against a remote database by accident ──
const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed sample listings with NODE_ENV=production.");
  process.exit(1);
}
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(host) && !process.argv.includes("--allow-remote")) {
  console.error(`Refusing to seed sample listings into non-local database host "${host}". Pass --allow-remote if you really mean it.`);
  process.exit(1);
}

// ── Deterministic randomness ─────────────────────────────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260917);
const between = (min, max) => min + rand() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const roundTo = (value, step) => Math.round(value / step) * step;


// ── Market assumptions per locality (sale ₹/sqft on carpet area) ─────────────
const RATE = {
  gachibowli: 8500, kondapur: 7800, madhapur: 9500, kukatpally: 6500, kokapet: 9000,
  whitefield: 8000, hsr_layout: 12000, indiranagar: 16000, electronic_city: 5500, sarjapur_road: 7000,
  baner: 10500, hinjewadi: 7000, kharadi: 9500, wakad: 7500,
  powai: 24000, andheri_west: 28000, goregaon_east: 20000, chembur: 21000,
};
// Typical monthly rent as a fraction of sale value (gross yield ≈ 2.5–3.5% a year).
const RENT_FACTOR = 0.0026;
// Security deposit convention in months of rent.
const DEPOSIT_MONTHS = { hyderabad: 2, bengaluru: 6, pune: 2, mumbai: 3 };
// PG base rent per bed for a double room.
const PG_BASE = { hyderabad: 8500, bengaluru: 10000, pune: 9000, mumbai: 13500 };

const IMAGES = {
  interior: ["/images/properties/home-sunlit-interior.jpg"],
  residence: ["/images/properties/residence-dusk.jpg"],
  construction: ["/images/architecture/construction-dusk.jpg"],
  city: ["/images/architecture/city-aerial-dusk.jpg", "/images/hero/hero-skyline-dusk.jpg", "/images/architecture/city-night.jpg"],
  facade: ["/images/architecture/modernist-facade.jpg", "/images/architecture/concrete-curve.jpg"],
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 17, 6, 0, 0);

// ── Build the locality index from reference data ─────────────────────────────
const localities = [];
for (const state of PLACES.states) {
  for (const city of state.cities) {
    for (const [slug, name, lat, lng, pin] of city.localities) {
      localities.push({ slug, name, lat, lng, pin, city: city.slug, cityName: city.name, path: `in.${state.slug}.${city.slug}.${slug}` });
    }
  }
}

// Sale, rent and PG samples need market rates; homestay-only places (Goa) are left out of them.
const marketLocalities = localities.filter((l) => RATE[l.slug]);

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (text, params) => client.query(text, params);

  try {
    await q("BEGIN");
    await seedReference(client);

    // ── Clear previous sample data (in dependency order) ─────────────────────
    // Only this script's organizations: sample organizations with no members. The workspace
    // seed (db:seed:dev) also flags its data as sample, and must survive a re-run of this one.
    const mine = `SELECT o.id FROM orgs.organizations o WHERE o.is_sample
                    AND NOT EXISTS (SELECT 1 FROM orgs.memberships m WHERE m.organization_id = o.id)`;
    const { rows: oldAddr } = await q(`
      SELECT address_id AS id FROM real_estate.properties WHERE source = 'sample' AND organization_id IN (${mine})
      UNION SELECT p.address_id FROM real_estate.projects p WHERE p.organization_id IN (${mine})`);
    await q(`DELETE FROM marketplace.listings WHERE is_sample AND organization_id IN (${mine})`);
    await q(`DELETE FROM real_estate.properties WHERE source = 'sample' AND organization_id IN (${mine})`);
    await q(`DELETE FROM real_estate.buildings WHERE project_id IN (SELECT p.id FROM real_estate.projects p WHERE p.organization_id IN (${mine}))`);
    await q(`DELETE FROM real_estate.projects WHERE organization_id IN (${mine})`);
    if (oldAddr.length) await q(`DELETE FROM geography.addresses WHERE id = ANY($1::uuid[])`, [oldAddr.map((r) => r.id)]);
    await q(`DELETE FROM orgs.organizations WHERE id IN (${mine})`);

    // ── Lookups ───────────────────────────────────────────────────────────────
    const placeId = Object.fromEntries((await q(`SELECT path::text, id FROM geography.places`)).rows.map((r) => [r.path, r.id]));
    const typeId = Object.fromEntries((await q(`SELECT code, id FROM real_estate.property_types`)).rows.map((r) => [r.code, r.id]));
    const amenityId = Object.fromEntries((await q(`SELECT code, id FROM real_estate.amenities`)).rows.map((r) => [r.code, r.id]));

    // Shared image assets: one media row per file, linked to many properties (D8).
    const mediaId = {};
    for (const key of Object.values(IMAGES).flat()) {
      const { rows } = await q(
        `INSERT INTO real_estate.media (id, storage_key, storage_provider, media_type, mime_type, alt_text)
         VALUES ($1, $2, 'public', 'image', 'image/jpeg', 'Sample photograph')
         ON CONFLICT (storage_key) DO UPDATE SET updated_at = now() RETURNING id`,
        [uuidv7(), key],
      );
      mediaId[key] = rows[0].id;
    }

    // ── Sample organizations ─────────────────────────────────────────────────
    const orgs = {};
    for (const [key, name, type] of [
      ["brokerA", "Sample Realty Partners", "brokerage"],
      ["brokerB", "Sample Homes Brokerage", "brokerage"],
      ["developerA", "Sample Developers", "developer"],
      ["developerB", "Sample Estates", "developer"],
      ["pg", "Sample Living PGs", "pg_operator"],
      ["stays", "Sample Homestays", "property_manager"],
    ]) {
      const id = uuidv7();
      await q(`INSERT INTO orgs.organizations (id, name, slug, org_type, is_sample) VALUES ($1, $2, $3, $4, true)`, [
        id,
        name,
        `sample-${key.toLowerCase()}`,
        type,
      ]);
      orgs[key] = id;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    async function address(loc, line1) {
      const id = uuidv7();
      const lat = loc.lat + between(-0.012, 0.012);
      const lng = loc.lng + between(-0.012, 0.012);
      await q(
        `INSERT INTO geography.addresses (id, place_id, line1, postal_code, location)
         VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)`,
        [id, placeId[loc.path], line1, loc.pin, lng, lat],
      );
      return id;
    }

    async function property({ loc, type, org, lifecycle, carpet, projectId = null, buildingId = null, floor = null, totalFloors = null, unit = null, yearBuilt = null, images, amenities = [] }) {
      const id = uuidv7();
      const addressId = await address(loc, "Sample address, not a real property");
      await q(
        `INSERT INTO real_estate.properties
          (id, address_id, property_type_id, organization_id, project_id, building_id, floor_number, total_floors, unit_number,
           carpet_area_sqft, built_up_area_sqft, super_built_up_area_sqft, year_built, lifecycle_status, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'sample')`,
        [
          id, addressId, typeId[type], org, projectId, buildingId, floor, totalFloors, unit,
          carpet, carpet ? Math.round(carpet * 1.15) : null, carpet ? Math.round(carpet * 1.3) : null, yearBuilt, lifecycle,
        ],
      );
      for (const [i, key] of images.entries()) {
        await q(`INSERT INTO real_estate.media_links (id, media_id, property_id, sort_order) VALUES ($1, $2, $3, $4)`, [uuidv7(), mediaId[key], id, i]);
      }
      for (const code of amenities) {
        await q(`INSERT INTO real_estate.property_amenities (property_id, amenity_id) VALUES ($1, $2)`, [id, amenityId[code]]);
      }
      return id;
    }

    async function listing({ propertyId, org, transactionType, title, description, price, deposit = null, maintenance = null, declaredRent = null, availableFrom = null, rera = null, negotiable = false, priceDropFrom = null }) {
      const id = uuidv7();
      const publishedAt = new Date(NOW - int(1, 45) * DAY - int(0, 86_000) * 1000);
      await q(
        `INSERT INTO marketplace.listings
          (id, property_id, organization_id, transaction_type, status, title, description, price, price_negotiable,
           deposit_amount, maintenance_amount, declared_monthly_rent, available_from, rera_id, is_sample, published_at, expires_at)
         VALUES ($1,$2,$3,$4,'published',$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15)`,
        [id, propertyId, org, transactionType, title, description, price, negotiable, deposit, maintenance, declaredRent, availableFrom, rera, publishedAt, new Date(publishedAt.getTime() + 90 * DAY)],
      );
      // Price history. An occasional earlier, higher asking price shows a price drop.
      if (priceDropFrom && priceDropFrom > price) {
        const changed = new Date(Math.min(publishedAt.getTime() + int(4, 12) * DAY, NOW - DAY));
        await q(`INSERT INTO marketplace.listing_prices (id, listing_id, price, effective) VALUES ($1, $2, $3, tstzrange($4, $5))`, [uuidv7(), id, priceDropFrom, publishedAt, changed]);
        await q(`INSERT INTO marketplace.listing_prices (id, listing_id, price, effective) VALUES ($1, $2, $3, tstzrange($4, NULL))`, [uuidv7(), id, price, changed]);
      } else {
        await q(`INSERT INTO marketplace.listing_prices (id, listing_id, price, effective) VALUES ($1, $2, $3, tstzrange($4, NULL))`, [uuidv7(), id, price, publishedAt]);
      }
      return id;
    }

    const BUILDING_AMENITIES = ["lift", "power_backup", "covered_parking", "gym", "swimming_pool", "clubhouse", "children_play_area", "gated_security", "cctv", "fire_safety"];
    const someAmenities = (pool, min, max) => pool.filter(() => chance(0.55)).slice(0, int(min, max));
    const FURNISH = ["unfurnished", "semi_furnished", "furnished"];
    const FACE = ["north", "north_east", "east", "south_east", "south", "west", "north_west"];
    const counts = { sale: 0, rent: 0, pg: 0, stays: 0, investEligible: 0, projects: 0 };

    // ── Under-construction projects (new launches: in Buy and in Invest) ─────
    const projectPlan = [
      ["kokapet", "Sample Residences — Kokapet", "developerA", "2028-06-30"],
      ["whitefield", "Sample Heights — Whitefield", "developerB", "2027-12-31"],
      ["hinjewadi", "Sample Park — Hinjewadi", "developerA", "2029-03-31"],
      ["powai", "Sample Bay — Powai", "developerB", "2028-09-30"],
    ];
    for (const [slug, name, orgKey, possession] of projectPlan) {
      const loc = localities.find((l) => l.slug === slug);
      const projectId = uuidv7();
      const addressId = await address(loc, "Sample project site, not a real development");
      counts.projects++;
      await q(
        `INSERT INTO real_estate.projects (id, organization_id, address_id, name, rera_number, status, launch_date, possession_date)
         VALUES ($1,$2,$3,$4,$5,'under_construction',$6,$7)`,
        [projectId, orgs[orgKey], addressId, name, `SAMPLE-RERA-${String(counts.projects).padStart(4, "0")}`, "2026-02-01", possession],
      );
      const buildingId = uuidv7();
      await q(`INSERT INTO real_estate.buildings (id, project_id, name, floors_above_ground) VALUES ($1,$2,'Tower A',$3)`, [buildingId, projectId, int(18, 32)]);

      for (const bhk of [2, 3, 3, 4]) {
        const carpet = { 2: int(950, 1150), 3: int(1350, 1700), 4: int(2100, 2600) }[bhk];
        const floor = int(3, 20);
        const unit = `${floor}${String(int(1, 8)).padStart(2, "0")}`;
        const propertyId = await property({
          loc, type: "apartment", org: orgs[orgKey], lifecycle: "under_construction", carpet, projectId, buildingId, floor, totalFloors: 28, unit,
          images: [pick(IMAGES.construction), pick(IMAGES.facade)], amenities: BUILDING_AMENITIES.slice(0, int(6, 10)),
        });
        await q(`INSERT INTO real_estate.residential_attributes (property_id, bedrooms, bathrooms, balconies, furnishing, facing, covered_parking) VALUES ($1,$2,$3,$4,'unfurnished',$5,$6)`,
          [propertyId, bhk, bhk, int(1, 3), pick(FACE), bhk >= 3 ? 2 : 1]);
        const price = roundTo(carpet * RATE[slug] * between(0.95, 1.08), 100000);
        await listing({
          propertyId, org: orgs[orgKey], transactionType: "sale",
          title: `${bhk} BHK apartment in ${name.split(" — ")[0]}, ${loc.name}`,
          description: `Under-construction ${bhk} BHK in a sample project. Possession expected by ${new Date(possession).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}.`,
          price, rera: `SAMPLE-RERA-${String(counts.projects).padStart(4, "0")}`, declaredRent: roundTo(price * RENT_FACTOR, 500),
        });
        counts.sale++;
        counts.investEligible++;
      }
    }

    // ── Ready homes for sale ─────────────────────────────────────────────────
    for (let i = 0; i < 26; i++) {
      const loc = marketLocalities[i % marketLocalities.length];
      const kind = pick(["apartment", "apartment", "apartment", "villa", "independent_house", "builder_floor"]);
      const bhk = kind === "villa" ? int(3, 5) : kind === "apartment" ? pick([1, 2, 2, 3, 3, 4]) : int(2, 4);
      const carpet = kind === "villa" ? int(2400, 3600) : { 1: int(550, 700), 2: int(900, 1150), 3: int(1300, 1750), 4: int(2000, 2600), 5: int(2800, 3400) }[bhk];
      const premium = kind === "villa" ? 1.25 : kind === "independent_house" ? 1.1 : 1;
      const floor = kind === "apartment" ? int(1, 18) : kind === "builder_floor" ? int(1, 4) : null;
      const propertyId = await property({
        loc, type: kind, org: pick([orgs.brokerA, orgs.brokerB]), lifecycle: "ready", carpet, floor,
        totalFloors: kind === "apartment" ? int(floor + 1, 25) : kind === "builder_floor" ? 4 : int(2, 3),
        yearBuilt: int(2008, 2025),
        images: kind === "apartment" || kind === "builder_floor" ? [pick(IMAGES.interior), pick(IMAGES.facade)] : [pick(IMAGES.residence), pick(IMAGES.interior)],
        amenities: kind === "apartment" ? someAmenities(BUILDING_AMENITIES, 3, 8) : someAmenities(["covered_parking", "power_backup", "gated_security", "cctv", "modular_kitchen"], 2, 5),
      });
      await q(`INSERT INTO real_estate.residential_attributes (property_id, bedrooms, bathrooms, balconies, furnishing, facing, covered_parking) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [propertyId, bhk, Math.max(1, bhk - int(0, 1)), int(0, 3), pick(FURNISH), pick(FACE), int(0, 2)]);
      const price = roundTo(carpet * RATE[loc.slug] * premium * between(0.9, 1.12), 50000);
      const label = { apartment: "apartment", villa: "villa", independent_house: "independent house", builder_floor: "builder floor" }[kind];
      await listing({
        propertyId, org: pick([orgs.brokerA, orgs.brokerB]), transactionType: "sale",
        title: `${bhk} BHK ${label} in ${loc.name}`,
        description: `A ready-to-move ${bhk} BHK ${label} in ${loc.name}, ${loc.cityName}. Sample listing for development.`,
        price, negotiable: chance(0.4), maintenance: kind === "apartment" ? roundTo(carpet * between(2.5, 4.5), 100) : null,
        priceDropFrom: chance(0.25) ? roundTo(price * between(1.04, 1.1), 50000) : null,
      });
      counts.sale++;
    }

    // ── Homes for rent ───────────────────────────────────────────────────────
    for (let i = 0; i < 24; i++) {
      const loc = marketLocalities[(i * 7) % marketLocalities.length];
      const kind = pick(["apartment", "apartment", "apartment", "studio", "independent_house", "builder_floor"]);
      const bhk = kind === "studio" ? 1 : pick([1, 2, 2, 2, 3, 3]);
      const carpet = kind === "studio" ? int(380, 460) : { 1: int(550, 700), 2: int(900, 1150), 3: int(1300, 1700) }[bhk];
      const furnishing = pick(FURNISH);
      const furnishFactor = { unfurnished: 0.9, semi_furnished: 1, furnished: 1.15 }[furnishing];
      const floor = kind === "apartment" || kind === "studio" ? int(1, 15) : kind === "builder_floor" ? int(1, 4) : null;
      const propertyId = await property({
        loc, type: kind, org: pick([orgs.brokerA, orgs.brokerB]), lifecycle: "occupied", carpet, floor,
        totalFloors: floor ? int(floor + 1, 20) : 2, yearBuilt: int(2010, 2025),
        images: [pick(IMAGES.interior), pick([...IMAGES.facade, ...IMAGES.residence])],
        amenities: someAmenities([...BUILDING_AMENITIES.slice(0, 5), "modular_kitchen", "air_conditioning", "wardrobes", "gated_security", "cctv"], 3, 7),
      });
      await q(`INSERT INTO real_estate.residential_attributes (property_id, bedrooms, bathrooms, balconies, furnishing, facing, covered_parking) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [propertyId, kind === "studio" ? 0 : bhk, Math.max(1, bhk - int(0, 1)), int(0, 2), furnishing, pick(FACE), int(0, 1)]);
      const rent = roundTo(carpet * RATE[loc.slug] * RENT_FACTOR * furnishFactor * between(0.9, 1.1), 500);
      const label = kind === "studio" ? "Studio apartment" : `${bhk} BHK ${{ apartment: "apartment", independent_house: "independent house", builder_floor: "builder floor" }[kind]}`;
      await listing({
        propertyId, org: pick([orgs.brokerA, orgs.brokerB]), transactionType: "rent",
        title: `${furnishing === "furnished" ? "Furnished " : ""}${label} for rent in ${loc.name}`,
        description: `${label.charAt(0).toUpperCase() + label.slice(1)} in ${loc.name}, ${loc.cityName}, ${furnishing.replace("_", "-")}. Sample listing for development.`,
        price: rent, deposit: rent * DEPOSIT_MONTHS[loc.city], maintenance: chance(0.6) ? roundTo(between(1500, 5000), 100) : null,
        // About 40% are available now, the rest within the next two months.
        availableFrom: new Date(NOW + (chance(0.4) ? -int(1, 20) : int(3, 60)) * DAY).toISOString().slice(0, 10),
      });
      counts.rent++;
    }

    // ── PGs ──────────────────────────────────────────────────────────────────
    const pgPolicies = ["men", "men", "men", "men", "men", "men", "women", "women", "women", "women", "women", "women", "any", "any", "any", "any"];
    for (let i = 0; i < pgPolicies.length; i++) {
      const policy = pgPolicies[i];
      const loc = marketLocalities[(i * 5 + 2) % marketLocalities.length];
      const rooms = int(8, 24);
      const configs = [];
      for (const [occ, factor, share] of [["single", 1.55, 0.6], ["double", 1, 0.95], ["triple", 0.78, 0.6], ["quad", 0.65, 0.2]]) {
        if (!chance(share)) continue;
        const hasAc = chance(0.5);
        configs.push({ occ, hasAc, attached: chance(0.6), rent: roundTo(PG_BASE[loc.city] * factor * (hasAc ? 1.15 : 1) * between(0.9, 1.1), 250), beds: int(0, 6) });
      }
      if (!configs.length) configs.push({ occ: "double", hasAc: false, attached: true, rent: roundTo(PG_BASE[loc.city], 250), beds: 3 });
      const meals = pick(["none", "breakfast", "two", "three", "three"]);
      const propertyId = await property({
        loc, type: "pg", org: orgs.pg, lifecycle: "occupied", carpet: null, totalFloors: int(3, 6), yearBuilt: int(2012, 2024),
        images: [pick(IMAGES.interior), pick(IMAGES.facade)],
        amenities: [...someAmenities(["wifi", "laundry", "housekeeping", "hot_water", "study_table"], 3, 5), ...someAmenities(["power_backup", "cctv", "air_conditioning", "gated_security"], 1, 3)],
      });
      await q(`INSERT INTO real_estate.pg_attributes (property_id, total_rooms, total_beds, attached_bathrooms, common_kitchen) VALUES ($1,$2,$3,$4,$5)`,
        [propertyId, rooms, rooms * 2 + int(0, rooms), int(0, rooms), chance(0.5)]);
      const minRent = Math.min(...configs.map((c) => c.rent));
      const who = { men: "Men's PG", women: "Women's PG", any: "Co-living PG" }[policy];
      const listingId = await listing({
        propertyId, org: orgs.pg, transactionType: "pg", title: `${who} in ${loc.name}`,
        description: `${who} in ${loc.name}, ${loc.cityName}. ${meals === "none" ? "No meals" : meals === "breakfast" ? "Breakfast included" : `${meals === "two" ? "Two" : "Three"} meals a day included`}. Sample listing for development.`,
        price: minRent, availableFrom: new Date(NOW + int(0, 20) * DAY).toISOString().slice(0, 10),
      });
      await q(`INSERT INTO marketplace.pg_listing_terms (listing_id, gender_policy, meals, food_preference, notice_period_days, lock_in_months, entry_curfew, visitors_allowed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [listingId, policy, meals, meals === "none" ? null : pick(["veg", "veg", "both", "non_veg"]), pick([15, 30, 30]), pick([0, 3, 6]), chance(0.5) ? pick(["22:00", "22:30", "23:00"]) : null, chance(0.4)]);
      for (const c of configs) {
        await q(`INSERT INTO marketplace.pg_room_offers (id, listing_id, occupancy, rent_per_bed, deposit_amount, beds_available, has_ac, attached_bathroom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [uuidv7(), listingId, c.occ, c.rent, c.rent * pick([1, 2]), c.beds, c.hasAc, c.attached]);
      }
      counts.pg++;
    }

    // ── Commercial spaces (Invest) ───────────────────────────────────────────
    const commercialLocs = ["madhapur", "gachibowli", "whitefield", "indiranagar", "kharadi", "baner", "andheri_west", "powai"];
    for (const slug of commercialLocs) {
      const loc = localities.find((l) => l.slug === slug);
      const kind = pick(["office", "office", "retail"]);
      const carpet = kind === "office" ? int(1200, 6000) : int(250, 900);
      const propertyId = await property({
        loc, type: kind, org: pick([orgs.brokerA, orgs.brokerB]), lifecycle: "ready", carpet, floor: kind === "office" ? int(2, 12) : 0,
        totalFloors: int(4, 15), yearBuilt: int(2012, 2024), images: [pick(IMAGES.city), pick(IMAGES.facade)],
        amenities: someAmenities(["lift", "power_backup", "covered_parking", "cctv", "fire_safety", "air_conditioning"], 3, 6),
      });
      await q(`INSERT INTO real_estate.commercial_attributes (property_id, grade, workstations, fitout_status) VALUES ($1,$2,$3,$4)`,
        [propertyId, kind === "office" ? pick(["A", "A", "B"]) : null, kind === "office" ? Math.round(carpet / 75) : null, pick(["bare_shell", "warm_shell", "fully_fitted"])]);
      const price = roundTo(carpet * RATE[slug] * between(1.05, 1.35), 100000);
      await listing({
        propertyId, org: pick([orgs.brokerA, orgs.brokerB]), transactionType: "sale",
        title: `${kind === "office" ? "Office space" : "Retail shop"} in ${loc.name}`,
        description: `${kind === "office" ? "Office" : "Retail"} space in ${loc.name}, ${loc.cityName}. The declared rent is the seller's figure, not a Trustbrick estimate. Sample listing for development.`,
        price, negotiable: true, declaredRent: roundTo((price * between(0.06, 0.085)) / 12, 1000),
      });
      counts.sale++;
      counts.investEligible++;
    }

    // ── Plots (Buy and Invest) and commercial land (Invest) ─────────────────
    const PLOT_NOUN = { residential_plot: "residential plot", open_plot: "open plot", commercial_plot: "commercial plot" };
    for (const [slug, kind] of [["kokapet", "residential_plot"], ["sarjapur_road", "residential_plot"], ["hinjewadi", "commercial_plot"], ["electronic_city", "residential_plot"], ["wakad", "residential_plot"], ["kondapur", "commercial_plot"], ["kokapet", "open_plot"], ["wakad", "open_plot"], ["electronic_city", "open_plot"]]) {
      const loc = localities.find((l) => l.slug === slug);
      const sqyd = int(150, 600);
      const propertyId = await property({ loc, type: kind, org: pick([orgs.brokerA, orgs.brokerB]), lifecycle: "ready", carpet: null, images: [pick(IMAGES.city)], amenities: someAmenities(["gated_security", "cctv"], 0, 2) });
      await q(`INSERT INTO real_estate.land_attributes (property_id, plot_area_sqyd, zoning, road_width_ft, corner_plot) VALUES ($1,$2,$3,$4,$5)`,
        [propertyId, sqyd, kind === "commercial_plot" ? "commercial" : "residential", pick([30, 40, 60]), chance(0.25)]);
      const price = roundTo(sqyd * 9 * RATE[slug] * between(0.55, 0.8), 100000);
      await listing({
        propertyId, org: pick([orgs.brokerA, orgs.brokerB]), transactionType: "sale",
        title: `${sqyd} sq yd ${PLOT_NOUN[kind]} in ${loc.name}`,
        description: `${PLOT_NOUN[kind].replace(/^./, (c) => c.toUpperCase())} in ${loc.name}, ${loc.cityName}. Sample listing for development.`,
        price, negotiable: true, priceDropFrom: chance(0.3) ? roundTo(price * 1.06, 100000) : null,
      });
      counts.sale++;
      counts.investEligible++;
    }

    // ── Homestays ────────────────────────────────────────────────────────────
    // Sample stays have no host, so they can be browsed but not booked.
    const stayPlan = [
      ["calangute", "villa", "entire_home", 3, 6, 9500, 12500, 1500, 2, false, true, "Sample villa with a pool, 10 minutes from Calangute beach"],
      ["anjuna", "independent_house", "private_room", 1, 2, 2200, 2800, 0, 1, true, true, "Sample garden room in an Anjuna family home"],
      ["candolim", "apartment", "entire_home", 2, 4, 5200, 6500, 800, 2, true, false, "Sample sea-view apartment in Candolim"],
      ["panaji", "independent_house", "entire_home", 3, 7, 8200, 9800, 1200, 2, false, false, "Sample Portuguese-era home in Fontainhas, Panaji"],
      ["indiranagar", "apartment", "entire_home", 1, 2, 3800, 4200, 500, 1, true, false, "Sample studio-style flat off 100 Feet Road"],
      ["andheri_west", "studio", "entire_home", 1, 2, 4500, 5200, 600, 1, true, false, "Sample studio near Andheri West station"],
      ["baner", "villa", "entire_home", 4, 8, 11000, 14500, 2000, 2, false, true, "Sample hillside villa with a lawn in Baner"],
      ["gachibowli", "apartment", "private_room", 1, 2, 1800, 1800, 0, 1, true, false, "Sample private room near the financial district"],
    ];
    const STAY_IMAGES = [IMAGES.interior[0], IMAGES.residence[0], IMAGES.facade[0]];
    for (const [slug, type, space, bedrooms, guests, price, weekend, cleaning, minNights, instant, pets, title] of stayPlan) {
      const loc = localities.find((l) => l.slug === slug);
      const propertyId = await property({
        loc, type, org: orgs.stays, lifecycle: "ready", carpet: bedrooms * int(380, 520), totalFloors: int(1, 3), yearBuilt: int(1950, 2022),
        images: [pick(STAY_IMAGES), pick(STAY_IMAGES)],
        amenities: [...someAmenities(["wifi", "kitchen", "tv", "washing_machine", "workspace", "self_check_in", "hot_water", "first_aid"], 3, 6), ...someAmenities(["air_conditioning", "power_backup", "swimming_pool", "covered_parking"], 1, 3)],
      });
      await q(`INSERT INTO real_estate.residential_attributes (property_id, bedrooms, bathrooms, balconies, furnishing) VALUES ($1,$2,$3,$4,'furnished')`,
        [propertyId, bedrooms, Math.max(1, bedrooms - int(0, 1)), int(0, 2)]);
      const listingId = await listing({
        propertyId, org: orgs.stays, transactionType: "stay", title,
        description: `${space === "entire_home" ? "The whole home" : "A private room"} in ${loc.name}, ${loc.cityName}, for up to ${guests} guests. Sample stay for development; it can't be booked.`,
        price,
      });
      await q(`INSERT INTO stays.stay_terms (listing_id, space_type, max_guests, beds, weekend_price, cleaning_fee, min_nights, max_nights, instant_book, cancellation_policy, pets_allowed, house_rules)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [listingId, space, guests, Math.max(1, bedrooms + int(0, 1)), weekend > price ? weekend : null, cleaning || null, minNights, pick([14, 30, 30]), instant,
          pick(["flexible", "moderate", "moderate", "strict"]), pets, "Quiet after 10 pm. No parties. Please take your shoes off inside."]);
      counts.stays++;
    }

    await q("COMMIT");
    console.log("Sample listings ready (development only):", counts);
  } catch (error) {
    await q("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await main();

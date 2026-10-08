import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { isReferenceId } from "@/lib/reference";
import { publicHost } from "@/lib/services/stays/hosts";
import { STAY_TERM_COLUMNS, type StayTermsView, stayTermsOf } from "@/lib/stays/terms";
import { type TourSummary, parseTourLink } from "@/lib/tours/terms";
import { type ListingFilters, type ListingKind, PLOT_TYPE_CODES } from "./filters";
import type { ListingSummary } from "./types";

export const PAGE_SIZE = 12;

export type { ListingSummary } from "./types";

type Row = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toSummary(r: Row): ListingSummary {
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    propertyId: String(r.property_id),
    title: String(r.title),
    transactionType: r.transaction_type as ListingSummary["transactionType"],
    status: String(r.status),
    price: Number(r.price),
    priceNegotiable: Boolean(r.price_negotiable),
    stay:
      r.st_space_type === null || r.st_space_type === undefined
        ? null
        : {
            spaceType: r.st_space_type as "entire_home" | "private_room",
            maxGuests: Number(r.st_max_guests),
            beds: Number(r.st_beds),
            instantBook: Boolean(r.st_instant_book),
            petsAllowed: Boolean(r.st_pets_allowed),
            cleaningFee: num(r.st_cleaning_fee),
          },
    offer: r.offer_title ? { title: String(r.offer_title), details: (r.offer_details as string) ?? null, validUntil: (r.offer_valid_until as string) ?? null } : null,
    depositAmount: num(r.deposit_amount),
    declaredMonthlyRent: num(r.declared_monthly_rent),
    availableFrom: (r.available_from as string) ?? null,
    isSample: Boolean(r.is_sample),
    publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
    typeCode: String(r.type_code),
    typeName: String(r.type_name),
    category: String(r.category),
    locality: String(r.locality),
    city: (r.city as string) ?? null,
    carpetAreaSqft: num(r.carpet_area_sqft),
    plotAreaSqyd: num(r.plot_area_sqyd),
    lifecycleStatus: String(r.lifecycle_status),
    bedrooms: num(r.bedrooms),
    bathrooms: num(r.bathrooms),
    furnishing: (r.furnishing as string) ?? null,
    projectName: (r.project_name as string) ?? null,
    projectStatus: (r.project_status as string) ?? null,
    possessionDate: (r.possession_date as string) ?? null,
    genderPolicy: (r.gender_policy as ListingSummary["genderPolicy"]) ?? null,
    meals: (r.meals as string) ?? null,
    foodPreference: (r.food_preference as string) ?? null,
    occupancies: (r.occupancies as string[]) ?? [],
    image: (r.image as string) ?? null,
    tour: tourSummaryOf(r),
  };
}

function tourSummaryOf(r: Row): TourSummary | null {
  const rooms = Number(r.tour_rooms ?? 0);
  const model = Boolean(r.tour_model);
  // Only the provider's name leaves the server; the link itself is for Plus members.
  const link = r.tour_url ? (parseTourLink(String(r.tour_url))?.provider.name ?? null) : null;
  return rooms > 0 || model || link ? { rooms, model, link } : null;
}

// ── Shared SQL fragments (aliases: l = listing, p = property) ─────────────────
//
// Array values must go through sql.param(): a bare array expands to ($1, $2), which
// inside ANY() becomes a row constructor instead of an array.

/**
 * URL for a public photo: sample media live in /public, uploads are served by /media/… at the
 * rendition closest to the requested width. Private media (documents) are never selected here.
 */
export const photoUrl = (width: number) => sql.raw(`CASE WHEN m.storage_provider = 'public' THEN m.storage_key
  ELSE '/media/' || coalesce((SELECT v->>'key' FROM jsonb_array_elements(m.variants) v WHERE (v->>'width')::int = ${width}), m.storage_key) END`);

const summaryColumns = sql`
  l.id, l.reference_id, l.property_id, l.title, l.transaction_type, l.status, l.price, l.price_negotiable,
  CASE WHEN l.offer_valid_until IS NULL OR l.offer_valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN l.offer_title END AS offer_title,
  CASE WHEN l.offer_valid_until IS NULL OR l.offer_valid_until >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN l.offer_details END AS offer_details,
  to_char(l.offer_valid_until, 'YYYY-MM-DD') AS offer_valid_until,
  l.deposit_amount, l.declared_monthly_rent, to_char(l.available_from, 'YYYY-MM-DD') AS available_from,
  l.is_sample, l.published_at,
  pt.code AS type_code, pt.name AS type_name, pt.category,
  loc.name AS locality, city.name AS city,
  p.carpet_area_sqft, p.lifecycle_status, la.plot_area_sqyd,
  ra.bedrooms, ra.bathrooms, ra.furnishing,
  proj.name AS project_name, proj.status AS project_status, to_char(proj.possession_date, 'YYYY-MM-DD') AS possession_date,
  pgt.gender_policy, pgt.meals, pgt.food_preference,
  st.space_type AS st_space_type, st.max_guests AS st_max_guests, st.beds AS st_beds, st.instant_book AS st_instant_book,
  st.pets_allowed AS st_pets_allowed, st.cleaning_fee AS st_cleaning_fee,
  (SELECT array_agg(DISTINCT o.occupancy::text) FROM marketplace.pg_room_offers o WHERE o.listing_id = l.id) AS occupancies,
  (SELECT ${photoUrl(1280)} FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
     WHERE ml.property_id = p.id AND m.media_type = 'image' AND NOT m.is_private ORDER BY ml.sort_order LIMIT 1) AS image,
  (SELECT count(*)::int FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
     WHERE ml.property_id = p.id AND m.media_type = 'panorama' AND p.tour_hidden_at IS NULL) AS tour_rooms,
  (p.tour_hidden_at IS NULL AND EXISTS (SELECT 1 FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
     WHERE ml.property_id = p.id AND m.media_type = 'model_3d')) AS tour_model,
  CASE WHEN p.tour_hidden_at IS NULL THEN p.tour_url END AS tour_url`;

const summaryJoins = sql`
  JOIN real_estate.property_types pt ON pt.id = p.property_type_id
  JOIN geography.addresses a ON a.id = p.address_id
  JOIN geography.places loc ON loc.id = a.place_id
  LEFT JOIN geography.places city ON city.place_type = 'city' AND city.path @> loc.path
  LEFT JOIN real_estate.residential_attributes ra ON ra.property_id = p.id
  LEFT JOIN real_estate.land_attributes la ON la.property_id = p.id
  LEFT JOIN real_estate.projects proj ON proj.id = p.project_id
  LEFT JOIN marketplace.pg_listing_terms pgt ON pgt.listing_id = l.id
  LEFT JOIN stays.stay_terms st ON st.listing_id = l.id`;

const INVEST_CONDITION = sql`(pt.category IN ('commercial', 'land') OR proj.status IN ('planned', 'under_construction'))`;

function kindCondition(kind: ListingKind): SQL {
  switch (kind) {
    case "buy":
      // Homes, and plots to build one on. Other land stays under Invest.
      return sql`l.transaction_type = 'sale' AND (pt.category = 'residential' OR pt.code = ANY(${sql.param([...PLOT_TYPE_CODES])}))`;
    case "rent":
      return sql`l.transaction_type = 'rent'`;
    case "pg":
      return sql`l.transaction_type = 'pg'`;
    case "stay":
      return sql`l.transaction_type = 'stay' AND st.listing_id IS NOT NULL`;
    case "invest":
      return sql`l.transaction_type = 'sale' AND ${INVEST_CONDITION}`;
  }
}

const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

function filterConditions(kind: ListingKind, f: ListingFilters): SQL[] {
  const c: SQL[] = [
    sql`l.status = 'published'`,
    sql`l.deleted_at IS NULL`,
    sql`p.deleted_at IS NULL`,
    sql`(l.expires_at IS NULL OR l.expires_at > now())`,
    kindCondition(kind),
  ];

  if (f.city) c.push(sql`city.slug = ${f.city}`);
  if (f.localities.length) c.push(sql`loc.slug = ANY(${sql.param(f.localities)})`);
  if (f.q) {
    c.push(sql`(l.search_vector @@ websearch_to_tsquery('simple', ${f.q}) OR loc.name ILIKE ${`%${likeEscape(f.q)}%`})`);
  }
  if (f.minPrice) c.push(sql`l.price >= ${f.minPrice}`);
  if (f.maxPrice) c.push(sql`l.price <= ${f.maxPrice}`);
  if (f.types.length) c.push(sql`pt.code = ANY(${sql.param(f.types)})`);
  if (f.amenities.length) {
    // Every selected amenity must be present.
    c.push(sql`(SELECT count(DISTINCT am.code) FROM real_estate.property_amenities pa
                  JOIN real_estate.amenities am ON am.id = pa.amenity_id
                 WHERE pa.property_id = p.id AND am.code = ANY(${sql.param(f.amenities)})) = ${f.amenities.length}`);
  }

  // Bedrooms and furnishing describe homes. When plots are asked for too, they don't rule plots out.
  const homesOnly = (condition: SQL) => (f.types.some((t) => (PLOT_TYPE_CODES as readonly string[]).includes(t)) ? sql`(pt.category = 'land' OR ${condition})` : condition);
  if (f.bhk.length) {
    const exact = f.bhk.filter((b) => b !== "4").map(Number);
    const parts: SQL[] = [];
    if (exact.length) parts.push(sql`ra.bedrooms = ANY(${sql.param(exact)})`);
    if (f.bhk.includes("4")) parts.push(sql`ra.bedrooms >= 4`);
    c.push(homesOnly(sql`(${sql.join(parts, sql` OR `)})`));
  }
  if (f.furnishing.length) c.push(homesOnly(sql`ra.furnishing = ANY(${sql.param(f.furnishing)})`));
  // Each size range applies to its own kind of property: carpet area to homes, plot area to plots.
  if (f.sqftMin || f.sqftMax) {
    const size: SQL[] = [sql`p.carpet_area_sqft IS NOT NULL`];
    if (f.sqftMin) size.push(sql`p.carpet_area_sqft >= ${f.sqftMin}`);
    if (f.sqftMax) size.push(sql`p.carpet_area_sqft <= ${f.sqftMax}`);
    c.push(sql`(pt.category = 'land' OR (${sql.join(size, sql` AND `)}))`);
  }
  if (f.sqydMin || f.sqydMax) {
    const size: SQL[] = [sql`la.plot_area_sqyd IS NOT NULL`];
    if (f.sqydMin) size.push(sql`la.plot_area_sqyd >= ${f.sqydMin}`);
    if (f.sqydMax) size.push(sql`la.plot_area_sqyd <= ${f.sqydMax}`);
    c.push(sql`(pt.category <> 'land' OR (${sql.join(size, sql` AND `)}))`);
  }
  if (f.status === "ready") c.push(sql`p.lifecycle_status IN ('ready', 'occupied')`);
  if (f.status === "under_construction") c.push(sql`p.lifecycle_status IN ('planned', 'under_construction')`);
  if (f.availableNow) c.push(sql`(l.available_from IS NULL OR l.available_from <= current_date)`);
  if (f.tour) {
    c.push(sql`(p.tour_hidden_at IS NULL AND (p.tour_url IS NOT NULL OR EXISTS (SELECT 1 FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
                 WHERE ml.property_id = p.id AND m.media_type IN ('panorama', 'model_3d'))))`);
  }

  if (f.gender) c.push(sql`pgt.gender_policy = ${f.gender}`);
  if (f.mealsIncluded) c.push(sql`pgt.meals <> 'none'`);
  if (f.food === "veg") c.push(sql`pgt.food_preference IN ('veg', 'both')`);
  if (f.food === "non_veg") c.push(sql`pgt.food_preference IN ('non_veg', 'both')`);
  if (f.occupancy.length || f.ac || f.attachedBathroom) {
    // One room configuration must satisfy every room-level filter at once.
    const room: SQL[] = [sql`o.listing_id = l.id`, sql`o.beds_available > 0`];
    if (f.occupancy.length) room.push(sql`o.occupancy::text = ANY(${sql.param(f.occupancy)})`);
    if (f.ac) room.push(sql`o.has_ac`);
    if (f.attachedBathroom) room.push(sql`o.attached_bathroom`);
    c.push(sql`EXISTS (SELECT 1 FROM marketplace.pg_room_offers o WHERE ${sql.join(room, sql` AND `)})`);
  }

  if (kind === "stay") {
    if (f.guests) c.push(sql`st.max_guests >= ${f.guests}`);
    if (f.spaceType) c.push(sql`st.space_type = ${f.spaceType}`);
    if (f.instantBook) c.push(sql`st.instant_book`);
    if (f.petsAllowed) c.push(sql`st.pets_allowed`);
    if (f.checkIn && f.checkOut) {
      // Free for the whole stay, and the stay length suits the host.
      const range = sql`daterange(${f.checkIn}::date, ${f.checkOut}::date)`;
      c.push(sql`(${f.checkOut}::date - ${f.checkIn}::date) BETWEEN st.min_nights AND st.max_nights`);
      c.push(sql`NOT EXISTS (SELECT 1 FROM stays.bookings b WHERE b.listing_id = l.id AND b.status IN ('confirmed', 'checked_in', 'completed') AND b.dates && ${range})`);
      c.push(sql`NOT EXISTS (SELECT 1 FROM stays.stay_blocks k WHERE k.listing_id = l.id AND k.dates && ${range})`);
    }
  }

  if (f.category.length) {
    const parts: SQL[] = [];
    if (f.category.includes("new_launch")) parts.push(sql`proj.status IN ('planned', 'under_construction')`);
    if (f.category.includes("commercial")) parts.push(sql`pt.category = 'commercial'`);
    if (f.category.includes("land")) parts.push(sql`pt.category = 'land'`);
    c.push(sql`(${sql.join(parts, sql` OR `)})`);
  }
  if (f.possessionBy) c.push(sql`(proj.possession_date IS NULL OR proj.possession_date <= make_date(${f.possessionBy}, 12, 31))`);
  if (f.minYield) {
    c.push(sql`(l.declared_monthly_rent IS NOT NULL AND l.declared_monthly_rent * 12 * 100 / l.price >= ${f.minYield})`);
  }
  return c;
}

// ── Keyset pagination: stable, and fast however deep the visitor scrolls ─────

type Cursor = [value: string | number, id: string];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(value: string | number, id: string) {
  return Buffer.from(JSON.stringify([value, id])).toString("base64url");
}

function decodeCursor(raw: string | undefined, sort: ListingFilters["sort"]): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[1] !== "string" || !UUID.test(parsed[1])) return null;
    if (sort === "newest") return typeof parsed[0] === "string" && !Number.isNaN(Date.parse(parsed[0])) ? (parsed as Cursor) : null;
    return typeof parsed[0] === "number" && Number.isFinite(parsed[0]) ? (parsed as Cursor) : null;
  } catch {
    return null;
  }
}

function orderAndCursor(f: ListingFilters, cursor: Cursor | null): { order: SQL; after: SQL | null } {
  switch (f.sort) {
    case "price_asc":
      return {
        order: sql`l.price ASC, l.id ASC`,
        after: cursor ? sql`(l.price, l.id) > (${cursor[0]}::numeric, ${cursor[1]}::uuid)` : null,
      };
    case "price_desc":
      return {
        order: sql`l.price DESC, l.id DESC`,
        after: cursor ? sql`(l.price, l.id) < (${cursor[0]}::numeric, ${cursor[1]}::uuid)` : null,
      };
    default:
      // NULLS LAST matches listings_browse_recent_idx exactly, so the planner can use it.
      return {
        order: sql`l.published_at DESC NULLS LAST, l.id DESC NULLS LAST`,
        after: cursor ? sql`(l.published_at, l.id) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : null,
      };
  }
}

export type SearchResult = { items: ListingSummary[]; total: number; nextCursor: string | null };

export async function searchListings(kind: ListingKind, filters: ListingFilters): Promise<SearchResult> {
  const conditions = filterConditions(kind, filters);
  const where = sql.join(conditions, sql` AND `);
  const { order, after } = orderAndCursor(filters, decodeCursor(filters.cursor, filters.sort));
  const pageWhere = after ? sql`${where} AND ${after}` : where;

  const [page, count] = await Promise.all([
    db.execute(sql`
      SELECT ${summaryColumns}
        FROM marketplace.listings l
        JOIN real_estate.properties p ON p.id = l.property_id
        ${summaryJoins}
       WHERE ${pageWhere}
       ORDER BY ${order}
       LIMIT ${PAGE_SIZE + 1}`),
    db.execute(sql`
      SELECT count(*)::int AS total
        FROM marketplace.listings l
        JOIN real_estate.properties p ON p.id = l.property_id
        ${summaryJoins}
       WHERE ${where}`),
  ]);

  const rows = page.rows.slice(0, PAGE_SIZE).map(toSummary);
  const hasMore = page.rows.length > PAGE_SIZE;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor(filters.sort === "newest" ? (last.publishedAt ?? "") : last.price, last.id) : null;

  return { items: rows, total: Number((count.rows[0] as Row).total), nextCursor };
}

// ── Sidebar options ───────────────────────────────────────────────────────────

export type BrowseOptions = {
  cities: { slug: string; name: string; localities: { slug: string; name: string }[] }[];
  types: { code: string; name: string }[];
  amenities: { code: string; name: string }[];
};

const TYPE_FILTER: Record<ListingKind, SQL | null> = {
  buy: sql`(category = 'residential' OR code = ANY(${sql.param([...PLOT_TYPE_CODES])}))`,
  rent: sql`category = 'residential'`,
  pg: null,
  stay: sql`'stay' = ANY(purposes)`,
  invest: sql`(category IN ('commercial', 'land') OR code = 'apartment')`,
};

const AMENITY_FILTER: Record<ListingKind, SQL> = {
  buy: sql`category IN ('building', 'safety')`,
  rent: sql`category IN ('building', 'unit', 'safety')`,
  pg: sql`(category IN ('pg', 'safety') OR code IN ('air_conditioning', 'power_backup'))`,
  invest: sql`category IN ('building', 'safety')`,
  stay: sql`(category IN ('stay', 'unit', 'safety') OR code IN ('wifi', 'hot_water', 'power_backup', 'swimming_pool', 'covered_parking'))`,
};

export const getBrowseOptions = cache(async (kind: ListingKind): Promise<BrowseOptions> => {
  const typeFilter = TYPE_FILTER[kind];
  const [places, types, amenities] = await Promise.all([
    db.execute(sql`
      SELECT city.slug AS city_slug, city.name AS city_name, loc.slug AS locality_slug, loc.name AS locality_name
        FROM geography.places city
        JOIN geography.places loc ON loc.parent_id = city.id AND loc.place_type = 'locality' AND loc.is_active
       WHERE city.place_type = 'city' AND city.is_active
       ORDER BY city.name, loc.name`),
    typeFilter
      ? db.execute(sql`SELECT code, name FROM real_estate.property_types WHERE ${typeFilter} ORDER BY sort_order`)
      : Promise.resolve({ rows: [] as Row[] }),
    db.execute(sql`SELECT code, name FROM real_estate.amenities WHERE ${AMENITY_FILTER[kind]} ORDER BY sort_order`),
  ]);

  const cities = new Map<string, BrowseOptions["cities"][number]>();
  for (const r of places.rows as Row[]) {
    const slug = String(r.city_slug);
    if (!cities.has(slug)) cities.set(slug, { slug, name: String(r.city_name), localities: [] });
    cities.get(slug)!.localities.push({ slug: String(r.locality_slug), name: String(r.locality_name) });
  }

  return {
    cities: [...cities.values()],
    types: (types.rows as Row[]).map((r) => ({ code: String(r.code), name: String(r.name) })),
    amenities: (amenities.rows as Row[]).map((r) => ({ code: String(r.code), name: String(r.name) })),
  };
});

// ── Listing detail ────────────────────────────────────────────────────────────

export type ListingDetail = ListingSummary & {
  description: string | null;
  maintenanceAmount: number | null;
  reraId: string | null;
  expiresAt: string | null;
  organizationName: string;
  builtUpAreaSqft: number | null;
  superBuiltUpAreaSqft: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  balconies: number | null;
  facing: string | null;
  coveredParking: number | null;
  postalCode: string | null;
  zoning: string | null;
  roadWidthFt: number | null;
  cornerPlot: boolean | null;
  commercialGrade: string | null;
  fitoutStatus: string | null;
  workstations: number | null;
  pg: {
    totalRooms: number;
    totalBeds: number;
    noticePeriodDays: number | null;
    lockInMonths: number | null;
    entryCurfew: string | null;
    visitorsAllowed: boolean;
    rooms: { occupancy: string; rentPerBed: number; depositAmount: number | null; bedsAvailable: number; hasAc: boolean; attachedBathroom: boolean }[];
  } | null;
  amenities: { code: string; name: string }[];
  images: { key: string; alt: string | null }[];
  priceHistory: { price: number; from: string; to: string | null }[];
  /** Homestays: full terms and the public face of the host. Never the exact address. */
  stay: (StayTermsView & { host: Awaited<ReturnType<typeof publicHost>>; hostUserId: string | null }) | null;
};

export const getListing = cache(async (referenceId: string): Promise<ListingDetail | null> => {
  if (!isReferenceId(referenceId, "LST")) return null;

  const { rows } = await db.execute(sql`
    SELECT ${summaryColumns},
      l.description, l.maintenance_amount, l.rera_id, l.expires_at, org.name AS organization_name,
      p.built_up_area_sqft, p.super_built_up_area_sqft, p.floor_number, p.total_floors, p.year_built, p.custom_amenities,
      ra.balconies, ra.facing, ra.covered_parking, a.postal_code,
      la.zoning, la.road_width_ft, la.corner_plot,
      ca.grade AS commercial_grade, ca.fitout_status, ca.workstations,
      pga.total_rooms, pga.total_beds, pgt.notice_period_days, pgt.lock_in_months,
      to_char(pgt.entry_curfew, 'HH24:MI') AS entry_curfew, pgt.visitors_allowed, ${STAY_TERM_COLUMNS},
      (SELECT la2.agent_user_id FROM marketplace.listing_agents la2 WHERE la2.listing_id = l.id AND la2.role = 'primary' AND la2.ended_at IS NULL) AS host_user_id
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN orgs.organizations org ON org.id = l.organization_id
      ${summaryJoins}
      LEFT JOIN real_estate.commercial_attributes ca ON ca.property_id = p.id
      LEFT JOIN real_estate.pg_attributes pga ON pga.property_id = p.id
     WHERE l.reference_id = ${referenceId} AND l.deleted_at IS NULL AND p.deleted_at IS NULL
       AND l.status IN ('published', 'transacted', 'expired')`);

  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const listingId = String(r.id);
  const propertyId = String(r.property_id);

  const [amenities, images, prices, rooms] = await Promise.all([
    db.execute(sql`SELECT am.code, am.name FROM real_estate.property_amenities pa
                     JOIN real_estate.amenities am ON am.id = pa.amenity_id
                    WHERE pa.property_id = ${propertyId} ORDER BY am.sort_order`),
    db.execute(sql`SELECT ${photoUrl(1920)} AS storage_key, m.alt_text FROM real_estate.media_links ml
                     JOIN real_estate.media m ON m.id = ml.media_id
                    WHERE ml.property_id = ${propertyId} AND m.media_type = 'image' AND NOT m.is_private ORDER BY ml.sort_order`),
    db.execute(sql`SELECT price, lower(effective) AS from_ts, upper(effective) AS to_ts
                     FROM marketplace.listing_prices WHERE listing_id = ${listingId} ORDER BY lower(effective)`),
    db.execute(sql`SELECT occupancy::text, rent_per_bed, deposit_amount, beds_available, has_ac, attached_bathroom
                     FROM marketplace.pg_room_offers WHERE listing_id = ${listingId}
                    ORDER BY array_position(ARRAY['single','double','triple','quad'], occupancy::text), rent_per_bed`),
  ]);

  const summary = toSummary(r);
  const stayTerms = stayTermsOf(r);
  const hostUserId = (r.host_user_id as string) ?? null;
  return {
    ...summary,
    description: (r.description as string) ?? null,
    maintenanceAmount: num(r.maintenance_amount),
    reraId: (r.rera_id as string) ?? null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    organizationName: String(r.organization_name),
    builtUpAreaSqft: num(r.built_up_area_sqft),
    superBuiltUpAreaSqft: num(r.super_built_up_area_sqft),
    floorNumber: num(r.floor_number),
    totalFloors: num(r.total_floors),
    yearBuilt: num(r.year_built),
    balconies: num(r.balconies),
    facing: (r.facing as string) ?? null,
    coveredParking: num(r.covered_parking),
    postalCode: (r.postal_code as string) ?? null,
    zoning: (r.zoning as string) ?? null,
    roadWidthFt: num(r.road_width_ft),
    cornerPlot: r.corner_plot === null || r.corner_plot === undefined ? null : Boolean(r.corner_plot),
    commercialGrade: (r.commercial_grade as string) ?? null,
    fitoutStatus: (r.fitout_status as string) ?? null,
    workstations: num(r.workstations),
    pg:
      summary.transactionType === "pg" && r.total_rooms !== null
        ? {
            totalRooms: Number(r.total_rooms),
            totalBeds: Number(r.total_beds),
            noticePeriodDays: num(r.notice_period_days),
            lockInMonths: num(r.lock_in_months),
            entryCurfew: (r.entry_curfew as string) ?? null,
            visitorsAllowed: Boolean(r.visitors_allowed),
            rooms: (rooms.rows as Row[]).map((o) => ({
              occupancy: String(o.occupancy),
              rentPerBed: Number(o.rent_per_bed),
              depositAmount: num(o.deposit_amount),
              bedsAvailable: Number(o.beds_available),
              hasAc: Boolean(o.has_ac),
              attachedBathroom: Boolean(o.attached_bathroom),
            })),
          }
        : null,
    stay: stayTerms ? { ...stayTerms, hostUserId, host: hostUserId ? await publicHost(hostUserId) : null } : null,
    // The standard amenities, then any the agent added in their own words.
    amenities: [
      ...(amenities.rows as Row[]).map((a) => ({ code: String(a.code), name: String(a.name) })),
      ...((r.custom_amenities as string[] | null) ?? []).map((name, i) => ({ code: `custom-${i}`, name })),
    ],
    images: (images.rows as Row[]).map((m) => ({ key: String(m.storage_key), alt: (m.alt_text as string) ?? null })),
    priceHistory: (prices.rows as Row[]).map((p) => ({
      price: Number(p.price),
      from: new Date(p.from_ts as string).toISOString(),
      to: p.to_ts ? new Date(p.to_ts as string).toISOString() : null,
    })),
  };
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function savedPropertyIds(userId: string, propertyIds: string[]): Promise<Set<string>> {
  if (!propertyIds.length) return new Set();
  const { rows } = await db.execute(sql`
    SELECT property_id FROM marketplace.saved_properties
     WHERE user_id = ${userId} AND property_id = ANY(${sql.param(propertyIds)}::uuid[])`);
  return new Set((rows as Row[]).map((r) => String(r.property_id)));
}

/** Saved properties with their most relevant listing: a live one if any, otherwise the latest. */
export async function listBookmarks(userId: string): Promise<ListingSummary[]> {
  const { rows } = await db.execute(sql`
    SELECT ${summaryColumns}
      FROM marketplace.saved_properties sp
      JOIN real_estate.properties p ON p.id = sp.property_id AND p.deleted_at IS NULL
      JOIN LATERAL (
        SELECT * FROM marketplace.listings x
         WHERE x.property_id = p.id AND x.deleted_at IS NULL
         ORDER BY (x.status = 'published') DESC, x.published_at DESC NULLS LAST
         LIMIT 1
      ) l ON true
      ${summaryJoins}
     WHERE sp.user_id = ${userId}
     ORDER BY sp.created_at DESC
     LIMIT 200`);
  return (rows as Row[]).map(toSummary);
}

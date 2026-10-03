import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/authz/actor";
import { listingScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { type ListingStatus, STATUS_GROUPS, type StatusGroup } from "@/lib/listings/lifecycle";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { LISTING_STATUSES, PURPOSES } from "@/lib/vocab";
import { STAY_TERM_COLUMNS, type StayTermsView, stayTermsOf } from "@/lib/stays/terms";

export type { StayTermsView } from "@/lib/stays/terms";
import { type MediaItem, listPropertyMedia } from "../media";
import { type Page, pageParams } from "../pagination";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export const listingTableFilters = z.object({
  group: z.enum(Object.keys(STATUS_GROUPS) as [StatusGroup, ...StatusGroup[]]).catch("all"),
  status: z.enum(LISTING_STATUSES).optional().catch(undefined),
  purpose: z.enum(PURPOSES).optional().catch(undefined),
  category: z.enum(["residential", "commercial", "land", "co_living"]).optional().catch(undefined),
  verification: z.enum(["unverified", "pending", "verified", "rejected"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  sort: z.enum(["updated", "created", "price_desc", "price_asc"]).catch("updated"),
});
export type ListingTableFilters = z.infer<typeof listingTableFilters>;

export type ListingTableRow = {
  id: string;
  referenceId: string;
  propertyReferenceId: string;
  title: string;
  purpose: "sale" | "rent" | "lease" | "pg" | "stay";
  typeName: string;
  category: string;
  status: ListingStatus;
  statusReason: string | null;
  price: number | null;
  locality: string;
  city: string | null;
  verification: string;
  agentName: string | null;
  agentReferenceId: string | null;
  organizationName: string;
  isSample: boolean;
  views: number;
  leads: number;
  createdAt: string;
  updatedAt: string;
  image: string | null;
};

const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The properties table in both workspaces: same query, the actor's scope decides the rows. */
export async function listListingsForActor(actor: Actor, filters: ListingTableFilters, page: number): Promise<Page<ListingTableRow>> {
  const where: SQL[] = [sql`l.deleted_at IS NULL`, listingScope(actor, "listings.view")];
  const group = STATUS_GROUPS[filters.group];
  if (filters.status) where.push(sql`l.status = ${filters.status}`);
  else if (group) where.push(sql`l.status = ANY(${sql.param([...group])}::text[])`);
  if (filters.purpose) where.push(sql`l.transaction_type = ${filters.purpose}`);
  if (filters.category) where.push(sql`pt.category = ${filters.category}`);
  if (filters.verification) where.push(sql`p.verification_status = ${filters.verification}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    where.push(sql`(l.reference_id = ${ref} OR p.reference_id = ${ref} OR l.title ILIKE ${`%${likeEscape(filters.q)}%`} OR loc.name ILIKE ${`%${likeEscape(filters.q)}%`})`);
  }
  const order = {
    updated: sql`l.updated_at DESC, l.id DESC`,
    created: sql`l.created_at DESC, l.id DESC`,
    price_desc: sql`l.price DESC NULLS LAST, l.id DESC`,
    price_asc: sql`l.price ASC NULLS LAST, l.id ASC`,
  }[filters.sort];
  const { limit, offset } = pageParams(page);
  const whereSql = sql.join(where, sql` AND `);

  const from = sql`
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN real_estate.property_types pt ON pt.id = p.property_type_id
      JOIN geography.addresses a ON a.id = p.address_id
      JOIN geography.places loc ON loc.id = a.place_id
      LEFT JOIN geography.places city ON city.id = loc.parent_id AND city.place_type = 'city'
      JOIN orgs.organizations o ON o.id = l.organization_id`;

  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT l.id, l.reference_id, p.reference_id AS property_reference_id, l.title, l.transaction_type, pt.name AS type_name, pt.category,
             l.status, l.status_reason, l.price, loc.name AS locality, city.name AS city, p.verification_status, o.name AS organization_name,
             l.is_sample, l.created_at, l.updated_at, ag.name AS agent_name, ag.reference_id AS agent_reference_id,
             (SELECT coalesce(sum(v.view_count), 0) FROM marketplace.listing_views v WHERE v.listing_id = l.id)::int AS views,
             (SELECT count(*) FROM crm.leads ld WHERE ld.listing_id = l.id AND ld.deleted_at IS NULL)::int AS leads,
             (SELECT CASE WHEN m.storage_provider = 'public' THEN m.storage_key
                          ELSE '/media/' || coalesce((SELECT v->>'key' FROM jsonb_array_elements(m.variants) v WHERE (v->>'width')::int = 640), m.storage_key) END
                FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
               WHERE ml.property_id = p.id AND m.media_type = 'image' AND NOT m.is_private ORDER BY ml.sort_order LIMIT 1) AS image
      ${from}
      LEFT JOIN LATERAL (
        SELECT u.name, coalesce(ap.reference_id, u.reference_id) AS reference_id
          FROM marketplace.listing_agents la JOIN identity.users u ON u.id = la.agent_user_id
          LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
         WHERE la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL LIMIT 1) ag ON true
      WHERE ${whereSql}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${from} WHERE ${whereSql}`),
  ]);

  return {
    rows: (rows.rows as Row[]).map((r) => ({
      id: String(r.id),
      referenceId: String(r.reference_id),
      propertyReferenceId: String(r.property_reference_id),
      title: String(r.title),
      purpose: r.transaction_type as ListingTableRow["purpose"],
      typeName: String(r.type_name),
      category: String(r.category),
      status: r.status as ListingStatus,
      statusReason: (r.status_reason as string) ?? null,
      price: num(r.price),
      locality: String(r.locality),
      city: (r.city as string) ?? null,
      verification: String(r.verification_status),
      agentName: (r.agent_name as string) ?? null,
      agentReferenceId: (r.agent_reference_id as string) ?? null,
      organizationName: String(r.organization_name),
      isSample: Boolean(r.is_sample),
      views: Number(r.views),
      leads: Number(r.leads),
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      image: (r.image as string) ?? null,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: limit,
  };
}

/** Counts per owner tab, for the "My properties" tabs. One grouped query. */
export async function listingGroupCounts(actor: Actor): Promise<Record<StatusGroup, number>> {
  const { rows } = await db.execute(sql`
    SELECT l.status, count(*)::int AS n FROM marketplace.listings l
     WHERE l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")} GROUP BY l.status`);
  const byStatus = new Map((rows as Row[]).map((r) => [String(r.status), Number(r.n)]));
  const out = {} as Record<StatusGroup, number>;
  for (const [group, statuses] of Object.entries(STATUS_GROUPS) as [StatusGroup, readonly ListingStatus[] | null][]) {
    out[group] = statuses ? statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0) : [...byStatus.values()].reduce((a, b) => a + b, 0);
  }
  return out;
}

// ── Detail, for the workspace (edit form, moderation, admin view) ──────────────

export type WorkspaceListing = {
  id: string;
  referenceId: string;
  propertyId: string;
  propertyReferenceId: string;
  status: ListingStatus;
  statusReason: string | null;
  purpose: "sale" | "rent" | "lease" | "pg" | "stay";
  title: string;
  description: string | null;
  isSample: boolean;
  type: { code: string; name: string; category: "residential" | "commercial" | "land" | "co_living" };
  organization: { id: string; name: string; referenceId: string };
  agent: { userId: string; name: string; referenceId: string | null; email: string } | null;
  location: {
    localityId: string;
    locality: string;
    cityId: string | null;
    city: string | null;
    line1: string | null;
    line2: string | null;
    landmark: string | null;
    postalCode: string | null;
    unitNumber: string | null;
    latitude: number;
    longitude: number;
    /** False when no pin was given and the locality's centre stands in. */
    pinExact: boolean;
  };
  property: {
    lifecycleStatus: string;
    ownershipType: string | null;
    yearBuilt: number | null;
    carpetAreaSqft: number | null;
    builtUpAreaSqft: number | null;
    superBuiltUpAreaSqft: number | null;
    floorNumber: number | null;
    totalFloors: number | null;
    verificationStatus: string;
  };
  residential: Row | null;
  commercial: Row | null;
  land: Row | null;
  pg: { attributes: Row | null; terms: Row | null; rooms: Row[] };
  /** Homestay terms, for stay listings. */
  stay: StayTermsView | null;
  pricing: {
    price: number | null;
    priceNegotiable: boolean;
    depositAmount: number | null;
    maintenanceAmount: number | null;
    declaredMonthlyRent: number | null;
    availableFrom: string | null;
    leaseDurationMonths: number | null;
    brokerageType: string | null;
    brokerageValue: number | null;
    brokerageNegotiable: boolean;
    reraId: string | null;
  };
  /** Standard amenity codes, their names in display order, and the agent's own. */
  amenities: string[];
  amenityNames: string[];
  customAmenities: string[];
  media: MediaItem[];
  history: { fromStatus: string | null; toStatus: string; action: string; reason: string | null; actorName: string | null; createdAt: string }[];
  cases: { referenceId: string; status: string; flags: Record<string, unknown>; decisionReason: string | null; createdAt: string }[];
  stats: { views: number; uniqueViewers: number; leads: number; saves: number; visits: number };
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
};

const pick = (r: Row, keys: string[]): Row | null => (r[keys[0]] === null || r[keys[0]] === undefined ? null : Object.fromEntries(keys.map((k) => [k, r[k]])));

export async function getListingForActor(actor: Actor, referenceId: string): Promise<WorkspaceListing> {
  if (!isReferenceId(referenceId, "LST")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT l.*, p.reference_id AS property_reference_id, p.lifecycle_status, p.ownership_type, p.year_built, p.carpet_area_sqft,
           p.built_up_area_sqft, p.super_built_up_area_sqft, p.floor_number, p.total_floors, p.unit_number, p.verification_status, p.custom_amenities,
           pt.code AS type_code, pt.name AS type_name, pt.category,
           o.name AS org_name, o.reference_id AS org_reference_id,
           a.place_id AS locality_id, loc.name AS locality, city.id AS city_id, city.name AS city, a.line1, a.line2, a.landmark, a.postal_code,
           ST_Y(a.location::geometry) AS latitude, ST_X(a.location::geometry) AS longitude,
           coalesce(ST_DWithin(a.location, loc.centroid, 1), false) AS pin_is_centre,
           ra.bedrooms, ra.bathrooms, ra.balconies, ra.furnishing, ra.facing, ra.covered_parking,
           ca.fitout_status, ca.grade, ca.workstations, ca.washrooms, ca.parking_spaces, ca.power_backup, ca.loading_access, ca.suitable_for,
           lda.plot_area_sqyd, lda.zoning, lda.road_width_ft, lda.frontage_ft, lda.corner_plot, lda.boundary_wall, lda.survey_number,
           pga.total_rooms, pga.total_beds, pga.attached_bathrooms, pga.common_kitchen,
           pgt.gender_policy, pgt.meals, pgt.food_preference, pgt.notice_period_days, pgt.lock_in_months,
           to_char(pgt.entry_curfew, 'HH24:MI') AS entry_curfew, pgt.visitors_allowed, pgt.house_rules,
           la.agent_user_id, u.name AS agent_name, u.email AS agent_email, ap.reference_id AS agent_reference_id,
           to_char(l.available_from, 'YYYY-MM-DD') AS available_from_date, ${STAY_TERM_COLUMNS}
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN real_estate.property_types pt ON pt.id = p.property_type_id
      JOIN orgs.organizations o ON o.id = l.organization_id
      JOIN geography.addresses a ON a.id = p.address_id
      JOIN geography.places loc ON loc.id = a.place_id
      LEFT JOIN geography.places city ON city.id = loc.parent_id AND city.place_type = 'city'
      LEFT JOIN real_estate.residential_attributes ra ON ra.property_id = p.id
      LEFT JOIN real_estate.commercial_attributes ca ON ca.property_id = p.id
      LEFT JOIN real_estate.land_attributes lda ON lda.property_id = p.id
      LEFT JOIN real_estate.pg_attributes pga ON pga.property_id = p.id
      LEFT JOIN marketplace.pg_listing_terms pgt ON pgt.listing_id = l.id
      LEFT JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
      LEFT JOIN identity.users u ON u.id = la.agent_user_id
      LEFT JOIN orgs.agent_profiles ap ON ap.user_id = la.agent_user_id
      LEFT JOIN stays.stay_terms st ON st.listing_id = l.id
     WHERE l.reference_id = ${referenceId} AND l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const listingId = String(r.id);
  const propertyId = String(r.property_id);

  const [rooms, amenities, history, cases, stats, mediaItems] = await Promise.all([
    db.execute(sql`SELECT occupancy::text AS occupancy, rent_per_bed, deposit_amount, beds_available, has_ac, attached_bathroom
                     FROM marketplace.pg_room_offers WHERE listing_id = ${listingId}
                    ORDER BY array_position(ARRAY['single','double','triple','quad'], occupancy::text), rent_per_bed`),
    db.execute(sql`SELECT am.code, am.name FROM real_estate.property_amenities pa JOIN real_estate.amenities am ON am.id = pa.amenity_id
                    WHERE pa.property_id = ${propertyId} ORDER BY am.sort_order`),
    db.execute(sql`SELECT h.from_status, h.to_status, h.action, h.reason, h.created_at, u.name AS actor_name
                     FROM marketplace.listing_status_history h LEFT JOIN identity.users u ON u.id = h.actor_user_id
                    WHERE h.listing_id = ${listingId} ORDER BY h.created_at DESC, h.id DESC LIMIT 50`),
    db.execute(sql`SELECT reference_id, status, flags, decision_reason, created_at FROM trust.review_cases
                    WHERE listing_id = ${listingId} ORDER BY created_at DESC LIMIT 10`),
    db.execute(sql`SELECT
        (SELECT coalesce(sum(view_count), 0) FROM marketplace.listing_views WHERE listing_id = ${listingId})::int AS views,
        (SELECT count(DISTINCT viewer_key) FROM marketplace.listing_views WHERE listing_id = ${listingId})::int AS unique_viewers,
        (SELECT count(*) FROM crm.leads WHERE listing_id = ${listingId} AND deleted_at IS NULL)::int AS leads,
        (SELECT count(*) FROM marketplace.saved_properties WHERE property_id = ${propertyId})::int AS saves,
        (SELECT count(*) FROM crm.visits WHERE listing_id = ${listingId})::int AS visits`),
    listPropertyMedia(propertyId, { includePrivate: true }),
  ]);
  const s = stats.rows[0] as Row;

  return {
    id: listingId,
    referenceId: String(r.reference_id),
    propertyId,
    propertyReferenceId: String(r.property_reference_id),
    status: r.status as ListingStatus,
    statusReason: (r.status_reason as string) ?? null,
    purpose: r.transaction_type as WorkspaceListing["purpose"],
    title: String(r.title),
    description: (r.description as string) ?? null,
    isSample: Boolean(r.is_sample),
    type: { code: String(r.type_code), name: String(r.type_name), category: r.category as WorkspaceListing["type"]["category"] },
    organization: { id: String(r.organization_id), name: String(r.org_name), referenceId: String(r.org_reference_id) },
    agent: r.agent_user_id
      ? { userId: String(r.agent_user_id), name: String(r.agent_name), referenceId: (r.agent_reference_id as string) ?? null, email: String(r.agent_email) }
      : null,
    location: {
      localityId: String(r.locality_id),
      locality: String(r.locality),
      cityId: (r.city_id as string) ?? null,
      city: (r.city as string) ?? null,
      line1: (r.line1 as string) ?? null,
      line2: (r.line2 as string) ?? null,
      landmark: (r.landmark as string) ?? null,
      postalCode: (r.postal_code as string) ?? null,
      unitNumber: (r.unit_number as string) ?? null,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      pinExact: !r.pin_is_centre,
    },
    property: {
      lifecycleStatus: String(r.lifecycle_status),
      ownershipType: (r.ownership_type as string) ?? null,
      yearBuilt: num(r.year_built),
      carpetAreaSqft: num(r.carpet_area_sqft),
      builtUpAreaSqft: num(r.built_up_area_sqft),
      superBuiltUpAreaSqft: num(r.super_built_up_area_sqft),
      floorNumber: num(r.floor_number),
      totalFloors: num(r.total_floors),
      verificationStatus: String(r.verification_status),
    },
    residential: pick(r, ["bedrooms", "bathrooms", "balconies", "furnishing", "facing", "covered_parking"]),
    commercial: pick(r, ["fitout_status", "grade", "workstations", "washrooms", "parking_spaces", "power_backup", "loading_access", "suitable_for"]),
    land: pick(r, ["plot_area_sqyd", "zoning", "road_width_ft", "frontage_ft", "corner_plot", "boundary_wall", "survey_number"]),
    pg: {
      attributes: pick(r, ["total_rooms", "total_beds", "attached_bathrooms", "common_kitchen"]),
      terms: pick(r, ["gender_policy", "meals", "food_preference", "notice_period_days", "lock_in_months", "entry_curfew", "visitors_allowed", "house_rules"]),
      rooms: rooms.rows as Row[],
    },
    stay: stayTermsOf(r),
    pricing: {
      price: num(r.price),
      priceNegotiable: Boolean(r.price_negotiable),
      depositAmount: num(r.deposit_amount),
      maintenanceAmount: num(r.maintenance_amount),
      declaredMonthlyRent: num(r.declared_monthly_rent),
      availableFrom: (r.available_from_date as string) ?? null,
      leaseDurationMonths: num(r.lease_duration_months),
      brokerageType: (r.brokerage_type as string) ?? null,
      brokerageValue: num(r.brokerage_value),
      brokerageNegotiable: Boolean(r.brokerage_negotiable),
      reraId: (r.rera_id as string) ?? null,
    },
    amenities: (amenities.rows as Row[]).map((a) => String(a.code)),
    amenityNames: (amenities.rows as Row[]).map((a) => String(a.name)),
    customAmenities: (r.custom_amenities as string[] | null) ?? [],
    media: mediaItems,
    history: (history.rows as Row[]).map((h) => ({
      fromStatus: (h.from_status as string) ?? null,
      toStatus: String(h.to_status),
      action: String(h.action),
      reason: (h.reason as string) ?? null,
      actorName: (h.actor_name as string) ?? null,
      createdAt: iso(h.created_at)!,
    })),
    cases: (cases.rows as Row[]).map((c) => ({
      referenceId: String(c.reference_id),
      status: String(c.status),
      flags: (c.flags as Record<string, unknown>) ?? {},
      decisionReason: (c.decision_reason as string) ?? null,
      createdAt: iso(c.created_at)!,
    })),
    stats: { views: Number(s.views), uniqueViewers: Number(s.unique_viewers), leads: Number(s.leads), saves: Number(s.saves), visits: Number(s.visits) },
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    submittedAt: iso(r.submitted_at),
    publishedAt: iso(r.published_at),
  };
}

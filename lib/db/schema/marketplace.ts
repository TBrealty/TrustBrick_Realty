import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  real,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { deletedAt, id, money, referenceId, timestamps, tsvector, tstzrange } from "./columns";
import { users } from "./identity";
import { BROKERAGE_TYPES, LISTING_STATUSES } from "../../vocab";
import { memberships, organizations } from "./orgs";
import { media, properties } from "./real-estate";

/**
 * Market offers. A listing is one offer to sell, rent or let a property as a PG,
 * and comes and goes while the property persists (decision D1).
 */
export const marketplace = pgSchema("marketplace");

export const TRANSACTION_TYPES = ["sale", "rent", "lease", "pg", "stay"] as const;
/**
 * Lifecycle, validated in lib/listings/lifecycle.ts. Text with a CHECK rather than an enum
 * (as every other status in the schema): enum values cannot be removed, and a value added in a
 * migration cannot be used by the same migration run, which breaks fresh installs.
 */
export { BROKERAGE_TYPES, LISTING_STATUSES } from "../../vocab";
export const GENDER_POLICIES = ["men", "women", "any"] as const;
export const OCCUPANCIES = ["single", "double", "triple", "quad"] as const;

export const transactionType = marketplace.enum("transaction_type", TRANSACTION_TYPES);
export const genderPolicy = marketplace.enum("gender_policy", GENDER_POLICIES);
export const occupancy = marketplace.enum("occupancy", OCCUPANCIES);

export const listings = marketplace.table(
  "listings",
  {
    id: id(),
    referenceId: referenceId("LST"),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    transactionType: transactionType("transaction_type").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    description: text("description"),
    /**
     * Sale price, monthly rent, or — for PGs — the lowest current rent per bed,
     * kept in step with pg_room_offers so every listing sorts on one indexed column.
     */
    price: money("price"),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    priceNegotiable: boolean("price_negotiable").notNull().default(false),
    depositAmount: money("deposit_amount"),
    maintenanceAmount: money("maintenance_amount"),
    /** Rent the seller expects the property to fetch. Declared, not a Trustbrick estimate. */
    declaredMonthlyRent: money("declared_monthly_rent"),
    availableFrom: date("available_from"),
    reraId: text("rera_id"),
    brokerageType: text("brokerage_type"),
    brokerageValue: money("brokerage_value"),
    brokerageNegotiable: boolean("brokerage_negotiable").notNull().default(false),
    leaseDurationMonths: smallint("lease_duration_months"),
    /** An offer shown to customers, e.g. "No brokerage" or "First month's rent free". Optional expiry. */
    offerTitle: text("offer_title"),
    offerDetails: text("offer_details"),
    offerValidUntil: date("offer_valid_until"),
    /** The latest reason given for rejection, requested changes, unpublishing or removal. */
    statusReason: text("status_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Development sample data, badged in the UI and never seeded in production. */
    isSample: boolean("is_sample").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("description", '')), 'B')`,
    ),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    // The browse page: newest published listings of one type.
    index("listings_browse_recent_idx")
      .on(t.transactionType, t.publishedAt.desc(), t.id.desc())
      .where(sql`"status" = 'published' AND "deleted_at" IS NULL`),
    // Price-sorted browse. Partial, because only live listings are ever filtered by price.
    index("listings_browse_price_idx")
      .on(t.transactionType, t.price, t.id)
      .where(sql`"status" = 'published' AND "deleted_at" IS NULL`),
    index("listings_property_id_idx").on(t.propertyId),
    index("listings_organization_status_idx").on(t.organizationId, t.status),
    index("listings_created_by_idx").on(t.createdBy),
    index("listings_status_created_idx").on(t.status, t.createdAt),
    // The moderation queue, oldest first.
    index("listings_review_queue_idx")
      .on(t.submittedAt)
      .where(sql`"status" IN ('submitted', 'under_review') AND "deleted_at" IS NULL`),
    index("listings_search_vector_idx").using("gin", t.searchVector),
    check("listings_price_check", sql`"price" IS NULL OR "price" > 0`),
    // Only drafts (and drafts that were archived) may lack a price.
    check("listings_price_required_check", sql`"price" IS NOT NULL OR "status" IN ('draft', 'archived')`),
    check("listings_status_check", sql.raw(`"status" IN (${LISTING_STATUSES.map((v) => `'${v}'`).join(", ")})`)),
    check("listings_brokerage_check", sql.raw(`"brokerage_type" IS NULL OR "brokerage_type" IN (${BROKERAGE_TYPES.map((v) => `'${v}'`).join(", ")})`)),
    check("listings_lease_duration_check", sql`"lease_duration_months" IS NULL OR "lease_duration_months" BETWEEN 1 AND 600`),
    check("listings_published_at_check", sql`"status" <> 'published' OR "published_at" IS NOT NULL`),
    check("listings_currency_check", sql`"currency" ~ '^[A-Z]{3}$'`),
    check("listings_offer_check", sql`("offer_title" IS NULL AND "offer_details" IS NULL AND "offer_valid_until" IS NULL) OR ("offer_title" IS NOT NULL AND char_length("offer_title") BETWEEN 2 AND 60 AND coalesce(char_length("offer_details"), 0) <= 280)`),
  ],
);

/** Price history, never overwritten. Overlapping periods are rejected by an exclusion constraint. */
export const listingPrices = marketplace.table(
  "listing_prices",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    price: money("price").notNull(),
    effective: tstzrange("effective").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_prices_listing_id_idx").on(t.listingId), check("listing_prices_price_check", sql`"price" > 0`)],
);

/** D10: a PG listing's operating terms. The gender policy lives here, never on a person. */
export const pgListingTerms = marketplace.table(
  "pg_listing_terms",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    genderPolicy: genderPolicy("gender_policy").notNull(),
    meals: text("meals").notNull(),
    foodPreference: text("food_preference"),
    noticePeriodDays: smallint("notice_period_days"),
    lockInMonths: smallint("lock_in_months"),
    entryCurfew: time("entry_curfew"),
    visitorsAllowed: boolean("visitors_allowed").notNull().default(false),
    houseRules: text("house_rules"),
  },
  (t) => [
    index("pg_listing_terms_gender_idx").on(t.genderPolicy, t.listingId),
    check("pg_listing_terms_meals_check", sql`"meals" IN ('none', 'breakfast', 'two', 'three')`),
    check("pg_listing_terms_food_check", sql`"food_preference" IS NULL OR "food_preference" IN ('veg', 'non_veg', 'both')`),
  ],
);

/** The room configurations a PG offers at the same time, each priced per bed. */
export const pgRoomOffers = marketplace.table(
  "pg_room_offers",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    occupancy: occupancy("occupancy").notNull(),
    rentPerBed: money("rent_per_bed").notNull(),
    depositAmount: money("deposit_amount"),
    bedsAvailable: smallint("beds_available").notNull(),
    hasAc: boolean("has_ac").notNull().default(false),
    attachedBathroom: boolean("attached_bathroom").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("pg_room_offers_config_unique").on(t.listingId, t.occupancy, t.hasAc, t.attachedBathroom),
    index("pg_room_offers_listing_id_idx").on(t.listingId),
    check("pg_room_offers_values_check", sql`"rent_per_bed" > 0 AND "beds_available" >= 0`),
  ],
);

/** Bookmarks. A bookmark points at the property, so it survives the listing changing. */
export const savedProperties = marketplace.table(
  "saved_properties",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.propertyId] }), index("saved_properties_user_created_idx").on(t.userId, t.createdAt.desc())],
);

// ── Who is responsible for a listing ───────────────────────────────────────────

/**
 * The explicit link from a listing to the agent responsible for it. Ownership is never
 * inferred from created_by: an agent can hand a listing to a colleague, and history stays.
 */
export const listingAgents = marketplace.table(
  "listing_agents",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    agentUserId: uuid("agent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    role: text("role").notNull().default("primary"),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    // One current primary agent per listing.
    uniqueIndex("listing_agents_one_primary_idx").on(t.listingId).where(sql`"role" = 'primary' AND "ended_at" IS NULL`),
    // "My listings": the own-scope predicate.
    index("listing_agents_agent_current_idx").on(t.agentUserId, t.listingId).where(sql`"ended_at" IS NULL`),
    index("listing_agents_membership_idx").on(t.membershipId).where(sql`"ended_at" IS NULL`),
    check("listing_agents_role_check", sql`"role" IN ('primary', 'co_agent')`),
  ],
);

/** Every lifecycle change, who made it, and why. Never updated. */
export const listingStatusHistory = marketplace.table(
  "listing_status_history",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    /** No foreign key: history is append-only and must survive the actor's account. */
    actorUserId: uuid("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listing_status_history_listing_idx").on(t.listingId, t.createdAt.desc())],
);

/**
 * Listing views, one row per visitor per listing per day. The visitor key is a salted
 * hash (of the user ID, or of IP and user agent), never the raw values.
 */
export const listingViews = marketplace.table(
  "listing_views",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    viewedOn: date("viewed_on").notNull(),
    viewCount: integer("view_count").notNull().default(1),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.viewedOn, t.viewerKey] }),
    index("listing_views_viewed_on_idx").on(t.viewedOn),
  ],
);

// ── 360° photos taken with the app's guided camera ─────────────────────────────

export const CAPTURE_STATUSES = ["uploading", "queued", "stitching", "done", "failed"] as const;

/** One photo of a guided capture: where the phone pointed (degrees; yaw relative to the first photo). */
export type CaptureShot = { index: number; yaw: number; pitch: number; roll: number; key: string };

/**
 * A room photographed with the app's guided camera: about 30 photos, each with the direction the
 * phone pointed. Once all are uploaded, the stitching service joins them into one 360° photo,
 * which is added to the listing's tour like an uploaded one (and the photos are deleted).
 */
export const tourCaptures = marketplace.table(
  "tour_captures",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Who took it, and in which workspace: the 360° photo is added as them. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roomName: text("room_name").notNull(),
    /** The camera's horizontal field of view, in degrees: the stitcher's starting guess. */
    hfov: real("hfov").notNull(),
    shotCount: smallint("shot_count").notNull(),
    shots: jsonb("shots").$type<CaptureShot[]>().notNull().default([]),
    status: text("status").notNull().default("uploading"),
    attempts: smallint("attempts").notNull().default(0),
    error: text("error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("tour_captures_listing_idx").on(t.listingId, t.createdAt),
    index("tour_captures_pending_idx").on(t.createdAt).where(sql`"status" IN ('queued', 'stitching')`),
    check("tour_captures_status_check", sql.raw(`"status" IN (${CAPTURE_STATUSES.map((v) => `'${v}'`).join(", ")})`)),
    check("tour_captures_shot_count_check", sql`"shot_count" BETWEEN 6 AND 60`),
  ],
);

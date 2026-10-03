import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgSchema,
  primaryKey,
  smallint,
  jsonb,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { area, deletedAt, id, referenceId, timestamps } from "./columns";
import { addresses } from "./geography";
import { users } from "./identity";
import { organizations } from "./orgs";

/**
 * The physical world. A property survives every listing ever made for it
 * (decision D1). Units are properties, not a separate table (D2); floors are a
 * number on the property, not a table (D3).
 */
export const realEstate = pgSchema("real_estate");

/** `"column" IN ('a', 'b')` from a constant list, so the TS values and the CHECK cannot drift. */
const inList = (column: string, values: readonly string[]) =>
  `"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`;

import { CUSTOM_AMENITY_LIMIT, FACING, FURNISHING, LIFECYCLE_STATUSES, OWNERSHIP_TYPES, PROPERTY_CATEGORIES } from "../../vocab";

export { FACING, FURNISHING, LIFECYCLE_STATUSES, OWNERSHIP_TYPES, PROPERTY_CATEGORIES, PURPOSES } from "../../vocab";
export const PROPERTY_SOURCES = ["user_submitted", "org_submitted", "import", "verified", "sample"] as const;
export const PROJECT_STATUSES = ["planned", "under_construction", "ready"] as const;
export const PROPERTY_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"] as const;


/** A lookup table, not an enum: new property types are data, not a migration. */
export const propertyTypes = realEstate.table(
  "property_types",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    /** Which purposes the onboarding wizard offers this type for, e.g. plots are sale-only. */
    purposes: text("purposes").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  () => [
    check("property_types_category_check", sql.raw(inList("category", PROPERTY_CATEGORIES))),
    check("property_types_purposes_check", sql`"purposes" <@ ARRAY['sale', 'rent', 'lease', 'pg', 'stay']::text[]`),
  ],
);

export const projects = realEstate.table(
  "projects",
  {
    id: id(),
    referenceId: referenceId("PROJ"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    addressId: uuid("address_id")
      .notNull()
      .references(() => addresses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    reraNumber: text("rera_number"),
    status: text("status").notNull(),
    launchDate: date("launch_date"),
    possessionDate: date("possession_date"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("projects_organization_id_idx").on(t.organizationId),
    index("projects_status_possession_idx").on(t.status, t.possessionDate),
    check("projects_status_check", sql.raw(inList("status", PROJECT_STATUSES))),
  ],
);

export const buildings = realEstate.table(
  "buildings",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    floorsAboveGround: smallint("floors_above_ground"),
    ...timestamps,
  },
  (t) => [unique("buildings_project_name_unique").on(t.projectId, t.name)],
);

export const properties = realEstate.table(
  "properties",
  {
    id: id(),
    referenceId: referenceId("PRP"),
    addressId: uuid("address_id")
      .notNull()
      .unique()
      .references(() => addresses.id, { onDelete: "restrict" }),
    propertyTypeId: uuid("property_type_id")
      .notNull()
      .references(() => propertyTypes.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "restrict" }),
    floorNumber: smallint("floor_number"),
    /** "G", "LG", "14A" — many towers skip unlucky numbers. */
    floorLabel: text("floor_label"),
    totalFloors: smallint("total_floors"),
    unitNumber: text("unit_number"),
    /** Amenities the agent typed in, beyond the standard list. Not searchable; shown as written. */
    customAmenities: text("custom_amenities").array().notNull().default(sql`'{}'::text[]`),
    carpetAreaSqft: area("carpet_area_sqft"),
    builtUpAreaSqft: area("built_up_area_sqft"),
    superBuiltUpAreaSqft: area("super_built_up_area_sqft"),
    yearBuilt: smallint("year_built"),
    lifecycleStatus: text("lifecycle_status").notNull(),
    source: text("source").notNull(),
    ownershipType: text("ownership_type"),
    /** Set by an admin with properties.verify; separate from a listing passing review. */
    verificationStatus: text("verification_status").notNull().default("unverified"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    // D1: the same flat must not exist twice.
    uniqueIndex("properties_building_unit_unique")
      .on(t.buildingId, t.unitNumber)
      .where(sql`"deleted_at" IS NULL AND "building_id" IS NOT NULL AND "unit_number" IS NOT NULL`),
    index("properties_organization_id_idx").on(t.organizationId).where(sql`"deleted_at" IS NULL`),
    index("properties_project_building_idx").on(t.projectId, t.buildingId),
    index("properties_property_type_id_idx").on(t.propertyTypeId),
    index("properties_created_by_idx").on(t.createdBy),
    index("properties_created_at_idx").on(t.createdAt),
    check("properties_owner_check", sql`num_nonnulls("organization_id", "owner_user_id") >= 1`),
    check(
      "properties_area_order_check",
      sql`("carpet_area_sqft" IS NULL OR "built_up_area_sqft" IS NULL OR "carpet_area_sqft" <= "built_up_area_sqft")
      AND ("built_up_area_sqft" IS NULL OR "super_built_up_area_sqft" IS NULL OR "built_up_area_sqft" <= "super_built_up_area_sqft")`,
    ),
    check("properties_lifecycle_status_check", sql.raw(inList("lifecycle_status", LIFECYCLE_STATUSES))),
    check("properties_source_check", sql.raw(inList("source", PROPERTY_SOURCES))),
    check("properties_ownership_type_check", sql.raw(`"ownership_type" IS NULL OR ${inList("ownership_type", OWNERSHIP_TYPES)}`)),
    check("properties_verification_status_check", sql.raw(inList("verification_status", PROPERTY_VERIFICATION_STATUSES))),
    check("properties_custom_amenities_check", sql.raw(`cardinality("custom_amenities") <= ${CUSTOM_AMENITY_LIMIT}`)),
  ],
);

// ── Type-specific attributes: one row only where it applies, never 200 nullable columns ──

export const residentialAttributes = realEstate.table(
  "residential_attributes",
  {
    propertyId: uuid("property_id")
      .primaryKey()
      .references(() => properties.id, { onDelete: "cascade" }),
    bedrooms: smallint("bedrooms").notNull(),
    bathrooms: smallint("bathrooms").notNull(),
    balconies: smallint("balconies").notNull().default(0),
    furnishing: text("furnishing").notNull(),
    facing: text("facing"),
    coveredParking: smallint("covered_parking").notNull().default(0),
  },
  (t) => [
    index("residential_attributes_bedrooms_idx").on(t.bedrooms),
    check("residential_attributes_furnishing_check", sql.raw(inList("furnishing", FURNISHING))),
    check("residential_attributes_facing_check", sql.raw(`"facing" IS NULL OR ${inList("facing", FACING)}`)),
    check("residential_attributes_counts_check", sql`"bedrooms" BETWEEN 0 AND 20 AND "bathrooms" BETWEEN 0 AND 20`),
  ],
);

export const commercialAttributes = realEstate.table(
  "commercial_attributes",
  {
    propertyId: uuid("property_id")
      .primaryKey()
      .references(() => properties.id, { onDelete: "cascade" }),
    grade: text("grade"),
    workstations: smallint("workstations"),
    fitoutStatus: text("fitout_status").notNull(),
    washrooms: smallint("washrooms"),
    parkingSpaces: smallint("parking_spaces"),
    powerBackup: text("power_backup"),
    loadingAccess: boolean("loading_access").notNull().default(false),
    /** Free text such as "Clinic, bank branch". */
    suitableFor: text("suitable_for"),
  },
  () => [
    check("commercial_attributes_power_backup_check", sql`"power_backup" IS NULL OR "power_backup" IN ('none', 'partial', 'full')`),
    check("commercial_attributes_washrooms_check", sql`"washrooms" IS NULL OR "washrooms" BETWEEN 0 AND 200`),
    check("commercial_attributes_grade_check", sql`"grade" IS NULL OR "grade" IN ('A', 'B', 'C')`),
    check("commercial_attributes_fitout_check", sql`"fitout_status" IN ('bare_shell', 'warm_shell', 'fully_fitted')`),
  ],
);

export const landAttributes = realEstate.table(
  "land_attributes",
  {
    propertyId: uuid("property_id")
      .primaryKey()
      .references(() => properties.id, { onDelete: "cascade" }),
    plotAreaSqyd: area("plot_area_sqyd").notNull(),
    zoning: text("zoning").notNull(),
    roadWidthFt: smallint("road_width_ft"),
    cornerPlot: boolean("corner_plot").notNull().default(false),
    frontageFt: smallint("frontage_ft"),
    boundaryWall: boolean("boundary_wall").notNull().default(false),
    /** Survey or plot number from public land records, where the owner chooses to share it. */
    surveyNumber: text("survey_number"),
  },
  () => [
    check("land_attributes_zoning_check", sql`"zoning" IN ('residential', 'commercial', 'agricultural', 'industrial')`),
    check("land_attributes_area_check", sql`"plot_area_sqyd" > 0`),
  ],
);

/** D10: the physical side of a PG. Its gender policy and room pricing live on the listing. */
export const pgAttributes = realEstate.table(
  "pg_attributes",
  {
    propertyId: uuid("property_id")
      .primaryKey()
      .references(() => properties.id, { onDelete: "cascade" }),
    totalRooms: smallint("total_rooms").notNull(),
    totalBeds: smallint("total_beds").notNull(),
    attachedBathrooms: smallint("attached_bathrooms").notNull().default(0),
    commonKitchen: boolean("common_kitchen").notNull().default(false),
  },
  () => [check("pg_attributes_beds_check", sql`"total_beds" >= "total_rooms" AND "total_rooms" > 0`)],
);

// ── Amenities: a lookup plus a join, not a wall of boolean columns ──

export const AMENITY_CATEGORIES = ["building", "unit", "pg", "safety", "stay"] as const;

export const amenities = realEstate.table(
  "amenities",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  () => [check("amenities_category_check", sql.raw(inList("category", AMENITY_CATEGORIES)))],
);

export const propertyAmenities = realEstate.table(
  "property_amenities",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    amenityId: uuid("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.amenityId] }), index("property_amenities_amenity_id_idx").on(t.amenityId)],
);

// ── Media: metadata only; the bytes live in object storage (D8) ──

export const media = realEstate.table(
  "media",
  {
    id: id(),
    /** Object key, or a /public path while storage is local. */
    storageKey: text("storage_key").notNull().unique(),
    storageProvider: text("storage_provider").notNull(),
    mediaType: text("media_type").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    width: smallint("width"),
    height: smallint("height"),
    altText: text("alt_text"),
    /** `DOC-` reference, for documents only. */
    referenceId: text("reference_id").unique(),
    /** Documents are private: served only to people allowed to see the property's listing. */
    isPrivate: boolean("is_private").notNull().default(false),
    /** SHA-256 of the uploaded bytes, for duplicate-photo detection. */
    checksum: text("checksum"),
    /** Resized renditions: [{ width, key }]. */
    variants: jsonb("variants").$type<{ width: number; key: string }[]>(),
    originalFilename: text("original_filename"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("media_checksum_idx").on(t.checksum),
    check("media_storage_provider_check", sql`"storage_provider" IN ('public', 'local', 's3')`),
    check("media_media_type_check", sql`"media_type" IN ('image', 'floor_plan', 'brochure', 'video', 'document')`),
    check("media_size_check", sql`"size_bytes" IS NULL OR "size_bytes" > 0`),
  ],
);

export const mediaLinks = realEstate.table(
  "media_links",
  {
    id: id(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [
    index("media_links_property_sort_idx").on(t.propertyId, t.sortOrder),
    index("media_links_project_id_idx").on(t.projectId),
    // A real foreign key per parent, and exactly one parent per link.
    check("media_links_one_parent_check", sql`num_nonnulls("property_id", "project_id") = 1`),
  ],
);

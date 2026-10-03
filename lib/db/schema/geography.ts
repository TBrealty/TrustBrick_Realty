import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, pgSchema, text, unique, uuid } from "drizzle-orm/pg-core";
import { geographyPoint, id, ltree, timestamps } from "./columns";

/**
 * Decision D4: one self-referencing `places` table for the whole hierarchy, with an
 * ltree path for indexed ancestor and descendant queries. Decision D5: addresses
 * stand alone and are referenced by whatever owns them.
 */
export const geography = pgSchema("geography");

export const PLACE_TYPES = ["country", "state", "city", "locality", "sub_locality"] as const;

export const places = geography.table(
  "places",
  {
    id: id(),
    parentId: uuid("parent_id").references((): AnyPgColumn => places.id, { onDelete: "restrict" }),
    placeType: text("place_type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** e.g. `in.telangana.hyderabad.gachibowli` */
    path: ltree("path").notNull(),
    centroid: geographyPoint("centroid"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("places_path_unique").on(t.path),
    unique("places_parent_slug_unique").on(t.parentId, t.slug),
    index("places_parent_id_idx").on(t.parentId),
    // "Everything inside Hyderabad" as one indexed ltree query.
    index("places_path_gist_idx").using("gist", t.path),
    check("places_place_type_check", sql.raw(`"place_type" IN (${PLACE_TYPES.map((p) => `'${p}'`).join(", ")})`)),
  ],
);

export const addresses = geography.table(
  "addresses",
  {
    id: id(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    line1: text("line1"),
    line2: text("line2"),
    landmark: text("landmark"),
    postalCode: text("postal_code"),
    location: geographyPoint("location").notNull(),
    ...timestamps,
  },
  (t) => [
    index("addresses_place_id_idx").on(t.placeId),
    // Radius and map-viewport search: the most important spatial index in the system.
    index("addresses_location_gist_idx").using("gist", t.location),
    check("addresses_postal_code_check", sql`"postal_code" IS NULL OR "postal_code" ~ '^[1-9][0-9]{5}$'`),
  ],
);

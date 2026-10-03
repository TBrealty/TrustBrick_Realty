import { sql } from "drizzle-orm";
import { check, index, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext, id, referenceId } from "./columns";
import { users } from "./identity";
import { listings } from "./marketplace";
import { LEGAL_DOCUMENTS, LEGAL_PROPERTY_TYPES, LEGAL_PURPOSES, LEGAL_REQUEST_STATUSES, LEGAL_SERVICES, LEGAL_STATES } from "../../vocab";

/**
 * Cross-cutting platform tables. The reference-ID generator and the immutability
 * triggers also live in this schema; they are SQL functions, created by migration
 * 0004_reference_ids.
 */
export const platform = pgSchema("platform");

/**
 * Append-only. The app role holds INSERT and SELECT only, and a trigger rejects
 * UPDATE and DELETE for everyone, including the owner.
 */
export const auditEvents = platform.table(
  "audit_events",
  {
    id: id(),
    eventType: text("event_type").notNull(),
    // No foreign keys on the actor or organization: an audit row must outlive what it describes,
    // and ON DELETE SET NULL would be an UPDATE, which this append-only table rejects.
    actorUserId: uuid("actor_user_id"),
    actorReferenceId: text("actor_reference_id"),
    /** e.g. `superadmin`, `admin`, `agent`, `customer`, `system`. */
    actorRole: text("actor_role").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    targetReferenceId: text("target_reference_id"),
    organizationId: uuid("organization_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_created_brin_idx").using("brin", t.createdAt),
    index("audit_events_actor_created_idx").on(t.actorUserId, t.createdAt.desc()),
    index("audit_events_target_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
    index("audit_events_type_created_idx").on(t.eventType, t.createdAt.desc()),
    index("audit_events_target_reference_idx").on(t.targetReferenceId),
    check("audit_events_event_type_check", sql`"event_type" ~ '^[A-Z][A-Z_]+$'`),
  ],
);

/** In-app notifications. Email delivery can hang off the same rows later. */
export const notifications = platform.table(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** A same-site path, e.g. `/properties/LST-7K4M9Q2X`. */
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("notifications_user_unread_idx").on(t.userId).where(sql`"read_at" IS NULL`),
    check("notifications_link_check", sql`"link" IS NULL OR ("link" LIKE '/%' AND "link" NOT LIKE '//%')`),
  ],
);

/** Platform configuration a SuperAdmin can change. Every change is audited. */
export const systemSettings = platform.table("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-user notification preferences, one row per type the user turned off. */
export const notificationMutes = platform.table(
  "notification_mutes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] }), check("notification_mutes_type_check", sql`"type" ~ '^[a-z_]+$'`)],
);

export const CONTACT_TOPICS = ["general", "buying_renting", "listing_hosting", "account", "partnership", "press", "problem"] as const;

/** Messages sent through the public Contact us page. Read and resolved by admins with support.* permissions. */
export const contactMessages = platform.table(
  "contact_messages",
  {
    id: id(),
    referenceId: referenceId("TKT"),
    name: text("name").notNull(),
    email: citext("email").notNull(),
    phone: text("phone"),
    topic: text("topic").notNull(),
    message: text("message").notNull(),
    /** Set when the sender was logged in. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_messages_status_created_idx").on(t.status, t.createdAt),
    check("contact_messages_topic_check", sql.raw(`"topic" IN (${CONTACT_TOPICS.map((v) => `'${v}'`).join(", ")})`)),
    check("contact_messages_status_check", sql`"status" IN ('open', 'resolved')`),
    check("contact_messages_length_check", sql`char_length("name") BETWEEN 2 AND 120 AND char_length("message") BETWEEN 20 AND 4000`),
    check("contact_messages_phone_check", sql`"phone" IS NULL OR "phone" ~ '^[+]?[0-9]{10,15}$'`),
  ],
);

const inList = (column: string, values: readonly string[]) => sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

/**
 * Requests for legal verification of a property: the public Legal Verification page. Anyone
 * may apply, signed in or not; the team (support.* permissions) calls them back, agrees the
 * scope and fee, and passes the work to an advocate. Status changes are audited.
 */
export const legalRequests = platform.table(
  "legal_requests",
  {
    id: id(),
    referenceId: referenceId("LGL"),
    /** Set when the applicant was logged in, so they can follow the request. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: citext("email").notNull(),
    phone: text("phone").notNull(),
    service: text("service").notNull(),
    purpose: text("purpose").notNull(),
    propertyType: text("property_type").notNull(),
    state: text("state").notNull(),
    /** Locality and city, as the applicant wrote it. */
    location: text("location").notNull(),
    /** The Trustbrick listing it's about, if any. */
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    /** Which documents the applicant already has. */
    documents: text("documents").array().notNull().default(sql`'{}'::text[]`),
    details: text("details"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("new"),
    /** The team's note on the latest status change. */
    statusNote: text("status_note"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id, { onDelete: "set null" }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("legal_requests_status_created_idx").on(t.status, t.createdAt),
    index("legal_requests_user_idx").on(t.userId).where(sql`"user_id" IS NOT NULL`),
    check("legal_requests_service_check", inList("service", LEGAL_SERVICES)),
    check("legal_requests_purpose_check", inList("purpose", LEGAL_PURPOSES)),
    check("legal_requests_property_type_check", inList("property_type", LEGAL_PROPERTY_TYPES)),
    check("legal_requests_state_check", inList("state", LEGAL_STATES)),
    check("legal_requests_status_check", inList("status", LEGAL_REQUEST_STATUSES)),
    check("legal_requests_documents_check", sql.raw(`"documents" <@ ARRAY[${LEGAL_DOCUMENTS.map((v) => `'${v}'`).join(", ")}]::text[]`)),
    check(
      "legal_requests_length_check",
      sql`char_length("name") BETWEEN 2 AND 120 AND char_length("location") BETWEEN 3 AND 200 AND ("details" IS NULL OR char_length("details") <= 2000)`,
    ),
    check("legal_requests_phone_check", sql`"phone" ~ '^[+]?[0-9]{10,15}$'`),
  ],
);

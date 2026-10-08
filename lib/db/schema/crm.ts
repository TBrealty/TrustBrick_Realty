import { sql } from "drizzle-orm";
import { check, index, pgSchema, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { citext, deletedAt, id, money, referenceId, timestamps } from "./columns";
import { users } from "./identity";
import { listings } from "./marketplace";
import { memberships, organizations } from "./orgs";
import { properties } from "./real-estate";
import { LEAD_STATUSES, VISIT_STATUSES } from "../../crm/terms";

export { LEAD_STATUSES, VISIT_STATUSES };

/**
 * CRM, phase 3 (docs/database/04-tables.md §4.6), built to the extent the agent portal
 * needs: contacts, leads with a fixed pipeline, an immutable activity timeline, visits.
 * Configurable pipelines, tasks and lead reassignment history come later.
 */
export const crm = pgSchema("crm");

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

export const LEAD_SOURCES = ["listing_enquiry", "visit_request", "agent_created"] as const;

/** A person known to an organization, registered or not. */
export const contacts = crm.table(
  "contacts",
  {
    id: id(),
    referenceId: referenceId("CON"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: citext("email"),
    phone: text("phone"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    unique("contacts_org_user_unique").on(t.organizationId, t.userId),
    index("contacts_org_email_idx").on(t.organizationId, t.email),
    check("contacts_reachable_check", sql`num_nonnulls("email", "phone") >= 1`),
  ],
);

export const leads = crm.table(
  "leads",
  {
    id: id(),
    referenceId: referenceId("LEAD"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    /** The agent the lead is assigned to: the own-scope predicate. */
    agentUserId: uuid("agent_user_id").references(() => users.id, { onDelete: "set null" }),
    agentMembershipId: uuid("agent_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    status: text("status").notNull().default("new"),
    source: text("source").notNull(),
    message: text("message"),
    budget: money("budget"),
    lostReason: text("lost_reason"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("leads_org_status_created_idx").on(t.organizationId, t.status, t.createdAt.desc()),
    index("leads_agent_status_idx").on(t.agentUserId, t.status, t.createdAt.desc()),
    index("leads_listing_idx").on(t.listingId),
    index("leads_created_at_idx").on(t.createdAt),
    check("leads_status_check", inList("status", LEAD_STATUSES)),
    check("leads_source_check", inList("source", LEAD_SOURCES)),
  ],
);

/** The lead's timeline. Rows are never edited. */
export const leadActivities = crm.table(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    body: text("body"),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    /** No foreign key: the timeline is append-only and must survive the actor's account. */
    actorUserId: uuid("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_activities_lead_created_idx").on(t.leadId, t.createdAt.desc()),
    check("lead_activities_type_check", sql`"activity_type" IN ('created', 'status_changed', 'note', 'visit_requested', 'visit_updated')`),
  ],
);

export const visits = crm.table(
  "visits",
  {
    id: id(),
    referenceId: referenceId("VIS"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    agentUserId: uuid("agent_user_id").references(() => users.id, { onDelete: "set null" }),
    customerUserId: uuid("customer_user_id").references(() => users.id, { onDelete: "set null" }),
    /** What the customer asked for; `scheduled_at` is what the agent confirmed. */
    requestedFor: timestamp("requested_for", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    status: text("status").notNull().default("requested"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("visits_agent_status_idx").on(t.agentUserId, t.status, t.scheduledAt),
    index("visits_org_scheduled_idx").on(t.organizationId, t.scheduledAt),
    index("visits_created_at_idx").on(t.createdAt),
    check("visits_status_check", inList("status", VISIT_STATUSES)),
    check("visits_scheduled_check", sql`"status" NOT IN ('scheduled', 'completed', 'no_show') OR "scheduled_at" IS NOT NULL`),
  ],
);

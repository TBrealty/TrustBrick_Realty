import { sql } from "drizzle-orm";
import { check, index, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, referenceId, timestamps } from "./columns";
import { users } from "./identity";
import { listings } from "./marketplace";
import { agentProfiles, organizations } from "./orgs";

/**
 * Trust and safety. One review-case model covers listing moderation, agent applications
 * and organization verification, so the queue, the audit trail and later automated
 * checks work the same way for all three (docs/portals/README.md §7).
 */
export const trust = pgSchema("trust");

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

/** `tour_review`: a change to the virtual tour of a live listing, which shows straight away and is reviewed after. */
export const CASE_TYPES = ["listing_review", "agent_application", "organization_verification", "tour_review"] as const;
export const CASE_STATUSES = ["open", "in_review", "approved", "rejected", "changes_requested", "withdrawn"] as const;
export const REPORT_REASONS = ["fraud", "incorrect_details", "duplicate", "unavailable", "offensive", "other"] as const;
export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;

export type CaseFlags = {
  duplicates?: { referenceId: string; title: string; reasons: string[] }[];
  quality?: { code: string; message: string }[];
  /** Tour reviews: each change since the case opened, oldest first. */
  tour?: { changes: { at: string; by: string | null; what: string }[] };
};

export const reviewCases = trust.table(
  "review_cases",
  {
    id: id(),
    referenceId: referenceId("VER"),
    caseType: text("case_type").notNull(),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "cascade" }),
    agentProfileId: uuid("agent_profile_id").references(() => agentProfiles.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    /** Findings from automated checks, shown to the reviewer. Informational, never a silent block. */
    flags: jsonb("flags").$type<CaseFlags>().notNull().default({}),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
    ...timestamps,
  },
  (t) => [
    check("review_cases_one_subject_check", sql`num_nonnulls("listing_id", "agent_profile_id", "organization_id") = 1`),
    check("review_cases_type_check", inList("case_type", CASE_TYPES)),
    check("review_cases_status_check", inList("status", CASE_STATUSES)),
    // At most one open case per subject (for a listing, one of each type: its review and its tour's).
    uniqueIndex("review_cases_open_listing_idx").on(t.listingId, t.caseType).where(sql`"status" IN ('open', 'in_review')`),
    uniqueIndex("review_cases_open_agent_idx").on(t.agentProfileId).where(sql`"status" IN ('open', 'in_review')`),
    uniqueIndex("review_cases_open_org_idx").on(t.organizationId).where(sql`"status" IN ('open', 'in_review')`),
    index("review_cases_type_status_created_idx").on(t.caseType, t.status, t.createdAt),
  ],
);

/** A customer telling us a listing is wrong. */
export const reports = trust.table(
  "reports",
  {
    id: id(),
    referenceId: referenceId("RPT"),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    ...timestamps,
  },
  (t) => [
    // One open report per person per listing.
    uniqueIndex("reports_open_per_reporter_idx").on(t.listingId, t.reporterUserId).where(sql`"status" = 'open'`),
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_listing_idx").on(t.listingId),
    check("reports_reason_check", inList("reason", REPORT_REASONS)),
    check("reports_status_check", inList("status", REPORT_STATUSES)),
  ],
);

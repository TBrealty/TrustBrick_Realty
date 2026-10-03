import { sql } from "drizzle-orm";
import { check, index, jsonb, numeric, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { COMMISSION_BASES, COMMISSION_COLLECTION, COMMISSION_KINDS, COMMISSION_SERVICES, COMMISSION_STATUSES } from "../../vocab";
import { id, money, referenceId } from "./columns";
import { users } from "./identity";
import { listings } from "./marketplace";
import { organizations } from "./orgs";
import { bookings } from "./stays";

/**
 * Trustbrick's commission. Payments happen between the parties today (stays are paid at the
 * property), so commission is a receivable: charges are recorded here when a deal closes or a
 * stay begins, and collected by invoice. When online payments arrive, a charge is kept back
 * from the payment instead (collection = 'gateway'); the ledger is the same either way.
 */
export const finance = pgSchema("finance");

const inList = (column: string, values: readonly string[]) => sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

/**
 * Commission rates, as a history: the latest row for (organization, service) is in force.
 * A row with no organization is the platform default; a partner's row overrides it.
 * Rows are never changed, so every rate that ever applied, who set it and why, stays on record.
 */
export const commissionRates = finance.table(
  "commission_rates",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    /** Set on defaults only: what the percentage is of. A partner's rate uses the default's basis. */
    basis: text("basis"),
    /** Null on a partner row means "back to the default". */
    percent: numeric("percent", { precision: 5, scale: 2, mode: "number" }),
    reason: text("reason").notNull(),
    setBy: uuid("set_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("commission_rates_lookup_idx").on(t.organizationId, t.service, t.createdAt.desc()),
    check("commission_rates_service_check", inList("service", COMMISSION_SERVICES)),
    check("commission_rates_basis_check", sql.raw(`"basis" IS NULL OR "basis" IN (${COMMISSION_BASES.map((v) => `'${v}'`).join(", ")})`)),
    check("commission_rates_percent_check", sql`"percent" IS NULL OR ("percent" >= 0 AND "percent" <= 50)`),
    check("commission_rates_default_check", sql`"organization_id" IS NOT NULL OR ("basis" IS NOT NULL AND "percent" IS NOT NULL)`),
  ],
);

/** A partner organization accepting the rates in force, as they stood when accepted. */
export const commissionAcceptances = finance.table(
  "commission_acceptances",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** { service: { basis, percent } } at the moment of acceptance. */
    rates: jsonb("rates").$type<Record<string, { basis: string; percent: number }>>().notNull(),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("commission_acceptances_org_idx").on(t.organizationId, t.acceptedAt.desc())],
);

/**
 * The ledger. Amounts are fixed when written (a trigger refuses changes to them); only the
 * status moves, from due to paid or waived. Corrections are new adjustment rows.
 */
export const commissionEntries = finance.table(
  "commission_entries",
  {
    id: id(),
    referenceId: referenceId("COM"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    service: text("service").notNull(),
    /** The sale price, rent or booking total the charge comes from. */
    dealValue: money("deal_value"),
    /** The brokerage the agent says they earned, when the basis is brokerage. */
    brokerageAmount: money("brokerage_amount"),
    basis: text("basis"),
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2, mode: "number" }),
    /** Commission before GST. Negative for a credit. */
    amount: money("amount").notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2, mode: "number" }).notNull(),
    gstAmount: money("gst_amount").notNull(),
    total: money("total").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("due"),
    collection: text("collection").notNull().default("invoice"),
    /** Bank, UPI or gateway reference for the payment. */
    paymentReference: text("payment_reference"),
    statusNote: text("status_note"),
    statusChangedBy: uuid("status_changed_by").references(() => users.id, { onDelete: "set null" }),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("commission_entries_org_created_idx").on(t.organizationId, t.createdAt.desc()),
    index("commission_entries_status_created_idx").on(t.status, t.createdAt),
    index("commission_entries_listing_idx").on(t.listingId),
    // One charge per booking, however many times its status is touched.
    uniqueIndex("commission_entries_booking_charge_unique").on(t.bookingId).where(sql`"kind" = 'charge' AND "booking_id" IS NOT NULL`),
    check("commission_entries_kind_check", inList("kind", COMMISSION_KINDS)),
    check("commission_entries_service_check", inList("service", COMMISSION_SERVICES)),
    check("commission_entries_status_check", inList("status", COMMISSION_STATUSES)),
    check("commission_entries_collection_check", inList("collection", COMMISSION_COLLECTION)),
    check("commission_entries_total_check", sql`"total" = "amount" + "gst_amount"`),
    check("commission_entries_charge_check", sql`"kind" <> 'charge' OR ("amount" >= 0 AND "rate_percent" IS NOT NULL AND "basis" IS NOT NULL AND "deal_value" IS NOT NULL)`),
    check("commission_entries_paid_check", sql`"status" <> 'paid' OR "payment_reference" IS NOT NULL`),
  ],
);

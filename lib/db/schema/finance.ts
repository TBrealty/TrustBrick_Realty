import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  BILLING_CYCLES,
  COMMISSION_BASES,
  COMMISSION_COLLECTION,
  COMMISSION_KINDS,
  COMMISSION_SERVICES,
  COMMISSION_STATUSES,
  LIVE_SUBSCRIPTION_STATUSES,
  PLAN_AUDIENCES,
  SUBSCRIPTION_STATUSES,
} from "../../vocab";
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

// ── Subscriptions ───────────────────────────────────────────────────────────────

/** A plan's line on the plans page: what it includes, and whether that's live yet. */
export type PlanFeature = { key: string; label: string; detail?: string; comingSoon?: boolean };

/**
 * The plans on sale. People and partners have their own. Prices are placeholders the SuperAdmin
 * changes; `limits` are the numbers the features enforce (e.g. AI reports a month).
 */
export const plans = finance.table(
  "plans",
  {
    id: id(),
    code: text("code").notNull().unique(),
    audience: text("audience").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull(),
    monthlyPrice: money("monthly_price").notNull(),
    yearlyPrice: money("yearly_price").notNull(),
    trialDays: integer("trial_days").notNull().default(0),
    features: jsonb("features").$type<PlanFeature[]>().notNull(),
    limits: jsonb("limits").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    /** Shown as the one to choose. */
    highlighted: boolean("highlighted").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("plans_audience_check", inList("audience", PLAN_AUDIENCES)),
    check("plans_price_check", sql`"monthly_price" >= 0 AND "yearly_price" >= 0`),
    check("plans_trial_check", sql`"trial_days" BETWEEN 0 AND 90`),
  ],
);

/**
 * A subscription belongs to a person (customer plans) or a partner organization (partner plans),
 * never both. Each has at most one live subscription at a time. No payments are taken online
 * yet: a paid plan waits for the team to record the payment (provider = 'manual'); a gateway
 * will set provider and provider_ref and confirm payments by webhook.
 */
export const subscriptions = finance.table(
  "subscriptions",
  {
    id: id(),
    referenceId: referenceId("SUB"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    billingCycle: text("billing_cycle").notNull(),
    status: text("status").notNull(),
    /** The price agreed for this subscription, kept when the plan's price changes. */
    price: money("price").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** While paused: when, until when (null: until resumed), and what it goes back to. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pauseUntil: timestamp("pause_until", { withTimezone: true }),
    pausedFrom: text("paused_from"),
    /** Paused because the account was suspended: reinstating the account resumes it. */
    pausedForSuspension: boolean("paused_for_suspension").notNull().default(false),
    /** The team's remark for a pause or revocation, which the subscriber sees. */
    statusReason: text("status_reason"),
    provider: text("provider").notNull().default("manual"),
    providerRef: text("provider_ref"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_org_idx").on(t.organizationId),
    index("subscriptions_status_idx").on(t.status),
    uniqueIndex("subscriptions_one_live_per_user").on(t.userId).where(sql.raw(`"user_id" IS NOT NULL AND "status" IN (${LIVE_SUBSCRIPTION_STATUSES.map((v) => `'${v}'`).join(", ")})`)),
    uniqueIndex("subscriptions_one_live_per_org").on(t.organizationId).where(sql.raw(`"organization_id" IS NOT NULL AND "status" IN (${LIVE_SUBSCRIPTION_STATUSES.map((v) => `'${v}'`).join(", ")})`)),
    check("subscriptions_subject_check", sql`num_nonnulls("user_id", "organization_id") = 1`),
    check("subscriptions_cycle_check", inList("billing_cycle", BILLING_CYCLES)),
    check("subscriptions_status_check", inList("status", SUBSCRIPTION_STATUSES)),
    check("subscriptions_trial_check", sql`"status" <> 'trialing' OR "trial_ends_at" IS NOT NULL`),
    check("subscriptions_active_check", sql`"status" <> 'active' OR ("current_period_start" IS NOT NULL AND "current_period_end" IS NOT NULL)`),
    check("subscriptions_provider_check", sql`"provider" IN ('manual', 'razorpay')`),
    check("subscriptions_paused_check", sql`"status" <> 'paused' OR ("paused_at" IS NOT NULL AND "paused_from" IN ('trialing', 'pending_payment', 'active'))`),
  ],
);

/** Everything that happened to a subscription, and every payment recorded against it. Append-only. */
export const subscriptionEvents = finance.table(
  "subscription_events",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    /** For a payment: the amount and the bank, UPI or gateway reference. */
    amount: money("amount"),
    paymentReference: text("payment_reference"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscription_events_sub_idx").on(t.subscriptionId, t.createdAt)],
);

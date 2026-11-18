import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  BANK_ACCOUNT_METHODS,
  BANK_ACCOUNT_STATUSES,
  LANDLORD_INVITATION_KINDS,
  LANDLORD_INVITATION_STATUSES,
  OWNERSHIP_PROOF_KINDS,
  PAYMENT_PROVIDERS,
  PROPERTY_LANDLORD_STATUSES,
  RENT_CHARGE_STATUSES,
  RENT_PAYMENT_STATUSES,
  RENT_REFUND_STATUSES,
  SETTLEMENT_STATUSES,
  TENANCY_STATUSES,
} from "../../vocab";
import { id, money, referenceId, timestamps } from "./columns";
import { users } from "./identity";
import { listings } from "./marketplace";
import { organizations } from "./orgs";
import { properties } from "./real-estate";

/**
 * Rent collected online. Trustbrick collects each month's rent from the tenant as a payment
 * aggregator and settles it to the landlord's bank account from its back office.
 *
 *   agent invites landlord ──▶ landlord linked to property ──▶ proof of ownership approved
 *   agent sets up tenancy ──▶ tenant accepts + landlord confirms ──▶ active
 *   each month: charge ──▶ tenant pays (payment) ──▶ settlement ──▶ paid to landlord's bank
 *
 * Bank account numbers, UPI IDs and PANs are stored sealed (AES-256-GCM, lib/crypto/sealed.ts);
 * only their masked forms are readable without the key.
 */
export const rent = pgSchema("rent");

const inList = (column: string, values: readonly string[]) => sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** A person who receives rent through Trustbrick: their LND- reference and PAN. */
export const landlordProfiles = rent.table("landlord_profiles", {
  id: id(),
  referenceId: referenceId("LND"),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "restrict" }),
  phone: text("phone"),
  /** Sealed PAN, for rent receipts (a tenant's HRA claim needs it). */
  panSealed: text("pan_sealed"),
  panMasked: text("pan_masked"),
  ...timestamps,
});

/**
 * Where a landlord's rent is settled. Sealed account number or UPI ID; the back office reads it
 * when paying. A change holds settlements for 48 hours, and the landlord is told.
 */
export const landlordBankAccounts = rent.table(
  "landlord_bank_accounts",
  {
    id: id(),
    landlordUserId: uuid("landlord_user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    method: text("method").notNull(),
    holderName: text("holder_name").notNull(),
    bankName: text("bank_name"),
    accountSealed: text("account_sealed"),
    accountLast4: text("account_last4"),
    ifsc: text("ifsc"),
    upiSealed: text("upi_sealed"),
    upiMasked: text("upi_masked"),
    status: text("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    /** The name the bank holds for the account, from verification. */
    nameAtBank: text("name_at_bank"),
    verifiedAt: ts("verified_at"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    /** After a change, settlements wait until then. */
    holdUntil: ts("hold_until"),
    ...timestamps,
  },
  () => [
    check("landlord_bank_accounts_method_check", inList("method", BANK_ACCOUNT_METHODS)),
    check("landlord_bank_accounts_status_check", inList("status", BANK_ACCOUNT_STATUSES)),
    check(
      "landlord_bank_accounts_details_check",
      sql`("method" = 'bank' AND "account_sealed" IS NOT NULL AND "account_last4" IS NOT NULL AND "ifsc" IS NOT NULL) OR ("method" = 'upi' AND "upi_sealed" IS NOT NULL AND "upi_masked" IS NOT NULL)`,
    ),
  ],
);

/**
 * An agent asking someone to be a property's landlord. "new": a one-time sign-up link (its token
 * stored only as a hash), for that email alone. "existing": a request to someone who is already a
 * landlord, accepted in their dashboard.
 */
export const landlordInvitations = rent.table(
  "landlord_invitations",
  {
    id: id(),
    referenceId: referenceId("LIN"),
    kind: text("kind").notNull(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    /** For "existing", the landlord asked; for "new", who accepted. */
    landlordUserId: uuid("landlord_user_id").references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").unique(),
    status: text("status").notNull().default("pending"),
    expiresAt: ts("expires_at").notNull(),
    respondedAt: ts("responded_at"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** The inviting agent's organization, for its team's view. */
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (t) => [
    check("landlord_invitations_kind_check", inList("kind", LANDLORD_INVITATION_KINDS)),
    check("landlord_invitations_status_check", inList("status", LANDLORD_INVITATION_STATUSES)),
    check("landlord_invitations_token_check", sql`("kind" = 'new') = ("token_hash" IS NOT NULL)`),
    check("landlord_invitations_existing_check", sql`"kind" = 'new' OR "landlord_user_id" IS NOT NULL`),
    uniqueIndex("landlord_invitations_one_pending").on(t.propertyId).where(sql`"status" = 'pending'`),
    index("landlord_invitations_landlord_idx").on(t.landlordUserId, t.status),
  ],
);

/** A landlord of a property, and their proof that they own it. One current landlord per property. */
export const propertyLandlords = rent.table(
  "property_landlords",
  {
    id: id(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    landlordUserId: uuid("landlord_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    invitationId: uuid("invitation_id").references(() => landlordInvitations.id, { onDelete: "set null" }),
    status: text("status").notNull().default("awaiting_proof"),
    proofKind: text("proof_kind"),
    proofStorageKey: text("proof_storage_key"),
    proofMimeType: text("proof_mime_type"),
    proofFilename: text("proof_filename"),
    proofSizeBytes: integer("proof_size_bytes"),
    proofUploadedAt: ts("proof_uploaded_at"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    /** When ownership was approved; kept after the link ends, for rent already paid. */
    approvedAt: ts("approved_at"),
    endedAt: ts("ended_at"),
    endedBy: uuid("ended_by").references(() => users.id, { onDelete: "set null" }),
    endReason: text("end_reason"),
    ...timestamps,
  },
  (t) => [
    check("property_landlords_status_check", inList("status", PROPERTY_LANDLORD_STATUSES)),
    check("property_landlords_proof_kind_check", sql.raw(`"proof_kind" IS NULL OR "proof_kind" IN (${OWNERSHIP_PROOF_KINDS.map((v) => `'${v}'`).join(", ")})`)),
    check("property_landlords_proof_check", sql`"status" IN ('awaiting_proof', 'ended') OR "proof_storage_key" IS NOT NULL`),
    uniqueIndex("property_landlords_one_current").on(t.propertyId).where(sql`"status" <> 'ended'`),
    index("property_landlords_landlord_idx").on(t.landlordUserId, t.status),
    index("property_landlords_review_idx").on(t.status, t.proofUploadedAt),
  ],
);

/**
 * A tenancy set up by the agent. The tenant accepts with a one-time link (hashed token) and the
 * landlord confirms the terms; then rent falls due on `due_day` each month from `first_due_date`.
 */
export const tenancies = rent.table(
  "tenancies",
  {
    id: id(),
    referenceId: referenceId("TEN"),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    propertyLandlordId: uuid("property_landlord_id")
      .notNull()
      .references(() => propertyLandlords.id, { onDelete: "restrict" }),
    landlordUserId: uuid("landlord_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tenantUserId: uuid("tenant_user_id").references(() => users.id, { onDelete: "restrict" }),
    tenantName: text("tenant_name").notNull(),
    tenantEmail: text("tenant_email").notNull(),
    tenantPhone: text("tenant_phone"),
    monthlyRent: money("monthly_rent").notNull(),
    dueDay: integer("due_day").notNull(),
    deposit: money("deposit").notNull().default(0),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: text("status").notNull().default("pending"),
    tenantTokenHash: text("tenant_token_hash").unique(),
    tenantInviteExpiresAt: ts("tenant_invite_expires_at"),
    tenantAcceptedAt: ts("tenant_accepted_at"),
    landlordConfirmedAt: ts("landlord_confirmed_at"),
    disputeNote: text("dispute_note"),
    activatedAt: ts("activated_at"),
    /** The first rent paid online: the first due day on or after both the start date and activation. */
    firstDueDate: date("first_due_date"),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    endedAt: ts("ended_at"),
    endedBy: uuid("ended_by").references(() => users.id, { onDelete: "set null" }),
    endReason: text("end_reason"),
    ...timestamps,
  },
  (t) => [
    check("tenancies_status_check", inList("status", TENANCY_STATUSES)),
    check("tenancies_due_day_check", sql`"due_day" BETWEEN 1 AND 28`),
    check("tenancies_money_check", sql`"monthly_rent" > 0 AND "deposit" >= 0`),
    check("tenancies_dates_check", sql`"end_date" IS NULL OR "end_date" > "start_date"`),
    check("tenancies_active_check", sql`"status" <> 'active' OR ("tenant_user_id" IS NOT NULL AND "landlord_confirmed_at" IS NOT NULL AND "first_due_date" IS NOT NULL)`),
    uniqueIndex("tenancies_one_current").on(t.propertyId).where(sql`"status" IN ('pending', 'disputed', 'active')`),
    index("tenancies_tenant_idx").on(t.tenantUserId, t.status),
    index("tenancies_landlord_idx").on(t.landlordUserId, t.status),
    index("tenancies_org_idx").on(t.organizationId, t.status),
  ],
);

/** One month's rent, due on a day. Created a week before it's due. */
export const rentCharges = rent.table(
  "charges",
  {
    id: id(),
    referenceId: referenceId("RNT"),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "restrict" }),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    status: text("status").notNull().default("due"),
    paidAt: ts("paid_at"),
    remindedBeforeAt: ts("reminded_before_at"),
    remindedDueAt: ts("reminded_due_at"),
    remindedLateAt: ts("reminded_late_at"),
    ...timestamps,
  },
  (t) => [
    check("charges_status_check", inList("status", RENT_CHARGE_STATUSES)),
    check("charges_amount_check", sql`"amount" > 0`),
    check("charges_paid_check", sql`("status" = 'paid') = ("paid_at" IS NOT NULL)`),
    uniqueIndex("charges_tenancy_due_unique").on(t.tenancyId, t.dueDate),
    index("charges_status_due_idx").on(t.status, t.dueDate),
  ],
);

/**
 * An attempt to pay a charge. Our reference (RPY-…) is the provider's order ID. Only the provider's
 * word marks it paid. A second successful payment for a charge is unwanted and refunded in full.
 */
export const rentPayments = rent.table(
  "payments",
  {
    id: id(),
    referenceId: referenceId("RPY"),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => rentCharges.id, { onDelete: "restrict" }),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "restrict" }),
    tenantUserId: uuid("tenant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    landlordUserId: uuid("landlord_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    status: text("status").notNull().default("created"),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id").notNull().unique(),
    providerPaymentId: text("provider_payment_id"),
    sessionId: text("session_id"),
    method: text("method"),
    unwanted: boolean("unwanted").notNull().default(false),
    failureReason: text("failure_reason"),
    paidAt: ts("paid_at"),
    failedAt: ts("failed_at"),
    /** A full refund: our refund ID is "RRF-" + this payment's reference body. */
    refundStatus: text("refund_status"),
    refundReason: text("refund_reason"),
    providerRefundId: text("provider_refund_id"),
    refundAttempts: integer("refund_attempts").notNull().default(0),
    refundedAt: ts("refunded_at"),
    needsAttention: boolean("needs_attention").notNull().default(false),
    attentionNote: text("attention_note"),
    ...timestamps,
  },
  (t) => [
    check("payments_status_check", inList("status", RENT_PAYMENT_STATUSES)),
    check("payments_provider_check", inList("provider", PAYMENT_PROVIDERS)),
    check("payments_amount_check", sql`"amount" > 0`),
    check("payments_refund_status_check", sql.raw(`"refund_status" IS NULL OR "refund_status" IN (${RENT_REFUND_STATUSES.map((v) => `'${v}'`).join(", ")})`)),
    uniqueIndex("payments_one_success_per_charge").on(t.chargeId).where(sql`"status" = 'paid' AND NOT "unwanted"`),
    index("payments_charge_idx").on(t.chargeId, t.createdAt),
    index("payments_tenant_idx").on(t.tenantUserId, t.createdAt),
    index("payments_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * What Trustbrick owes a landlord for one rent payment, paid from the back office. The bank details
 * it went to are copied here when it's marked paid, with the bank's reference (UTR).
 */
export const settlements = rent.table(
  "settlements",
  {
    id: id(),
    referenceId: referenceId("STL"),
    paymentId: uuid("payment_id")
      .notNull()
      .unique()
      .references(() => rentPayments.id, { onDelete: "restrict" }),
    landlordUserId: uuid("landlord_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    status: text("status").notNull().default("on_hold"),
    holdReason: text("hold_reason"),
    /** Held by a person (a dispute): stays on hold until they release it. */
    heldByAdmin: boolean("held_by_admin").notNull().default(false),
    readyAt: ts("ready_at"),
    /** Settle by: the next working day after it became ready. */
    dueBy: date("due_by"),
    paidAt: ts("paid_at"),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    utr: text("utr"),
    paidToMethod: text("paid_to_method"),
    paidToHolder: text("paid_to_holder"),
    paidToLast4: text("paid_to_last4"),
    paidToIfsc: text("paid_to_ifsc"),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (t) => [
    check("settlements_status_check", inList("status", SETTLEMENT_STATUSES)),
    check("settlements_amount_check", sql`"amount" > 0`),
    check("settlements_paid_check", sql`"status" <> 'paid' OR ("paid_at" IS NOT NULL AND "utr" IS NOT NULL)`),
    index("settlements_status_idx").on(t.status, t.dueBy),
    index("settlements_landlord_idx").on(t.landlordUserId, t.createdAt),
  ],
);

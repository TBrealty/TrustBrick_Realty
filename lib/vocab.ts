/**
 * Controlled vocabularies shared by the database schema (CHECK constraints), the server
 * and client components. Plain constants, so importing them never pulls Drizzle into a
 * browser bundle.
 */

export const PROPERTY_CATEGORIES = ["residential", "commercial", "land", "co_living"] as const;
export const LIFECYCLE_STATUSES = ["planned", "under_construction", "ready", "occupied"] as const;
export const FURNISHING = ["unfurnished", "semi_furnished", "furnished"] as const;
export const FACING = ["north", "north_east", "east", "south_east", "south", "south_west", "west", "north_west"] as const;
export const OWNERSHIP_TYPES = ["freehold", "leasehold", "cooperative_society", "power_of_attorney"] as const;
/** The purposes a property can be offered for. Mirrors listings.transaction_type. */
export const PURPOSES = ["sale", "rent", "lease", "pg", "stay"] as const;

export const LISTING_STATUSES = [
  "draft",
  "published",
  "paused",
  "expired",
  "withdrawn",
  "transacted",
  "submitted",
  "under_review",
  "changes_requested",
  "rejected",
  "approved",
  "unpublished",
  "archived",
  "removed",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// ── Homestays ──────────────────────────────────────────────────────────────────
export const SPACE_TYPES = ["entire_home", "private_room"] as const;
export const CANCELLATION_POLICIES = ["flexible", "moderate", "strict"] as const;
export const BOOKING_STATUSES = ["requested", "confirmed", "declined", "expired", "cancelled", "checked_in", "completed", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Statuses that hold the dates. The bookings exclusion constraint applies to exactly these. */
export const HOLDING_STATUSES = ["confirmed", "checked_in", "completed"] as const;

/** Stay chat: who can write, and how much in one message. */
export const MESSAGE_SENDER_ROLES = ["guest", "host"] as const;
export type MessageSenderRole = (typeof MESSAGE_SENDER_ROLES)[number];
export const MESSAGE_MAX_LENGTH = 2000;

// ── Legal verification ─────────────────────────────────────────────────────────
export const LEGAL_SERVICES = ["document_check", "title_opinion", "full_due_diligence", "agreement_review"] as const;
export type LegalService = (typeof LEGAL_SERVICES)[number];
export const LEGAL_PURPOSES = ["buying", "home_loan", "selling", "inherited", "other"] as const;
export const LEGAL_PROPERTY_TYPES = ["apartment", "house", "plot", "agricultural", "commercial"] as const;
export const LEGAL_STATES = ["telangana", "karnataka", "maharashtra", "goa"] as const;
export const LEGAL_DOCUMENTS = [
  "sale_deed",
  "link_documents",
  "encumbrance",
  "tax_receipts",
  "revenue_records",
  "building_plan",
  "occupancy",
  "rera",
  "layout_approval",
  "agreement_draft",
  "society_noc",
] as const;
/** new → contacted (scope and fee agreed) → in_progress (with the advocate) → completed; closed at any point before. */
export const LEGAL_REQUEST_STATUSES = ["new", "contacted", "in_progress", "completed", "closed"] as const;
export type LegalRequestStatus = (typeof LEGAL_REQUEST_STATUSES)[number];

// ── Listing pricing ────────────────────────────────────────────────────────────
/** How the agent's brokerage is charged. Half a month and months of rent apply to rentals only. */
export const BROKERAGE_TYPES = ["none", "percent", "months_rent", "half_month", "fixed", "flexible"] as const;
export type BrokerageType = (typeof BROKERAGE_TYPES)[number];
/** Custom amenities an agent adds to one property: how many, and how long each may be. */
export const CUSTOM_AMENITY_LIMIT = 20;
export const CUSTOM_AMENITY_MAX_LENGTH = 40;

// ── Commission ─────────────────────────────────────────────────────────────────
/** What a commission is a percentage of: the agent's brokerage, or the deal itself (price, rent or booking). */
export const COMMISSION_BASES = ["brokerage", "deal_value"] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];
export const COMMISSION_SERVICES = ["sale", "rent", "lease", "pg", "stay"] as const;
export type CommissionService = (typeof COMMISSION_SERVICES)[number];
/** A charge for a deal or booking, or an adjustment (a credit or a correction) made by the team. */
export const COMMISSION_KINDS = ["charge", "adjustment"] as const;
export const COMMISSION_STATUSES = ["due", "paid", "waived"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
/** How it's collected: invoiced and paid to Trustbrick, or kept back from an online payment (gateway, later). */
export const COMMISSION_COLLECTION = ["invoice", "gateway"] as const;
/** How a sale or rental listing was closed, when the agent marks it sold or rented out. */
export const CLOSE_OUTCOMES = ["closed_deal", "closed_elsewhere", "off_market"] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

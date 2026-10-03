import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgSchema, smallint, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { daterange, id, money, referenceId, timestamps } from "./columns";
import { places } from "./geography";
import { users } from "./identity";
import { listings } from "./marketplace";
import { organizations } from "./orgs";
import { BOOKING_STATUSES, CANCELLATION_POLICIES, MESSAGE_MAX_LENGTH, MESSAGE_SENDER_ROLES, SPACE_TYPES } from "../../vocab";
import { properties } from "./real-estate";

export { BOOKING_STATUSES, type BookingStatus, CANCELLATION_POLICIES, HOLDING_STATUSES, SPACE_TYPES } from "../../vocab";

/**
 * Homestays (docs/stays/README.md). A stay is an ordinary listing with transaction_type
 * 'stay'; the physical home is an ordinary property. What is new lives here: hosts, the
 * nightly terms, the calendar, and bookings.
 *
 * Double booking is impossible at the database level: bookings that hold dates on the same
 * listing may not overlap (an exclusion constraint added in the migration), and the booking
 * service serialises on the listing's terms row while it checks the host's blocked dates.
 */
export const stays = pgSchema("stays");

const inList = (column: string, values: readonly string[]) => sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

export const HOST_STATUSES = ["pending", "active", "suspended", "rejected"] as const;
export const HOST_VERIFICATION = ["unverified", "pending", "verified", "rejected"] as const;
export const HOST_RELATIONSHIPS = ["owner", "family", "manager"] as const;

/** A person approved to host. Hosting works through a `host` membership in their personal organization. */
export const hostProfiles = stays.table(
  "host_profiles",
  {
    id: id(),
    referenceId: referenceId("HST"),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    phone: text("phone").notNull(),
    cityPlaceId: uuid("city_place_id").references(() => places.id, { onDelete: "set null" }),
    about: text("about"),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    /** How the host relates to the homes they list: owner, family member, or managing for the owner. */
    relationship: text("relationship").notNull().default("owner"),
    status: text("status").notNull().default("pending"),
    /** Identity checked by a Trustbrick admin (government ID seen, phone confirmed). */
    verificationStatus: text("verification_status").notNull().default("pending"),
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("host_profiles_status_created_idx").on(t.status, t.createdAt),
    check("host_profiles_status_check", inList("status", HOST_STATUSES)),
    check("host_profiles_verification_check", inList("verification_status", HOST_VERIFICATION)),
    check("host_profiles_relationship_check", inList("relationship", HOST_RELATIONSHIPS)),
    check("host_profiles_phone_check", sql`"phone" ~ '^[+]?[0-9]{10,15}$'`),
    check("host_profiles_about_check", sql`"about" IS NULL OR char_length("about") <= 1000`),
  ],
);


/** The nightly terms of a stay listing. The base nightly price lives on listings.price, so stays sort like everything else. */
export const stayTerms = stays.table(
  "stay_terms",
  {
    listingId: uuid("listing_id")
      .primaryKey()
      .references(() => listings.id, { onDelete: "cascade" }),
    spaceType: text("space_type").notNull().default("entire_home"),
    maxGuests: smallint("max_guests").notNull(),
    beds: smallint("beds").notNull(),
    weekendPrice: money("weekend_price"),
    cleaningFee: money("cleaning_fee"),
    minNights: smallint("min_nights").notNull().default(1),
    maxNights: smallint("max_nights").notNull().default(30),
    checkInTime: time("check_in_time").notNull().default("14:00"),
    checkOutTime: time("check_out_time").notNull().default("11:00"),
    instantBook: boolean("instant_book").notNull().default(false),
    cancellationPolicy: text("cancellation_policy").notNull().default("moderate"),
    petsAllowed: boolean("pets_allowed").notNull().default(false),
    smokingAllowed: boolean("smoking_allowed").notNull().default(false),
    eventsAllowed: boolean("events_allowed").notNull().default(false),
    houseRules: text("house_rules"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("stay_terms_space_check", inList("space_type", SPACE_TYPES)),
    check("stay_terms_policy_check", inList("cancellation_policy", CANCELLATION_POLICIES)),
    check("stay_terms_guests_check", sql`"max_guests" BETWEEN 1 AND 30 AND "beds" BETWEEN 1 AND 50`),
    check("stay_terms_nights_check", sql`"min_nights" BETWEEN 1 AND 90 AND "max_nights" BETWEEN 1 AND 365 AND "min_nights" <= "max_nights"`),
    check("stay_terms_money_check", sql`("weekend_price" IS NULL OR "weekend_price" > 0) AND ("cleaning_fee" IS NULL OR "cleaning_fee" >= 0)`),
    check("stay_terms_rules_check", sql`"house_rules" IS NULL OR char_length("house_rules") <= 2000`),
  ],
);

/** A different nightly price for some dates (festivals, long weekends). Ranges never overlap. */
export const stayRates = stays.table(
  "stay_rates",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    dates: daterange("dates").notNull(),
    nightlyPrice: money("nightly_price").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_rates_listing_idx").on(t.listingId), check("stay_rates_price_check", sql`"nightly_price" > 0`)],
);

/** Dates the host has closed themselves. Ranges never overlap. */
export const stayBlocks = stays.table(
  "stay_blocks",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    dates: daterange("dates").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stay_blocks_listing_idx").on(t.listingId)],
);


export const bookings = stays.table(
  "bookings",
  {
    id: id(),
    referenceId: referenceId("BKG"),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    guestUserId: uuid("guest_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** [check-in, check-out). */
    dates: daterange("dates").notNull(),
    nights: smallint("nights").notNull(),
    adults: smallint("adults").notNull().default(1),
    children: smallint("children").notNull().default(0),
    pets: boolean("pets").notNull().default(false),
    /** The price at the moment of booking, night by night; later price changes never touch it. */
    nightlyBreakdown: jsonb("nightly_breakdown").$type<{ date: string; price: number }[]>().notNull(),
    subtotal: money("subtotal").notNull(),
    cleaningFee: money("cleaning_fee").notNull().default(0),
    total: money("total").notNull(),
    currency: text("currency").notNull().default("INR"),
    paymentMode: text("payment_mode").notNull().default("pay_at_property"),
    status: text("status").notNull(),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone").notNull(),
    guestMessage: text("guest_message"),
    /** Snapshots of the terms the guest agreed to. */
    cancellationPolicy: text("cancellation_policy").notNull(),
    checkInTime: time("check_in_time").notNull(),
    checkOutTime: time("check_out_time").notNull(),
    statusReason: text("status_reason"),
    cancelledBy: text("cancelled_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bookings_host_status_idx").on(t.hostUserId, t.status),
    index("bookings_guest_idx").on(t.guestUserId, t.createdAt),
    index("bookings_listing_idx").on(t.listingId),
    index("bookings_org_created_idx").on(t.organizationId, t.createdAt),
    check("bookings_status_check", inList("status", BOOKING_STATUSES)),
    check("bookings_dates_check", sql`NOT isempty("dates") AND lower_inc("dates") AND NOT upper_inc("dates") AND upper("dates") - lower("dates") = "nights"`),
    check("bookings_guests_check", sql`"adults" BETWEEN 1 AND 30 AND "children" BETWEEN 0 AND 30`),
    check("bookings_money_check", sql`"subtotal" > 0 AND "cleaning_fee" >= 0 AND "total" = "subtotal" + "cleaning_fee"`),
    check("bookings_payment_check", sql`"payment_mode" IN ('pay_at_property')`),
    check("bookings_cancelled_by_check", sql`(("status" = 'cancelled') = ("cancelled_by" IS NOT NULL)) AND ("cancelled_by" IS NULL OR "cancelled_by" IN ('guest', 'host', 'admin'))`),
    check("bookings_phone_check", sql`"guest_phone" ~ '^[+]?[0-9]{10,15}$'`),
    check("bookings_message_check", sql`"guest_message" IS NULL OR char_length("guest_message") <= 1000`),
  ],
);

/** Every status change of a booking. Append-only: the app role cannot update or delete it. */
export const bookingEvents = stays.table(
  "booking_events",
  {
    id: id(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    /** No foreign key: history outlives accounts. */
    actorUserId: uuid("actor_user_id"),
    actorRole: text("actor_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_events_booking_idx").on(t.bookingId, t.createdAt)],
);


/**
 * A guest's conversation with the host of one stay. There is exactly one per guest and
 * listing, kept for good, so a guest who comes back to book again sees everything said before.
 * Only the guest starts one; the host replies.
 */
export const conversations = stays.table(
  "conversations",
  {
    id: id(),
    referenceId: referenceId("MSG"),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    guestUserId: uuid("guest_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * The last message each side has seen, by seq: anything newer from the other side is unread.
     * Sends lock the conversation row, so seq order is commit order within a conversation.
     */
    guestLastReadSeq: bigint("guest_last_read_seq", { mode: "number" }).notNull().default(0),
    hostLastReadSeq: bigint("host_last_read_seq", { mode: "number" }).notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("conversations_listing_guest_idx").on(t.listingId, t.guestUserId),
    index("conversations_guest_idx").on(t.guestUserId, t.lastMessageAt),
    index("conversations_host_idx").on(t.hostUserId, t.lastMessageAt),
    index("conversations_org_idx").on(t.organizationId, t.lastMessageAt),
    check("conversations_parties_check", sql`"host_user_id" <> "guest_user_id"`),
  ],
);

/** One message. Append-only: a message can never be edited, so the log stays a faithful record. */
export const messages = stays.table(
  "messages",
  {
    id: id(),
    /** Strictly increasing, so a client can ask for "everything after the last one I have". */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    senderRole: text("sender_role").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_seq_idx").on(t.seq),
    index("messages_conversation_idx").on(t.conversationId, t.seq),
    check("messages_sender_role_check", inList("sender_role", MESSAGE_SENDER_ROLES)),
    check("messages_body_check", sql.raw(`char_length("body") BETWEEN 1 AND ${MESSAGE_MAX_LENGTH}`)),
  ],
);

import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgSchema, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ACCOUNT_INTENTS } from "../../intents";
import { citext, id, referenceId, timestamps } from "./columns";

/**
 * Phase 0 — identity. See docs/database/04-tables.md §4.1.
 *
 * Table shapes follow what Better Auth expects (it owns reads and writes here),
 * mapped onto the architecture's conventions: a dedicated `identity` schema,
 * plural snake_case tables, UUIDv7 keys, timestamptz, and citext for email.
 *
 * Deliberate deviations from the original blueprint, recorded in the docs:
 * - Passwords live in `accounts` as the `credential` provider, not in a separate
 *   `credentials` table. A password is simply another way to hold an account.
 * - `email_verified` is a boolean, because that is what the auth library reads.
 */
export const identity = pgSchema("identity");

const intentList = sql.raw(ACCOUNT_INTENTS.map((i) => `'${i}'`).join(", "));

/** `suspended` blocks login and revokes sessions; `deactivated` is the user's own choice (not built yet). */
export const USER_STATUSES = ["active", "suspended", "deactivated"] as const;

export const users = identity.table(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: citext("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    intent: text("intent"),
    referenceId: referenceId("USR"),
    status: text("status").notNull().default("active"),
    /** Optional, and never shown to other users without a reason (leads share it with consent). */
    phone: text("phone"),
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("users_status_created_idx").on(t.status, t.createdAt),
    index("users_created_at_idx").on(t.createdAt),
    check("users_status_check", sql.raw(`"status" IN (${USER_STATUSES.map((s) => `'${s}'`).join(", ")})`)),
    check("users_phone_check", sql`"phone" IS NULL OR "phone" ~ '^[+]?[0-9]{10,15}$'`),
    // Plain column names: Postgres rejects schema-qualified references inside a CHECK.
    check("users_intent_check", sql`"intent" IS NULL OR "intent" IN (${intentList})`),
    check("users_name_length_check", sql`char_length("name") BETWEEN 1 AND 120`),
  ],
);

export const sessions = identity.table(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId), index("sessions_expires_at_idx").on(t.expiresAt)],
);

export const accounts = identity.table(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `credential` for email + password; the OAuth provider id otherwise. */
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    /** scrypt hash for the credential provider. Never the password itself. */
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    ...timestamps,
  },
  (t) => [
    unique("accounts_provider_account_unique").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

/** Email verification and password-reset tokens. Identifiers are stored hashed. */
export const verifications = identity.table(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier), index("verifications_expires_at_idx").on(t.expiresAt)],
);

/** Rate-limit counters in Postgres, so limits hold across multiple app instances. */
export const rateLimits = identity.table("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

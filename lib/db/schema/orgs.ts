import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, deletedAt, id, referenceId, timestamps } from "./columns";
import { places } from "./geography";
import { users } from "./identity";

/**
 * Organizations are the tenant boundary (docs/database/02-architecture.md §2.5), and
 * memberships are how a person acts inside one. RBAC follows D7: roles carry scoped
 * permissions, and scope becomes a query predicate. Platform staff are members of the
 * single `internal` organization; platform scope is honoured nowhere else
 * (docs/portals/README.md §4).
 */
export const orgs = pgSchema("orgs");

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`"${column}" IN (${values.map((v) => `'${v}'`).join(", ")})`);

export const ORG_TYPES = ["brokerage", "developer", "property_manager", "pg_operator", "personal", "vendor", "internal"] as const;
export const ORG_STATUSES = ["pending", "active", "suspended", "rejected", "archived"] as const;
export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"] as const;

export const organizations = orgs.table(
  "organizations",
  {
    id: id(),
    referenceId: referenceId("ORG"),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    orgType: text("org_type").notNull(),
    status: text("status").notNull().default("active"),
    verificationStatus: text("verification_status").notNull().default("unverified"),
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    contactEmail: citext("contact_email"),
    contactPhone: text("contact_phone"),
    /** RERA registration for brokerages and developers, where the state requires one. */
    reraRegistration: text("rera_registration"),
    /** GSTIN, upper case (15 characters; its characters 3 to 12 are the PAN). */
    gstin: text("gstin"),
    /** The registered office address, as one block of text. */
    address: text("address"),
    website: text("website"),
    cityPlaceId: uuid("city_place_id").references(() => places.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Development sample data. Never shown as real, never seeded in production. */
    isSample: boolean("is_sample").notNull().default(false),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("organizations_status_created_idx").on(t.status, t.createdAt),
    index("organizations_type_status_idx").on(t.orgType, t.status),
    index("organizations_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    // Exactly one platform organization.
    uniqueIndex("organizations_single_internal_idx").on(t.orgType).where(sql`"org_type" = 'internal'`),
    // One live organization per GSTIN (a rejected or deleted one doesn't block a new application).
    uniqueIndex("organizations_gstin_idx").on(t.gstin).where(sql`"gstin" IS NOT NULL AND "deleted_at" IS NULL AND "status" <> 'rejected'`),
    check("organizations_gstin_check", sql`"gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`),
    check("organizations_org_type_check", inList("org_type", ORG_TYPES)),
    check("organizations_status_check", inList("status", ORG_STATUSES)),
    check("organizations_verification_status_check", inList("verification_status", VERIFICATION_STATUSES)),
  ],
);

// ── RBAC ────────────────────────────────────────────────────────────────────────

export const PERMISSION_SCOPES = ["own", "team", "org", "platform"] as const;
export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended", "removed"] as const;

/** The catalogue. Rows are synced from lib/authz/catalog.ts by `npm run db:seed:reference`. */
export const permissions = orgs.table(
  "permissions",
  {
    code: text("code").primaryKey(),
    domain: text("domain").notNull(),
    description: text("description").notNull(),
    /** Only meaningful inside the internal organization. */
    isPlatform: boolean("is_platform").notNull().default(false),
  },
  () => [check("permissions_code_check", sql`"code" ~ '^[a-z]+\\.[a-z_]+$'`)],
);

/** A role template when organization_id IS NULL, otherwise an organization's own role. */
export const roles = orgs.table(
  "roles",
  {
    id: id(),
    organizationId: uuid("organization_id").references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Which workspace this role opens: the platform console or the professional workspace. */
    workspace: text("workspace").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("roles_org_code_unique").on(t.organizationId, t.code).nullsNotDistinct(),
    check("roles_workspace_check", sql`"workspace" IN ('platform', 'professional')`),
  ],
);

export const rolePermissions = orgs.table(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] }), check("role_permissions_scope_check", inList("scope", PERMISSION_SCOPES))],
);

export const memberships = orgs.table(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    title: text("title"),
    statusReason: text("status_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("memberships_user_org_unique").on(t.userId, t.organizationId),
    index("memberships_org_status_idx").on(t.organizationId, t.status),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_status_check", inList("status", MEMBERSHIP_STATUSES)),
  ],
);

export const membershipRoles = orgs.table(
  "membership_roles",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.roleId] }), index("membership_roles_role_id_idx").on(t.roleId)],
);

/** Direct grants on top of roles. This is how a SuperAdmin tailors each admin's powers. */
export const membershipPermissions = orgs.table(
  "membership_permissions",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.permissionCode] }),
    check("membership_permissions_scope_check", inList("scope", PERMISSION_SCOPES)),
  ],
);

/** Teams make `scope = team` meaningful: a team lead sees their team members' work. */
export const teams = orgs.table(
  "teams",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [unique("teams_org_name_unique").on(t.organizationId, t.name)],
);

export const teamMembers = orgs.table(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.membershipId] }), index("team_members_membership_id_idx").on(t.membershipId)],
);

// ── People with professional standing ──────────────────────────────────────────

export const AGENT_STATUSES = ["pending", "active", "suspended", "rejected"] as const;
/**
 * How an agent applied: on their own, to join an organization already on Trustbrick, or
 * registering a new organization (which is created pending, and goes live when they're approved).
 */
export const AGENT_APPLICATION_TYPES = ["independent", "join_organization", "new_organization"] as const;

/**
 * An agent's professional profile. Where they work is their membership, not a column here,
 * so an agent moving brokerage is a membership change, not a profile rewrite.
 */
export const agentProfiles = orgs.table(
  "agent_profiles",
  {
    id: id(),
    referenceId: referenceId("AGT"),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Where the agent asked to work. The membership is created there on approval. */
    requestedOrganizationId: uuid("requested_organization_id").references(() => organizations.id, { onDelete: "set null" }),
    applicationType: text("application_type").notNull().default("independent"),
    phone: text("phone").notNull(),
    reraAgentNumber: text("rera_agent_number"),
    cityPlaceId: uuid("city_place_id").references(() => places.id, { onDelete: "set null" }),
    experienceYears: smallint("experience_years"),
    bio: text("bio"),
    status: text("status").notNull().default("pending"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    statusReason: text("status_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("agent_profiles_status_created_idx").on(t.status, t.createdAt),
    check("agent_profiles_status_check", inList("status", AGENT_STATUSES)),
    check("agent_profiles_application_type_check", inList("application_type", AGENT_APPLICATION_TYPES)),
    check("agent_profiles_verification_status_check", inList("verification_status", VERIFICATION_STATUSES)),
    check("agent_profiles_phone_check", sql`"phone" ~ '^[+]?[0-9]{10,15}$'`),
    check("agent_profiles_experience_check", sql`"experience_years" IS NULL OR "experience_years" BETWEEN 0 AND 70`),
  ],
);

/**
 * An agent application made while signing up, kept until the person confirms their email:
 * only then does it become an application (so admins never review unconfirmed addresses).
 */
export const agentSignups = orgs.table("agent_signups", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The application form, as submitted (validated again when it's sent on). */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Staff identity. Access itself is the internal-organization membership and its grants. */
export const adminProfiles = orgs.table(
  "admin_profiles",
  {
    id: id(),
    /** `ADM-` for admins, `SADM-` for SuperAdmins; fixed at creation, like every reference ID. */
    referenceId: text("reference_id").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .unique()
      .references(() => memberships.id, { onDelete: "restrict" }),
    level: text("level").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  () => [
    check("admin_profiles_level_check", sql`"level" IN ('admin', 'superadmin')`),
    check(
      "admin_profiles_reference_check",
      sql`("level" = 'admin' AND "reference_id" ~ '^ADM-[0-9A-HJKMNP-TV-Z]{8}$') OR ("level" = 'superadmin' AND "reference_id" ~ '^SADM-[0-9A-HJKMNP-TV-Z]{8}$')`,
    ),
  ],
);

export const INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;

export const adminInvitations = orgs.table(
  "admin_invitations",
  {
    id: id(),
    referenceId: referenceId("INV"),
    email: citext("email").notNull(),
    name: text("name"),
    /** SHA-256 of the token. The token itself exists only in the emailed link. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Permission codes the admin receives on acceptance. */
    permissionCodes: text("permission_codes").array().notNull(),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("admin_invitations_one_pending_idx").on(t.email).where(sql`"status" = 'pending'`),
    index("admin_invitations_status_created_idx").on(t.status, t.createdAt),
    check("admin_invitations_status_check", inList("status", INVITATION_STATUSES)),
  ],
);

/** Roles an admin can give an agent they create. Team leads need a team, which has no screens yet. */
export const INVITED_AGENT_ROLES = ["agent", "broker_admin"] as const;

/**
 * An admin creating an agent (docs/portals/README.md §6). The details are held here until
 * the person accepts; only then do the account, agent profile and membership exist, so
 * nobody gets a workspace they didn't agree to.
 */
export const agentInvitations = orgs.table(
  "agent_invitations",
  {
    id: id(),
    referenceId: referenceId("INV"),
    email: citext("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    cityPlaceId: uuid("city_place_id").references(() => places.id, { onDelete: "set null" }),
    reraAgentNumber: text("rera_agent_number"),
    experienceYears: smallint("experience_years"),
    /** The organization the agent joins; NULL means they work independently. */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    roleCode: text("role_code").notNull().default("agent"),
    verified: boolean("verified").notNull().default(false),
    /** SHA-256 of the token. The token itself exists only in the emailed link. */
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agent_invitations_one_pending_idx").on(t.email).where(sql`"status" = 'pending'`),
    index("agent_invitations_status_created_idx").on(t.status, t.createdAt),
    check("agent_invitations_status_check", inList("status", INVITATION_STATUSES)),
    check("agent_invitations_role_check", inList("role_code", INVITED_AGENT_ROLES)),
    check("agent_invitations_broker_needs_org_check", sql`"role_code" = 'agent' OR "organization_id" IS NOT NULL`),
    check("agent_invitations_phone_check", sql`"phone" ~ '^[+]?[0-9]{10,15}$'`),
    check("agent_invitations_experience_check", sql`"experience_years" IS NULL OR "experience_years" BETWEEN 0 AND 70`),
  ],
);

/**
 * The permission catalogue and role templates (docs/portals/README.md §4).
 *
 * This file is the source of truth; `npm run db:seed:reference` syncs it into
 * orgs.permissions, orgs.roles and orgs.role_permissions. Authorization is always
 * decided on the server from those rows. The client only ever sees the result.
 */

export const SCOPES = ["own", "team", "org", "platform"] as const;
export type Scope = (typeof SCOPES)[number];
export const scopeRank = (scope: Scope) => SCOPES.indexOf(scope);

type PermissionDef = {
  domain: string;
  description: string;
  /** Platform permissions are honoured only inside the internal organization. */
  platform: boolean;
};

export const PERMISSIONS = {
  "dashboard.view": { domain: "dashboard", description: "See the dashboard for your scope", platform: false },
  "analytics.view": { domain: "analytics", description: "See analytics for your scope", platform: false },

  "users.view": { domain: "users", description: "View user accounts", platform: true },
  "users.manage": { domain: "users", description: "Edit permitted user fields and verify users", platform: true },
  "users.suspend": { domain: "users", description: "Suspend and reinstate user accounts", platform: true },

  "agents.view": { domain: "agents", description: "View agents and their activity", platform: false },
  "agents.create": { domain: "agents", description: "Create agents and send their invitations", platform: true },
  "agents.manage": { domain: "agents", description: "Edit permitted agent profile fields", platform: true },
  "agents.verify": { domain: "agents", description: "Approve, reject and verify agent applications", platform: true },
  "agents.suspend": { domain: "agents", description: "Suspend and reinstate agents", platform: true },

  "organizations.view": { domain: "organizations", description: "View organizations", platform: true },
  "organizations.manage": { domain: "organizations", description: "Create organizations and edit their details", platform: true },
  "organizations.verify": { domain: "organizations", description: "Approve, reject and verify organizations", platform: true },
  "organizations.suspend": { domain: "organizations", description: "Suspend and reinstate organizations", platform: true },

  "properties.view": { domain: "properties", description: "View properties", platform: false },
  "properties.manage": { domain: "properties", description: "Edit any property's details", platform: true },
  "properties.verify": { domain: "properties", description: "Mark properties as verified", platform: true },
  "properties.remove": { domain: "properties", description: "Remove properties and their listings from the marketplace", platform: true },

  "listings.view": { domain: "listings", description: "View listings", platform: false },
  "listings.create": { domain: "listings", description: "Onboard properties and create listings", platform: false },
  "listings.edit": { domain: "listings", description: "Edit listings; on live listings, only price, availability and offers", platform: false },
  "listings.submit": { domain: "listings", description: "Submit, withdraw and archive listings", platform: false },
  "listings.manage": { domain: "listings", description: "Unpublish and republish any listing, and change its price, availability and offers", platform: true },
  "listings.approve": { domain: "listings", description: "Approve and publish listings", platform: true },
  "listings.reject": { domain: "listings", description: "Reject listings or request changes", platform: true },

  "bookings.view": { domain: "bookings", description: "View homestay bookings", platform: false },
  "bookings.manage": { domain: "bookings", description: "Accept, decline, cancel and check in homestay bookings", platform: false },
  "conversations.view": {
    domain: "bookings",
    description: "Read guest–host conversations to resolve disputes (read-only; every access is logged with a reason)",
    platform: true,
  },
  "hosts.view": { domain: "hosts", description: "View hosts and host applications", platform: true },
  "hosts.verify": { domain: "hosts", description: "Approve, reject and verify hosts", platform: true },
  "hosts.suspend": { domain: "hosts", description: "Suspend and reinstate hosts", platform: true },

  "leads.view": { domain: "leads", description: "View leads", platform: false },
  "leads.manage": { domain: "leads", description: "Update lead status and add notes", platform: false },
  "visits.view": { domain: "visits", description: "View visits", platform: false },
  "visits.manage": { domain: "visits", description: "Schedule, complete and cancel visits", platform: false },
  "contacts.view": { domain: "contacts", description: "View contacts", platform: false },

  "verification.view": { domain: "verification", description: "View review cases", platform: true },
  "verification.manage": { domain: "verification", description: "Decide review cases", platform: true },
  "reports.view": { domain: "reports", description: "View listing reports", platform: true },
  "reports.manage": { domain: "reports", description: "Resolve listing reports", platform: true },

  "commission.view": { domain: "commission", description: "See commission rates and charges", platform: false },
  "commission.manage": { domain: "commission", description: "Set partners' commission rates, record payments, waive charges and add adjustments", platform: true },

  "subscriptions.view": { domain: "subscriptions", description: "See subscriptions, plans and subscription revenue", platform: true },
  "subscriptions.manage": { domain: "subscriptions", description: "Record subscription payments, extend trials, change, grant and cancel subscriptions", platform: true },

  "support.view": { domain: "support", description: "Read Contact us messages and legal verification requests", platform: true },
  "support.manage": { domain: "support", description: "Resolve Contact us messages and move legal verification requests along", platform: true },

  "audit.view": { domain: "audit", description: "View the audit log", platform: true },
  "settings.manage": { domain: "settings", description: "Change platform settings", platform: true },
  "admins.view": { domain: "admins", description: "View administrators and invitations", platform: true },
  "admins.create": { domain: "admins", description: "Invite administrators", platform: true },
  "admins.manage": { domain: "admins", description: "Change admin permissions, suspend and reinstate admins", platform: true },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const isPermission = (value: unknown): value is Permission => typeof value === "string" && value in PERMISSIONS;

/** Never grantable to an admin: these belong to the SuperAdmin role alone. */
export const SUPERADMIN_ONLY: readonly Permission[] = ["admins.view", "admins.create", "admins.manage", "settings.manage"];

/** Private content the SuperAdmin doesn't see by default: an admin is granted it for a reason. */
const PRIVATE_CONTENT: readonly Permission[] = ["contacts.view", "conversations.view"];

/**
 * The SuperAdmin oversees; admins operate. A SuperAdmin sees everything an admin can see
 * (every `.view` permission, dashboards, analytics, the audit log) but acts only on admins
 * and platform settings. Creating organizations and agents, moderating, suspending people
 * and editing records are admin work, so they appear here only as grantable to admins.
 */
export const SUPERADMIN_GRANTS: readonly Permission[] = [
  ...ALL_PERMISSIONS.filter((p) => p.endsWith(".view") && !PRIVATE_CONTENT.includes(p) && !SUPERADMIN_ONLY.includes(p)),
  ...SUPERADMIN_ONLY,
];

/** What a SuperAdmin may grant an admin, always at platform scope. */
export const ADMIN_GRANTABLE: readonly Permission[] = ALL_PERMISSIONS.filter(
  (p) => !SUPERADMIN_ONLY.includes(p) && !["listings.create", "listings.edit", "listings.submit", "contacts.view"].includes(p),
);

export const ADMIN_PRESETS = {
  operations: {
    label: "Operations",
    description: "Runs the marketplace day to day: people, organizations, listings and reports.",
    permissions: ADMIN_GRANTABLE.filter((p) => p !== "properties.manage"),
  },
  moderation: {
    label: "Moderation",
    description: "Reviews listings and reports. Cannot change accounts.",
    permissions: [
      "analytics.view",
      "listings.view",
      "listings.approve",
      "listings.reject",
      "listings.manage",
      "properties.view",
      "properties.verify",
      "reports.view",
      "reports.manage",
      "verification.view",
      "verification.manage",
      "agents.view",
      "organizations.view",
      "hosts.view",
      "hosts.verify",
      "bookings.view",
    ],
  },
  support: {
    label: "Support (read only)",
    description: "Can look anything up to help a customer, but cannot change anything.",
    permissions: [
      "users.view",
      "agents.view",
      "organizations.view",
      "properties.view",
      "listings.view",
      "leads.view",
      "visits.view",
      "reports.view",
      "verification.view",
      "bookings.view",
      "hosts.view",
      "support.view",
      "support.manage",
      "conversations.view",
      "commission.view",
      "subscriptions.view",
    ],
  },
} as const satisfies Record<string, { label: string; description: string; permissions: readonly Permission[] }>;

export type AdminPreset = keyof typeof ADMIN_PRESETS;

type RoleDef = {
  name: string;
  description: string;
  workspace: "platform" | "professional";
  /** Agent-type roles work only while the person's agent profile is active. */
  requiresAgentProfile?: boolean;
  /** Host roles work only while the person's host profile is active. */
  requiresHostProfile?: boolean;
  /** What this role may list. Omitted means every purpose. */
  purposes?: readonly ("sale" | "rent" | "lease" | "pg" | "stay")[];
  grants: Partial<Record<Permission, Scope>>;
};

const professional = (scope: Scope, extra: Partial<Record<Permission, Scope>> = {}): Partial<Record<Permission, Scope>> => ({
  "dashboard.view": scope,
  "analytics.view": scope,
  "properties.view": scope,
  "listings.view": scope,
  "listings.create": scope,
  "listings.edit": scope,
  "listings.submit": scope,
  "leads.view": scope,
  "leads.manage": scope,
  "visits.view": scope,
  "visits.manage": scope,
  "contacts.view": scope,
  "bookings.view": scope,
  "bookings.manage": scope,
  "commission.view": scope,
  ...extra,
});

export const ROLES = {
  superadmin: {
    name: "SuperAdmin",
    description: "Creates and manages admins and platform settings, and sees everything. Created only by the bootstrap script.",
    workspace: "platform",
    grants: Object.fromEntries(SUPERADMIN_GRANTS.map((p) => [p, "platform"])),
  },
  admin: {
    name: "Admin",
    description: "Platform administrator. Holds only the dashboard; a SuperAdmin grants the rest.",
    workspace: "platform",
    grants: { "dashboard.view": "platform" },
  },
  agent: {
    name: "Agent",
    description: "Onboards properties and works their own listings, leads and visits.",
    workspace: "professional",
    requiresAgentProfile: true,
    grants: professional("own"),
  },
  team_lead: {
    name: "Team lead",
    description: "An agent who also sees their team's listings, leads and visits.",
    workspace: "professional",
    requiresAgentProfile: true,
    grants: professional("team"),
  },
  broker_admin: {
    name: "Broker admin",
    description: "Runs a brokerage: sees every listing, lead and agent in the organization.",
    workspace: "professional",
    requiresAgentProfile: true,
    grants: professional("org", { "agents.view": "org" }),
  },
  developer_admin: {
    name: "Developer admin",
    description: "Manages a developer's projects and listings.",
    workspace: "professional",
    grants: professional("org"),
  },
  property_manager: {
    name: "Property manager",
    description: "Manages listings, leads and visits for the properties the organization runs.",
    workspace: "professional",
    grants: professional("org"),
  },
  landlord: {
    name: "Landlord",
    description: "Lists their own properties for rent.",
    workspace: "professional",
    grants: professional("own", { "analytics.view": "own" }),
  },
  vendor: {
    name: "Vendor",
    description: "Service provider. Workspace features arrive with property management.",
    workspace: "professional",
    grants: { "dashboard.view": "own" },
  },
  host: {
    name: "Host",
    description: "Lists their own homes as homestays and manages their calendar and bookings.",
    workspace: "professional",
    requiresHostProfile: true,
    purposes: ["stay"],
    // No analytics.view: Performance is built on leads and visits, which hosts don't have; their dashboard covers stays.
    grants: {
      "dashboard.view": "own",
      "properties.view": "own",
      "listings.view": "own",
      "listings.create": "own",
      "listings.edit": "own",
      "listings.submit": "own",
      "bookings.view": "own",
      "bookings.manage": "own",
      "commission.view": "own",
    },
  },
  investor: {
    name: "Investor",
    description: "Tracks investment properties. Workspace features arrive with the investor product.",
    workspace: "professional",
    grants: { "dashboard.view": "own", "analytics.view": "own" },
  },
} as const satisfies Record<string, RoleDef>;

export type RoleCode = keyof typeof ROLES;
export const AGENT_ROLE_CODES: readonly RoleCode[] = (Object.keys(ROLES) as RoleCode[]).filter(
  (code) => (ROLES[code] as RoleDef).requiresAgentProfile,
);
export const HOST_ROLE_CODES: readonly RoleCode[] = (Object.keys(ROLES) as RoleCode[]).filter((code) => (ROLES[code] as RoleDef).requiresHostProfile);

const ALL_PURPOSES = ["sale", "rent", "lease", "pg", "stay"] as const;
export type ListingPurpose = (typeof ALL_PURPOSES)[number];

/** What someone holding these roles may list: the union of their roles' purposes. */
export function purposesForRoles(roles: readonly RoleCode[]): ListingPurpose[] {
  const allowed = new Set<ListingPurpose>();
  for (const code of roles) for (const p of (ROLES[code] as RoleDef | undefined)?.purposes ?? ALL_PURPOSES) allowed.add(p);
  return ALL_PURPOSES.filter((p) => allowed.has(p));
}

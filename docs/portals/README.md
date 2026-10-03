# Workspaces: Admin, SuperAdmin and Agent portals

> **Status:** Implemented. This document was written first, as the architecture assessment the brief asked for,
> and then kept in step with what was built. Anything not built is listed in [§15](#15-what-is-not-built).

Trustbrick is one platform with role-aware **workspaces**, not three applications sharing a database. Customers,
agents, admins and the SuperAdmin use the same users, organizations, properties, listings, leads and audit trail.
What differs is the permissions each person holds, and those are checked on the server for every page and action.

## 1. Current architecture (before this work)

| Area | What existed |
| --- | --- |
| Framework | Next.js 16 App Router, React 19 Server Components, server actions, Tailwind v4, TypeScript |
| Database | PostgreSQL 17 + PostGIS; Drizzle ORM with reviewed SQL migrations; roles `trustbrick_owner` (DDL) and `trustbrick_app` (DML only, NOBYPASSRLS) |
| Auth | Better Auth: email + password, email verification, hashed tokens, Postgres rate limits; `getSession()` / `requireSession()` |
| Authorization | **None beyond "is logged in".** No memberships, roles or permissions tables yet (designed as D7, not built) |
| Organizations | `orgs.organizations` with `org_type` (including `internal` and `personal`) and `is_sample`; no members, no status |
| Property model | `properties` (physical, with a `public_id`) ≠ `listings` (market offer, `public_id` `TB-L-XXXXXX`, `listing_status` enum); residential / commercial / land / PG attributes; `media` + `media_links` |
| Marketplace | `/buy`, `/rent`, `/pg`, `/invest`, `/listings/[id]`, bookmarks. Every listing is development sample data |
| CRM, audit, notifications, verification | Designed in `docs/database`, not built |
| Storage | No upload path; sample media point at `/public/images` |
| Tests | End-to-end Playwright scripts run by hand; no unit/integration test runner |

## 2. Gap analysis

| | |
| --- | --- |
| **Reusable as is** | Users and sessions, organizations, places/addresses, properties + attribute tables, listings, price history, PG tables, amenities, media, bookmarks, the browse queries |
| **Needs modification** | `listings`: lifecycle statuses, `price` nullable while a draft, `created_by`; `properties`: `created_by`, verification status, more attributes; `organizations`: status, reference ID; `users`: status, phone, reference ID; `public_id` → `reference_id` in the new format |
| **Needs creating** | Memberships and RBAC (D7), teams, agent and admin profiles, admin invitations, listing agents, listing status history, review cases, reports, leads/contacts/visits, listing views, notifications, audit events, system settings, file storage |
| **Conflicts** | ① D7 put staff powers on `users.platform_role`; the brief wants per-admin permissions assigned by a SuperAdmin. ② The brief's `LST-`/`PRP-` IDs replace the existing `TB-L-` format. ③ The brief asks for `/profile` and `/settings`; customers already have `/account/*`. Resolutions in §5, §8 and §10 |
| **Security risks** | Every new surface is an IDOR target (reference IDs are guessable-looking by design); staff accounts are high-value; uploads are an injection vector; suspension must actually stop access, not just hide buttons |
| **Migration risks** | Renaming `public_id` changes public listing URLs (only sample data exists, so no real links break); enum values can be added but not removed; backfilling reference IDs on existing rows |

## 3. Roles and workspaces

A **workspace** is one membership: a user acting inside one organization. Two kinds exist:

| Workspace | Who | Organization |
| --- | --- | --- |
| **Platform** | SuperAdmin, Admin | The single `internal` organization, "Trustbrick" |
| **Professional** | Agent, Team lead, Broker admin, Developer admin, Property manager, Landlord, Vendor, Investor | A brokerage, developer, PM company, or the user's own `personal` organization (D6) |
| *(none)* | Customer | No membership needed; customers keep the existing `/account` area |

A user may hold several memberships (an agent who is also a broker admin elsewhere). With more than one, the
user picks a workspace at `/workspaces`. The choice is kept in a cookie **that is only a hint**: every request
re-loads the membership and ignores the cookie unless that membership is still active and belongs to the user.

## 4. Permission model (D7, as built)

- `permissions` is the catalogue (code, domain, description, `is_platform`).
- `roles` are templates (`organization_id IS NULL`) with `role_permissions (permission, scope)`.
- `memberships` hold one or more roles (`membership_roles`) plus optional **direct grants**
  (`membership_permissions`). Direct grants are how a SuperAdmin tailors each admin's powers.
- **Scope** is part of every grant: `own` → `team` → `org` → `platform`. Code asks "may this actor do X, and
  over what?", and the answer becomes a SQL predicate. It never asks "is this user an admin?".
- **Platform scope is only honoured inside the internal organization.** A brokerage that somehow granted itself
  `platform` scope gains nothing.
- Deny by default. Suspended users, suspended memberships, suspended agents and suspended organizations resolve
  to no workspace at all.

Central checks live in `lib/authz`: `can(actor, "users.manage")`, `scopeOf(actor, "listings.view")`,
`assertCan(...)`, plus named helpers (`canCreateAdmin`, `canApproveListings`, `canOnboardProperty`, …) that
are thin wrappers so page code reads plainly.

### Permission matrix

| Permission | SuperAdmin | Admin | Agent | Team lead | Broker admin |
| --- | --- | --- | --- | --- | --- |
| `dashboard.view` | platform | platform | own | team | org |
| `analytics.view` | platform | granted | own | team | org |
| `users.view` | platform | granted | — | — | — |
| `users.manage` / `users.suspend` | — | granted | — | — | — |
| `agents.view` | platform | granted | — | — | org |
| `agents.create` / `agents.manage` / `agents.verify` / `agents.suspend` | — | granted | — | — | — |
| `organizations.view` | platform | granted | — | — | — |
| `organizations.manage` / `.verify` / `.suspend` | — | granted | — | — | — |
| `properties.view` | platform | granted | own | team | org |
| `properties.manage` / `.verify` / `.remove` | — | granted | — | — | — |
| `listings.view` | platform | granted | own | team | org |
| `listings.create` / `listings.edit` / `listings.submit` | — | — | own | team | org |
| `listings.manage` / `listings.approve` / `listings.reject` | — | granted | — | — | — |
| `leads.view` / `leads.manage` | platform (view) | granted | own | team | org |
| `visits.view` / `visits.manage` | platform (view) | granted | own | team | org |
| `contacts.view` | — | — | own | team | org |
| `conversations.view` | — | granted (Operations, Support) | — | — | — |
| `verification.view` / `verification.manage` | platform (view) | granted | — | — | — |
| `reports.view` / `reports.manage` | platform (view) | granted | — | — | — |
| `audit.view` | platform | granted | — | — | —
| `settings.manage` | platform | — | — | — | — |
| `admins.view` / `admins.create` / `admins.manage` | platform | — | — | — | — |

"granted" means the Admin role carries only `dashboard.view`; everything else is granted per admin by a
SuperAdmin, starting from a preset (Operations, Moderation, Support read-only). `admins.*` and `settings.manage`
can never be granted to an admin: they belong to the SuperAdmin role alone.

**The SuperAdmin oversees; admins operate.** The SuperAdmin holds every `.view` permission except private content
(`contacts.view`, `conversations.view`), (so it sees the same
dashboards, analytics, people, organizations, listings, approvals and audit log) plus `admins.*` and
`settings.manage`, and nothing else. Creating organizations (`organizations.manage`), creating agents
(`agents.create`) and approving agent applications (`agents.verify`), moderating, suspending and editing records
are admin work. The split is defined once, as `SUPERADMIN_GRANTS` in `lib/authz/catalog.ts`.

Developer admin, Property manager, Landlord, Vendor and Investor exist as role templates with sensible
listing/lead permissions, so they work in the professional workspace. None of them has a self-service signup yet.

## 5. SuperAdmin and Admin

- **SuperAdmins are bootstrapped, never created in the UI** (`npm run admin:bootstrap -- --email …` promotes an
  existing, verified account). No UI path can create, promote to, suspend or edit a SuperAdmin, and the last active
  SuperAdmin cannot be removed.
- **Admins are invited.** SuperAdmin → invite (email + permissions) → the invitee sets a name and password (or
  logs in, if the email already has an account) → the admin membership is created active. Invitation tokens are
  stored as SHA-256 hashes, expire after 72 hours, are single-use and revocable.
- Sensitive SuperAdmin actions (invite, change permissions, suspend or reinstate an admin, change system
  settings) require **re-entering the password** and are written to the audit log with before/after state.
- Admin IDs: `ADM-XXXXXXXX`; SuperAdmin IDs: `SADM-XXXXXXXX`. Every staff member is also a user (`USR-`).

Conflict ① resolved: instead of `users.platform_role`, staff are members of the internal organization. That keeps
**one** RBAC system (the brief's requirement) while preserving D7's intent, because platform scope is only
honoured for that organization.

## 6. Agents

- **Admins create agents** at `/agents/new` (or *Add agent* on an organization's page, which fills in its `ORG-`
  reference). The admin enters name, email, phone, city, RERA number and experience, the organization (blank for an
  independent agent), the role (agent, or broker admin of that organization) and whether they're verified. This
  stores an `agent_invitations` row (`INV-…`) and emails a one-time link (SHA-256 hashed, 72 hours, revocable).
  When the person accepts, their account (if new, with the email already confirmed), active `AGT-` profile and
  membership are created in one transaction. Nothing exists until they accept, so nobody gets a workspace they
  didn't agree to. Staff and existing agents or applicants are refused.
- Alternatively, a logged-in customer applies at `/become-an-agent` (phone, RERA agent registration number, city, independent or
  an existing brokerage). This creates `agent_profiles (AGT-…, status pending)` and a review case.
- An admin with `agents.verify` approves or rejects. Approval activates the agent membership (in the brokerage, or
  in the agent's `personal` organization, created on approval as decided in D6).
- Agents onboard properties, see only their own listings, leads, visits and contacts (scope `own`). Team leads and
  broker admins see their team's or organization's through the same pages, via scope.

## 7. Property onboarding and publishing

```
Property (PRP-…)  ─1:n─  Listing (LST-…)  ─1:n─  listing_agents  ─→  agent (user + membership)  ─→  organization
```

- The wizard (`/properties/new`) collects purpose → category → type → location and **creates a draft** straight
  away (property, address, listing, primary listing-agent row). Details, pricing, amenities and media are then
  edited step by step on the draft, so nothing typed in the field is lost.
- Property types, their allowed purposes, amenities and places are database reference data, not constants in
  components.
- Lifecycle (validated server-side in `lib/listings/lifecycle.ts`; the client can only *request* a named action):

```
draft ──submit──▶ submitted ──start review──▶ under_review ──approve (remark)──▶ approved ──▶ published
                     │                              ├──reject (remark)──▶ rejected ──edit──▶ resubmit
                     │                              └──request changes (reason)──▶ changes_requested ──edit──▶ resubmit
published ──unpublish (reason)──▶ unpublished ──republish──▶ published
published ──(agent or org suspended)──▶ paused ──(reinstated)──▶ published
any ──withdraw / archive / remove (reason)──▶ withdrawn / archived / removed
```

- `submitted` reads **Waiting for approval** in the UI. It and `under_review` both count in the Approvals
  "Waiting for approval" tab and the sidebar badge.
- Approve and reject both require a remark (≥ 10 characters). It's stored as the review case's
  `decision_reason`, on the status-history row, and sent as the agent's notification body.
- Every transition writes `listing_status_history`, and admin transitions also write `audit_events`.
- Submission checks required fields per type, location, pricing and at least one photo; runs **duplicate
  detection** (same type within 30 m with matching unit or similar area, similar address text in the same
  locality, identical photo checksums) and **quality checks**. Findings are attached to the review case as flags
  for the moderator. They never block silently.
- Approval publishes the listing into the **same** `listings` table the public pages already query, so it appears
  in `/buy`, `/rent`, `/pg` or `/invest` with no second search system.
- A SuperAdmin setting, off by default, lets listings from **verified** agents publish without manual review.

## 8. Reference IDs

- Format: `PREFIX-XXXXXXXX`, eight Crockford base32 characters (no I, L, O, U) from 40 random bits, generated
  in the database by `platform.gen_reference_id(prefix)` as a column default. Unique, indexed, immutable (a
  trigger rejects updates), never derived from email, phone or row order.
- Prefixes: `USR` users · `AGT` agents · `ADM`/`SADM` staff · `ORG` organizations · `PRP` properties · `LST`
  listings · `PROJ` projects · `LEAD` leads · `VIS` visits · `VER` review cases · `RPT` reports · `INV` invitations
  · `CON` contacts · `DOC` documents. `MSG` and `TXN` are reserved for messaging and transactions, which are not built.
- At 40 bits, a collision is roughly a one-in-a-million event at a million rows; inserts that hit the unique
  constraint retry with a fresh ID.
- Conflict ② resolved: `public_id` is renamed to `reference_id` and existing rows are re-issued in the new
  format by the migration. Only sample data existed, so no real link breaks.
- **A reference ID is an identifier, never an authorization.** Every lookup by reference still passes the actor's
  scope predicate.

## 9. Database migration plan

One reviewed migration per concern (`db/migrations/0004…`), all additive except the `public_id` rename:

1. `platform` schema: `gen_reference_id()`, `audit_events` (append-only: app role has INSERT/SELECT, and a trigger
   rejects UPDATE/DELETE), `notifications`, `system_settings`.
2. RBAC: `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `membership_permissions`,
   `teams`, `team_members`; organization status, reference ID and verification status; user status, phone and
   reference ID.
3. People: `agent_profiles`, `admin_profiles`, `admin_invitations`.
4. Marketplace: listing lifecycle enum values, `listing_agents`, `listing_status_history`, `listing_views`,
   onboarding attributes, `price` nullable only for drafts, `reference_id` on properties/listings/projects.
5. Trust: `review_cases`, `reports`. CRM: `contacts`, `leads`, `lead_activities`, `visits`.

As applied:

| Migration | What it does |
| --- | --- |
| `0004_reference_ids` | `platform` schema, `gen_reference_id(prefix)`, the `keep_reference_id` and `reject_modification` trigger functions |
| `0005_workspaces` | Every new table and column above. Listing status becomes `text` + CHECK instead of an enum (new enum values can't be used in the same transaction, and enum casts aren't immutable in index predicates); the browse indexes are dropped and recreated around the change |
| `0006_workspace_guards` | Grants on `crm` and `trust`; `REVOKE UPDATE, DELETE` plus reject triggers on `audit_events`, `listing_status_history` and `lead_activities`; reference-ID immutability triggers; the internal organization |
| `0007_drop_public_ids` | Drops `listings.public_id` once `reference_id` replaced it (listing URLs are now `/listings/LST-…`) |
| `0008_commercial_parking` | Parking attributes for commercial properties |
| `0009_append_only_actor_ids` | Drops actor foreign keys on append-only tables, so the history survives and an `ON DELETE SET NULL` can never try to rewrite it |
| `0010_agent_invitations` | `orgs.agent_invitations`: admin-created agents waiting to accept (one pending invitation per email; a broker admin must name an organization) |

Catalogue data (permissions, role templates, property types, amenities) is upserted by `npm run db:seed:reference`,
which is safe to re-run. Development accounts and agent data come from `npm run db:seed:dev`, which refuses to run
in production or against a remote database.

## 10. Routes

Route groups keep role names out of URLs. The same URL shows different data depending on the actor's scope.

| URL | Who | Shows |
| --- | --- | --- |
| `/dashboard` | any workspace | Platform dashboard or professional dashboard, chosen on the server |
| `/workspaces` | users with 2+ memberships | Workspace chooser |
| `/properties`, `/properties/new`, `/properties/[ref]`, `/properties/[ref]/edit` | listings.view / listings.create | Agents: their properties and the onboarding wizard. Admins: every property |
| `/approvals`, `/approvals/[ref]` | listings.approve | Approvals (was the review queue at `/moderation`, which redirects) and case decisions |
| `/reports` | reports.view | Listing reports from customers |
| `/leads`, `/leads/[ref]`, `/contacts`, `/visits` | leads.view, contacts.view, visits.view | Scoped CRM |
| `/conversations`, `/conversations/[ref]` | conversations.view | Guest–host conversations for disputes: read-only, reason required and audited |
| `/analytics` | analytics.view | Platform breakdowns or the agent's listing analytics |
| `/agents`, `/agents/[ref]` | agents.view | Agent management |
| `/organizations`, `/organizations/new`, `/organizations/[ref]` | organizations.view | Organization management |
| `/users`, `/users/[ref]` | users.view | User management |
| `/admins`, `/admins/invite`, `/admins/[ref]` | admins.view | SuperAdmin only |
| `/audit` | audit.view | Audit log |
| `/system` | settings.manage | Platform settings |
| `/search` | any platform permission | Global search, exact reference-ID match first |
| `/notifications`, `/profile` | any workspace | Personal |
| `/invite/[token]` | public | Accept an admin invitation |
| `/become-an-agent` | logged-in | Agent application |

Conflict ③ resolved: customers keep `/account/*`. `/dashboard` sends a customer (no workspace) there.

Unauthorised page requests render a 403 (`forbidden()`); anonymous requests go to login and come back.

## 11. Security model

- Identity (`user_id`, organization, role, permissions, agent) always comes from the session, never the request.
- Every server action and route handler: authenticate → resolve actor → check permission → apply scope to the
  query → validate input with Zod → validate the status transition → write, with audit, in one transaction.
- IDOR: lookups by reference ID include the scope predicate, so another agent's `LST-…` is simply "not found".
- Mass assignment: actions accept explicit Zod-parsed fields only; status, owner, organization and agent columns are
  never taken from input.
- Uploads: streamed to disk with a byte cap, type decided by magic bytes (not the declared MIME), images
  re-encoded by sharp (which strips EXIF, including GPS), random storage keys, documents served only to authorized
  users.
- Suspension revokes sessions and blocks new ones (a Better Auth hook), and pauses the affected published listings.
  Each suspension holds the listing separately; it goes back live only when every hold is lifted.
- Sensitive SuperAdmin actions (inviting admins, changing permissions, suspending admins, platform settings) require
  the password again, checked on the server. Only wrong passwords count towards its rate limit. Suspending an admin
  also requires typing their reference.
- Invitations store only a SHA-256 hash of the token, expire after 72 hours, work once and must be accepted by the
  invited email address.
- Row-level security: evaluated and **deferred**. The app connects with a pooled role, so RLS needs a per-transaction
  `SET LOCAL` of the actor on every query. That is worth doing as defence in depth before organizations manage
  their own members, and the scope predicates here are written to translate directly into policies. Until then,
  isolation is enforced in the service layer and covered by the IDOR tests.

## 12. Implementation phases

1. Inspection (this document) · 2. RBAC foundation · 3. Reference IDs · 4–5. Admin/SuperAdmin services and
dashboards · 6–7. Agent portal and onboarding · 8. Moderation and publishing · 9. Leads and visits · 10.
Notifications · 11. Audit · 12. Analytics and indexes · 13. Tests and security review.

## 13. Assumptions

- Agents join by applying and being approved; admins do not create agent accounts directly.
- An agent works in one organization at a time (their brokerage, or their own).
- Approving a listing publishes it immediately; `approved` exists as a state for future scheduled publishing.
- Editing a published listing requires withdrawing it first, so nothing unreviewed goes live.
- Photos of draft listings are reachable only by their unguessable URL; documents are never public.
- Uploads use the local disk driver. In production it runs only when `STORAGE_LOCAL_DIR` is set explicitly (a
  persistent volume); otherwise uploads are refused and `/media` answers 503. Several servers need an S3-compatible
  driver implementing the interface in `lib/storage`.
- Listing views are counted once per visitor per day, from a salted hash, never a raw IP.

## 14. Service layout

```
lib/authz/        catalogue, actor resolution, scope predicates, errors
lib/services/     one module per domain (users, agents, organizations, admins, listings, moderation, leads,
                  visits, reports, notifications, audit, dashboard, analytics, search, settings, media)
lib/storage/      storage driver interface and the local driver
app/(workspace)/  every workspace page; pages call services, never the database directly
```

## 15. What is not built

Messages, tasks, transactions, revenue, payments, map-based analytics, listing-share tracking, teams management UI,
broker admins adding their own agents (admins do it for them), organization self-signup, seller self-listing, S3 driver, video transcoding,
an email provider (invitations and notifications reach `/dev/mailbox` in development), row-level security, and
automated verification. Metrics that would need
these are left off the dashboards rather than shown as zero or invented.

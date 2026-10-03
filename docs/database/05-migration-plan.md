# 5. Migration plan

**Nothing in this plan runs without explicit approval, phase by phase.** Every migration is additive; no phase
drops or rewrites a table from an earlier one.

## 5.1 Tooling recommendation: Drizzle, not Prisma

I recommended Drizzle in the auth plan for its light weight. With PostGIS now in scope the argument is much
stronger, and worth stating plainly:

- Prisma has no native `geography` / `geometry` type. Spatial columns must be declared `Unsupported("geography")`,
  which means they cannot be selected or filtered through the Prisma client — every spatial query becomes raw
  SQL, and the generated types stop describing the real schema.
- Drizzle models custom types cleanly, generates plain SQL migration files you can edit, and treats hand-written
  SQL as a first-class citizen rather than an escape hatch.

A meaningful share of this schema needs SQL that ORMs do not generate: GiST indexes, exclusion constraints,
partial unique indexes, RLS policies, generated `tsvector` columns, table grants. Drizzle keeps those in the same
migration folder as everything else.

**Dependencies this adds** (each justified, per the brief's rule): `drizzle-orm`, `drizzle-kit` (dev), `pg`,
`zod` (already planned for auth validation). Nothing else.

## 5.2 Environment

- Local: `docker-compose.yml` running `postgis/postgis:17-3.5` with a named volume, on host port **5434** (5432 is
  often taken by other local Postgres instances). Redis is **not** added yet: rate limits live in Postgres, and nothing
  else needs Redis until caching or background jobs arrive
- `DATABASE_URL` in `.env.local`, validated at boot; the app connects as a role that is **not** the owner and
  does **not** bypass RLS
- Migrations run as a separate privileged role, in CI and on deploy, never from application code
- Extensions `postgis`, `ltree`, `citext`, `pg_trgm`, `btree_gist`, `pgcrypto` are created by `db/init` as superuser,
  because PostGIS cannot be created by a non-superuser. On a managed provider, enable them through the provider
- Managed-Postgres note: confirm PostGIS and these extensions are available **before** picking a provider

## 5.3 Phases

Each phase ends at a gate: schema review, a migration dry-run against a copy, and your approval before the next.

### Phase 0 — Identity

> **Status: implemented.** Migrations `0000_identity` and `0001_identity_grants`. See [04-tables.md §4.1](04-tables.md)
> for what changed from the plan and why.

`users`, `accounts`, `sessions`, `verifications`, `rate_limits`.
Five tables, no tenancy yet. Delivered: signup, email verification, login, logout, password reset, and the
`trustbrick_owner` / `trustbrick_app` role split. Verified by an end-to-end test covering the flows, account
enumeration, hashed tokens, session revocation, rate limits and open redirects.

*Deliberate forward-compatibility:* `users.intent` uses the same Buy/Rent/Sell/Invest/PG vocabulary as the hero's
intent selector, so it can later feed `leads.intent` without a translation layer.

### Phase 1 — Tenancy and place

> **Status: partially implemented** (migrations `0002_property_marketplace`, `0003_marketplace_constraints_and_grants`).
> Built: `organizations` (without members yet), `places` (one table with an `ltree` path, D4), `addresses`
> (PostGIS point, referenced by their owner, D5). Places are seeded from `db/seed/reference.mjs` for four cities;
> place boundary polygons are not stored yet.
> **Not built:** `memberships`, `roles`, `permissions`, `teams`, `audit_events`, `outbox_events`, RLS policies and
> the personal organization created at signup (D6 is approved, but nothing lists property yet, so it waits for the
> seller flow). The tenant isolation gate therefore still applies before any seller-facing feature ships.

`organizations`, `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `teams`,
`team_members`, `places`, `addresses`, `audit_events`, `outbox_events`.

Includes: the permission catalogue seed, system role templates, a personal organization created per user at
signup (D6), RLS policies on tenant-private tables, and the India place seed (states, cities, major localities)
from an open dataset — loaded as data, not committed as SQL.

Gate also requires the **tenant isolation test**: acting as org A, every query against org B's rows returns zero.

### Phase 2 — Property and listing (the core product)

> **Status: browsing subset implemented.** Built: `property_types`, `projects`, `buildings`, `properties` (units
> merged in, D2), residential / commercial / land / PG attributes, `amenities`, `property_amenities`, `media`,
> `media_links`, `listings` (with a generated full-text `search_vector`), `listing_prices` (non-overlapping price
> history enforced by an exclusion constraint), `pg_listing_terms`, `pg_room_offers` (D10) and `saved_properties`.
>
> Deviations from the plan above, on purpose:
> - `media_links` links to properties and projects only, not listings, so dependencies point one way
>   (marketplace → real_estate).
> - `listings.declared_monthly_rent` stores rent the lister declares, which the Invest page uses for a *declared*
>   yield. Nothing estimates or forecasts a return.
> - `organizations.is_sample`, `properties.source = 'sample'` and `listings.is_sample` mark development data from
>   `db/seed/sample-listings.mjs`, so the UI can badge it and it can be deleted in one statement.
>
> **Not built yet:** `unit_types`, `property_merges`, `enquiries`, `saved_searches`, `property_views`, radius and
> map-viewport search (the GiST index on `addresses.location` is in place for it), and any way to create a listing.

`property_types`, `properties`, `residential_attributes`, `commercial_attributes`, `land_attributes`,
`property_merges`, `projects`, `buildings`, `unit_types`, `amenities`, `property_amenities`, `media`,
`media_links`, `listings`, `listing_prices`, `enquiries`, `saved_properties`, `saved_searches`,
`property_views`, `pg_attributes`, `pg_listing_terms`, `pg_room_offers` (D10; `pg_beds` waits for phase 5).

This is the phase that matters. After it, the core model is fixed and everything later attaches to it.
Deliverable: create a property, publish a listing, search by locality/price/type, radius and map-viewport
search, price history.

### Phase 3 — CRM, visits, trust

`contacts`, `leads`, `lead_activities`, `lead_assignments`, `pipeline_stages`, `tasks`, `visits`,
`visit_participants`, `visit_feedback`, `verification_cases`, `verification_checks`, `verification_documents`,
`trust_scores`, `trust_score_factors`, `valuations`, `valuation_comparables`.

Gate condition specific to this phase: a Trustbrick Score may only be **shown** in the UI once it can be
explained from `trust_score_factors`. Until then the Intelligence section keeps its "illustrative" labelling.

### Phase 4 — Messaging and transactions

`conversations`, `conversation_participants`, `messages`, `notifications`, `transactions`, `offers`,
`transaction_parties`, `transaction_documents`, `signature_requests`, `payments`.

### Phase 5 — Property management, finance, search

`leases`, `lease_parties`, `rent_charges`, `rent_payments`, `maintenance_requests`, `vendors`,
`vendor_assignments`; provider-backed finance abstractions; OpenSearch fed from `outbox_events`.

Regulated financial functionality is not built here — only provider abstractions. Trustbrick cannot offer
regulated financial services without the corresponding licences and compliance structure.

## 5.4 Rules for every migration

1. Additive by default. Renames and drops require explicit approval and a two-step deploy (add, backfill,
   switch, then drop in a later release).
2. No destructive statement runs without being called out in the pull request description.
3. Every migration is reversible, or documents why it is not.
4. Indexes on large tables are created `CONCURRENTLY` once there is production data.
5. Backfills run outside the migration when they touch many rows.
6. Seed data (permissions, property types, places) lives in versioned seed scripts, separate from schema
   migrations.

## 5.5 Recommended immediate next step

Approve or amend the ten decisions in [README.md](README.md) — in particular **D2 (merge units into
properties)**, **D4 (one `places` table)** and **D5 (invert the address relationship)**, since those three shape
everything built afterwards.

Phase 0 is done, and the browsing subset of Phases 1 and 2 is built on the approved decisions. The next slice is
the **seller flow**: memberships, roles and RLS from Phase 1, personal organizations at seller registration (D6),
then listing creation and `enquiries` from Phase 2.

# 4. Table inventory and index strategy

Legend — **Tenant**: how rows are isolated. **Del**: `soft` = `deleted_at`, `hard` = real delete.
**Audit**: whether changes are written to `audit_events`.

Conventions applied to every table unless stated otherwise:

- `id uuid PRIMARY KEY` (UUIDv7, time-ordered), plus `public_id text UNIQUE` on entities exposed in URLs
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
- Money: `numeric(16,2)` + `currency char(3) NOT NULL DEFAULT 'INR'`
- Area: `numeric(10,2)` in sqft, with the originally entered unit retained for display
- Foreign keys are always declared; `ON DELETE RESTRICT` by default, `CASCADE` only for owned child rows
- Every soft-deleted table gets partial indexes and partial unique constraints `WHERE deleted_at IS NULL`

---

## 4.1 identity — phase 0 (built)

As implemented in `lib/db/schema/identity.ts` and `db/migrations/0000_identity.sql`, in the `identity` Postgres schema.

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `users` | One human. Never duplicated per role | `id uuid` (v7), `email citext UNIQUE`, `email_verified boolean`, `name` (CHECK 1–120 chars), `image`, `intent` (CHECK in buy/rent/sell/invest/pg) | global | hard (see below) | planned |
| `accounts` | Ways to hold an account. **A password is the `credential` provider** | `user_id FK CASCADE`, `provider_id`, `account_id`, `password` (scrypt hash), OAuth token columns, UNIQUE(provider_id, account_id) | user | hard | planned |
| `sessions` | Server-side, revocable sessions | `user_id FK CASCADE`, `token UNIQUE`, `expires_at`, `ip_address`, `user_agent` | user | hard | no |
| `verifications` | Reset tokens and other short-lived secrets | `identifier` (**stored hashed**), `value`, `expires_at` | global | hard | no |
| `rate_limits` | Fixed-window counters shared by every app instance | `key UNIQUE`, `count`, `last_request bigint` | global | hard | no |

Indexes: `sessions(user_id)`, `sessions(expires_at)`, `accounts(user_id)`, `verifications(identifier)`,
`verifications(expires_at)`, plus the unique constraints above.

**Deviations from the original blueprint, and why:**

- **No separate `credentials` table.** The auth library models a password as one more account provider
  (`provider_id = 'credential'`). That is a sound shape — Google sign-in later is just another row — and fighting
  the library's model would add risk for no benefit.
- **`email_verified` is a boolean**, not `email_verified_at`, because that is what the library reads. When a
  verification timestamp is needed for audit, it will come from `audit_events` (phase 1).
- **`verification_tokens` became `verifications`**, holding hashed identifiers. The library stores them in plain text
  by default; hashing was switched on explicitly (`storeIdentifier: "hashed"`) to honour this plan.
- **`rate_limits` was added.** Limits must hold across multiple servers, which rules out in-memory counters.
- **`phone`, `platform_role`, `last_login_at` and `deleted_at` are deferred** to phase 1. Soft-deleting users needs a
  deliberate design (a soft-deleted user must also be unable to log in, and DPDP deletion requests mean some data
  must genuinely be erased), so it is not bolted on here.
- **Email verification links** are signed tokens that are never stored, which is why the only rows in
  `verifications` are password resets.

## 4.2 orgs — phase 1

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `organizations` | Brokerage, developer, PM company, vendor, or an auto-created personal workspace (D6) | `slug UNIQUE`, `org_type`, `is_personal`, `status`, `address_id FK` | self | soft | yes |
| `memberships` | A user inside an organization | `user_id FK`, `organization_id FK`, `status`, `title`, UNIQUE(user_id, organization_id) | org | soft | yes |
| `roles` | Org-scoped role, or a system template when `organization_id IS NULL` | `organization_id FK NULL`, `code`, `name`, UNIQUE(organization_id, code) | org | hard | yes |
| `permissions` | Static catalogue: `property.create`, `listing.publish`, `lead.assign`, … | `code UNIQUE`, `domain`, `description` | global | hard | no |
| `role_permissions` | Grant, **with scope** (D7) | `role_id FK`, `permission_id FK`, `scope` (`own`/`team`/`org`/`all`) | org | hard | yes |
| `membership_roles` | A membership may hold several roles | `membership_id FK`, `role_id FK` | org | hard | yes |
| `teams`, `team_members` | Optional grouping that makes `scope = team` meaningful | `organization_id FK` | org | soft | yes |

Indexes: `memberships(organization_id, status)`, `memberships(user_id)`, `role_permissions(role_id)`.

## 4.3 geography — phase 1

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `places` | The whole hierarchy in one self-referencing table (D4) | `parent_id FK`, `place_type`, `name`, `slug`, `path ltree`, `centroid geography(Point,4326)`, `boundary geometry(MultiPolygon,4326)`, `population`, `is_active` | global | soft | yes |
| `addresses` | Reusable postal address, owned by whoever references it (D5) | `place_id FK`, `line1`, `line2`, `landmark`, `postal_code`, `location geography(Point,4326)` | inherits | hard | no |

Indexes:

- `places USING GIST (boundary)` — "which locality contains this point", "properties inside this polygon"
- `places USING GIST (path)` — ltree ancestor/descendant, e.g. everything under Hyderabad in one indexed query
- `places USING GIN (name gin_trgm_ops)` — typo-tolerant locality autocomplete
- `addresses USING GIST (location)` — radius and viewport search, the single most important spatial index
- `addresses(place_id)`, `places(parent_id)`, `places(slug) UNIQUE`

## 4.4 real_estate — phase 1 and 2

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `properties` | **The physical asset.** Survives every listing | `address_id FK UNIQUE`, `property_type_id FK`, `organization_id FK NULL`, `owner_user_id FK NULL`, `project_id FK NULL`, `building_id FK NULL`, `unit_type_id FK NULL`, `floor_number`, `floor_label`, `unit_number`, `carpet_area_sqft`, `built_up_area_sqft`, `super_built_up_area_sqft`, `year_built`, `lifecycle_status`, `inventory_status`, `source`, `confidence` | public read / org write | soft | yes |
| `property_types` | Lookup, not an enum, because categories keep growing | `code UNIQUE`, `category`, `name` | global | hard | no |
| `residential_attributes` | 1:1 extension, only for residential | `property_id PK+FK`, `bedrooms`, `bathrooms`, `balconies`, `furnishing`, `facing`, `parking_covered` | follows property | hard | yes |
| `commercial_attributes` | 1:1 extension | `property_id PK+FK`, `floor_plate_sqft`, `grade`, `workstations`, `fitout_status` | follows property | hard | yes |
| `land_attributes` | 1:1 extension | `property_id PK+FK`, `plot_area_sqyd`, `zoning`, `road_width_ft`, `corner_plot` | follows property | hard | yes |
| `property_merges` | Duplicate resolution trail (D1) | `surviving_property_id FK`, `merged_property_id FK`, `merged_by FK`, `reason` | global | hard | yes |
| `projects` | Development by a builder | `organization_id FK`, `address_id FK`, `name`, `rera_number`, `status`, `launch_date`, `possession_date` | public read / org write | soft | yes |
| `buildings` | Tower within a project | `project_id FK`, `name`, `floors_above_ground`, UNIQUE(project_id, name) | follows project | soft | yes |
| `unit_types` | Reusable floor plan, replaces per-unit duplication (D2) | `project_id FK`, `name`, `carpet_area_sqft`, `bedrooms`, `bathrooms` | follows project | soft | yes |
| `media` | Asset metadata only; bytes live in object storage | `storage_key UNIQUE`, `media_type`, `mime_type`, `size_bytes`, `width`, `height`, `checksum`, `uploaded_by FK` | org | soft | yes |
| `media_links` | Attach media with real FKs (D8) | `media_id FK`, one of `property_id`/`project_id`/`listing_id`/`unit_type_id`/`organization_id`, `role`, `sort_order`, CHECK num_nonnulls = 1 | follows parent | hard | no |
| `amenities`, `property_amenities` | Many-to-many lookup rather than boolean columns | `code UNIQUE` | global | hard | no |

Key constraints on `properties`:

- `UNIQUE (building_id, unit_number) WHERE deleted_at IS NULL AND building_id IS NOT NULL` — the natural key that
  stops the same flat existing twice (D1)
- `CHECK (carpet_area_sqft <= built_up_area_sqft)` and `built_up <= super_built_up` where all are present
- `CHECK` that a property has either an organization or an owner user
- Attribute-table presence is enforced in the application against `property_types.category`; a trigger can
  harden it later if needed

Indexes: `properties(organization_id) WHERE deleted_at IS NULL`; `properties(project_id, building_id)`;
`properties(property_type_id)`; `properties(address_id) UNIQUE`; plus the spatial index on the joined address.

## 4.5 marketplace — phase 2

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `listings` | **The market offer.** Many per property, over time | `property_id FK`, `organization_id FK`, `created_by FK`, `transaction_type` (`sale`/`rent`/`lease`/`pg`), `status` (`draft`/`pending_review`/`published`/`paused`/`expired`/`withdrawn`/`transacted`), `price`, `price_negotiable`, `rent_amount`, `deposit_amount`, `maintenance_amount`, `available_from`, `rera_id`, `title`, `description`, `published_at`, `expires_at` | public read / org write | soft | yes |
| `listing_prices` | Price history, never overwritten | `listing_id FK`, `price`, `price_per_sqft`, `effective tstzrange`, `changed_by FK` | follows listing | hard | yes |
| `enquiries` | Public contact attempt; becomes a CRM lead | `listing_id FK`, `contact_id FK`, `message`, `source` | org | soft | yes |
| `saved_properties` | Consumer save | `user_id FK`, `property_id FK`, UNIQUE(user_id, property_id) | user | hard | no |
| `saved_searches` | Criteria plus alerting | `user_id FK`, `criteria jsonb`, `alert_frequency`, `last_run_at` | user | hard | no |
| `property_views` | Behavioural, high volume, append-only | `property_id FK`, `user_id FK NULL`, `session_id`, `source`, `viewed_at` | user | hard | no |
| `comparisons`, `comparison_items` | Side-by-side sets | `user_id FK` | user | hard | no |

`listing_prices.effective` uses `tstzrange` with an exclusion constraint (`EXCLUDE USING gist (listing_id WITH =,
effective WITH &&)`), so overlapping price periods are impossible at the database level rather than by
convention. This is why `btree_gist` is in the extension list.

Indexes, driven by the actual search query (filter by place, type, price, then sort by recency):

- `listings(status, transaction_type, published_at DESC) WHERE deleted_at IS NULL` — the default browse
- `listings(property_id)`, `listings(organization_id, status)` — property page and org dashboard
- `listings(price) WHERE status = 'published'` — partial, because only live listings are ever filtered by price
- `listings USING GIN (search_vector)` — generated `tsvector` over title, description and locality name
- `property_views(property_id, viewed_at DESC)` and BRIN on `viewed_at`; monthly partitioning when it grows

### PGs (paying-guest accommodation) — phase 2, decision D10

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `pg_attributes` | 1:1 physical extension for `property_types.code = 'pg'` | `property_id PK+FK`, `total_rooms`, `total_beds`, `attached_bathrooms`, `common_kitchen`, CHECK `total_beds >= total_rooms` | follows property | hard | yes |
| `pg_listing_terms` | 1:1 operating terms for a `transaction_type = 'pg'` listing | `listing_id PK+FK`, `gender_policy` (`men`/`women`/`any`, NOT NULL), `meals`, `food_preference`, `notice_period_days`, `lock_in_months`, `entry_curfew time NULL`, `visitors_allowed` | follows listing | hard | yes |
| `pg_room_offers` | The room configurations on offer, each priced per bed | `listing_id FK`, `occupancy` (`single`/`double`/`triple`/`quad`), `rent_per_bed`, `deposit_amount`, `beds_available`, `has_ac`, `attached_bathroom`, UNIQUE(listing_id, occupancy, has_ac, attached_bathroom) | follows listing | soft | yes |
| `pg_beds` | **Phase 5.** Bed-level occupancy for PG management; leases may reference a bed | `property_id FK`, `room_label`, `bed_label`, UNIQUE(property_id, room_label, bed_label) | org | soft | yes |

Constraints and indexes:

- `CHECK (rent_per_bed > 0 AND beds_available >= 0)` on `pg_room_offers`
- A trigger or application rule ensures `pg_listing_terms` exists exactly when `listings.transaction_type = 'pg'`
- `listings.price` stores the lowest live `rent_per_bed`, updated in the same transaction as room-offer writes,
  so PGs share the main price index rather than needing a special-case join
- `pg_listing_terms(gender_policy, listing_id)` — serves "PGs for Women in this locality", joined to the
  published-listings index
- No gender column on `users`, ever: the filter is over the listing's policy

## 4.6 crm — phase 3

| Table | Purpose | Key columns | Tenant | Del | Audit |
| --- | --- | --- | --- | --- | --- |
| `contacts` | A person known to an organization, registered or not | `organization_id FK`, `user_id FK NULL`, `name`, `email citext`, `phone`, `source` | org | soft | yes |
| `leads` | An active opportunity | `organization_id FK`, `contact_id FK`, `listing_id FK NULL`, `property_id FK NULL`, `assigned_membership_id FK NULL`, `pipeline_stage_id FK`, `intent`, `status`, `budget_min`, `budget_max`, `source`, `score` | org | soft | yes |
| `lead_activities` | Immutable timeline | `lead_id FK`, `activity_type`, `body`, `occurred_at`, `actor_membership_id FK` | org | hard | yes |
| `lead_assignments` | Reassignment history | `lead_id FK`, `from_membership_id`, `to_membership_id`, `assigned_at` | org | hard | yes |
| `pipeline_stages` | Per-org configurable funnel | `organization_id FK`, `name`, `position`, `is_won`, `is_lost` | org | soft | yes |
| `tasks` | Follow-ups | `organization_id FK`, `lead_id FK NULL`, `assignee_membership_id FK`, `due_at`, `status` | org | soft | yes |
| `visits` | Site visits | `property_id FK`, `listing_id FK NULL`, `lead_id FK NULL`, `organization_id FK`, `scheduled_at`, `status`, `created_by FK` | org | soft | yes |
| `visit_participants`, `visit_feedback` | Who attended, what they thought | `visit_id FK` | org | hard | yes |

Indexes: `leads(organization_id, status, created_at DESC)` — the CRM list, tenant-first;
`leads(organization_id, assigned_membership_id, status)` — "my leads", which is the `scope = own` predicate;
`lead_activities(lead_id, occurred_at DESC)`; `contacts(organization_id, email)` and a trigram index on phone
for dedupe; `visits(organization_id, scheduled_at)`.

## 4.7 trust — phase 3

| Table | Purpose | Tenant | Del | Audit |
| --- | --- | --- | --- | --- |
| `verification_cases` | One verification effort against a subject (`property`, `organization`, `user`, `project`, `listing`) with `category`, `status`, `result`, `performed_by`, `performed_at` | global | soft | yes |
| `verification_checks` | Individual checks inside a case, with `result` and `provider_payload jsonb` | global | soft | yes |
| `verification_documents` | Evidence, linked to `media`, with `retention_until` and `consent_id` | global | soft | yes |
| `trust_scores` | Versioned score per entity: `score`, `algorithm_version`, `calculated_at` | global | hard | yes |
| `trust_score_factors` | Why the score is what it is: `factor_code`, `contribution`, `explanation` | global | hard | no |
| `valuations` | `method` (`automated` / `professional_appraisal`), estimate, low, high, `confidence`, `model_version` | global | hard | yes |
| `valuation_comparables` | The comparable properties behind an estimate | global | hard | no |

Index: `trust_scores(entity_type, entity_id, calculated_at DESC)` — the current score is the newest row, and
history is preserved. Same shape for `valuations(property_id, calculated_at DESC)`.

## 4.8 comms, deals, tenancy_mgmt — phase 4 and later

Specified in [03-erd.md](03-erd.md) and built only when the feature is real. The shapes that matter now, because
they constrain the core model:

- `conversations` / `conversation_participants` / `messages` — one generic model, never per-role message tables
- `transactions` — `listing_id` is **nullable**, because off-market deals exist and a transaction must be able to
  outlive the listing that started it
- `payments` — append-only, `provider_reference` to the payment gateway, never a computed balance column;
  balances are derived by summing charges and payments
- `leases` — `term daterange` with an exclusion constraint preventing two overlapping active leases on one
  property, which is the kind of rule that is miserable to enforce in application code alone

## 4.9 platform — phase 1

| Table | Purpose | Notes |
| --- | --- | --- |
| `audit_events` | Append-only audit trail | App role has INSERT/SELECT only; monthly partitions later; BRIN on `created_at` |
| `outbox_events` | Transactional outbox for search and analytics | Written in the same transaction as the change; drained by a worker; `(processed_at NULL)` partial index |
| `feature_flags` | Gradual rollout | |
| `system_settings` | Operational configuration | Never secrets; those stay in the environment |

## 4.10 Index strategy, and why

The rule is that every index must name the query it serves. Blanket indexing every column slows writes and
wastes memory.

| Index | Query it serves |
| --- | --- |
| `addresses USING GIST (location)` | "Properties within 5 km", "properties in this map viewport" — the core discovery query |
| `places USING GIST (boundary)` | "Everything inside Gachibowli", locality assignment for a dropped pin |
| `places USING GIST (path)` | Breadcrumbs and "all localities under this city" without recursive scans |
| `listings(status, transaction_type, published_at DESC)` partial on not-deleted | The default search and browse page |
| `listings(price) WHERE status = 'published'` | Price filtering; partial because only live listings matter |
| `listings USING GIN (search_vector)` | Free-text search before OpenSearch exists |
| `properties(building_id, unit_number)` unique partial | Duplicate prevention, plus fast project inventory lookups |
| `leads(organization_id, assigned_membership_id, status)` | The CRM list, and the "own scope" authorization predicate |
| `trust_scores(entity_type, entity_id, calculated_at DESC)` | Latest score without scanning history |
| BRIN on `created_at` for append-only tables | Cheap time-range scans on very large tables |

Deliberately **not** indexed at the start: description text columns beyond the tsvector, rarely filtered
attribute columns, and most boolean flags (low selectivity — a partial index on the rare value is better).

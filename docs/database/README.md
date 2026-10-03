# Trustbrick database architecture

> **Status:** **Phase 0 (identity) is implemented.** A **browsing subset of Phases 1 and 2** is implemented too
> (places, addresses, organizations, properties, listings, PGs, bookmarks) — see
> [05-migration-plan.md](05-migration-plan.md#53-phases) for exactly what was built and what was deferred.
> Decisions **D2, D4, D5, D6 and D10 are approved**. The rest of the design remains a proposal.

This folder is the design record for the Trustbrick data model. It exists so the core domain model can be
argued about and agreed *before* anything is built, because the property model is the one thing that is
genuinely expensive to change later.

| Document | What it covers |
| --- | --- |
| [01-current-state.md](01-current-state.md) | What the repository contains today, and the gap against the target architecture |
| [02-architecture.md](02-architecture.md) | Principles, domain map, core model, and every consequential design decision (including where I disagree with the brief) |
| [03-erd.md](03-erd.md) | Mermaid ERDs — core model plus one per domain |
| [04-tables.md](04-tables.md) | Table inventory: purpose, keys, columns, indexes, tenancy, soft-delete and audit posture |
| [05-migration-plan.md](05-migration-plan.md) | Phased build order with approval gates |

## The one-paragraph version

PostgreSQL 17 + PostGIS is the source of truth. The domain is modelled around six stable nouns — **person,
organization, place, property, listing, transaction** — and everything else hangs off them. A *property* is
the physical thing and survives forever; a *listing* is one offer to sell or rent it and comes and goes.
Organizations are the tenant boundary. Derived data (search index, trust scores, valuations, analytics) is
always regenerable and never authoritative. Redis is cache and rate-limiting only. Files live in object
storage; Postgres holds their metadata.

## Decisions that need your sign-off

These are the choices that are hard to reverse. Each is argued in [02-architecture.md](02-architecture.md).

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Property and Listing are separate tables | **Agree with brief** — non-negotiable, keep separate |
| D2 | `units` as a table distinct from `properties` | **Disagree with brief** — merge; a unit *is* a property. Use `unit_types` for floor-plan templates |
| D3 | `floors` as a table | **Disagree with brief** — drop; store `floor_number` on the property |
| D4 | Six geography tables (country→neighborhood) | **Disagree with brief** — one self-referencing `places` table with `ltree` path |
| D5 | `addresses.property_id` | **Disagree with brief** — invert to `properties.address_id` so orgs, projects and contacts can reuse addresses |
| D6 | Individual (non-business) sellers | Auto-create a personal organization, so tenancy has exactly one shape |
| D7 | RBAC granularity | Org-scoped roles **plus a permission scope** (own/team/org/all) — permissions alone are not enough |
| D8 | Media as one polymorphic table | Use one `media` table + `media_links` with a real FK per parent type |
| D9 | Primary keys | UUIDv7 (time-ordered) internally, opaque `public_id` for URLs |
| D10 | PGs (paying-guest accommodation) | A distinct listing type with per-bed room offers and listing-level terms — not a filter on ordinary rentals |

# 1. Current state and gap analysis

## 1.1 What was inspected

Verified directly against the working tree (no files were modified):

| Check | Result |
| --- | --- |
| Dependencies (`package.json`) | `next`, `react`, `react-dom` only; dev tooling is TypeScript, Tailwind, ESLint, sharp |
| ORM | **None.** No Prisma, Drizzle, TypeORM, Sequelize or Knex |
| Schema / migrations | **None.** No `prisma/`, `drizzle/`, `migrations/`, `db/` |
| Database client | **None.** No `pg`, `postgres.js`, connection pool or `DATABASE_URL` |
| API layer | **None.** No route handlers, no server actions, no `middleware.ts` |
| Authentication | **None.** No users, sessions, cookies or password handling |
| Authorization | **None.** No roles or permission checks |
| Property / user models | **None.** No domain types exist |
| Environment config | **None.** No `.env` files; the only variable read anywhere is `NEXT_PUBLIC_SITE_URL` |
| Routes | `/` plus generated `robots.txt`, `sitemap.xml`, `icon.svg`, `opengraph-image` — all statically prerendered |

## 1.2 What exists today

A single statically prerendered marketing page. Six components are client components (header, hero media,
intent selector, motion controller, paths, intelligence tabs) and they hold **UI state only** — no data
fetching, no persistence, no network calls at runtime.

Two places contain hard-coded sample data that *looks* like domain data and must not be mistaken for it:

- `components/visualizations/` — the Score, Passport, Value and Neighborhood mockups. These are illustrative
  constants rendered as static SVG/HTML and are explicitly labelled as sample data in the UI.
- `lib/site.ts` — brand strings, navigation and placeholder link targets.

## 1.3 Gap analysis

**There is no existing database architecture to conflict with.** That is the single most important finding:
nothing has to be migrated, reconciled or un-picked. Every decision in this document is a greenfield choice.

| Area | Exists | Missing | Conflicts | Action |
| --- | --- | --- | --- | --- |
| Persistence | — | Everything | None | Build from scratch |
| Identity/auth | — | users, sessions, credentials | None | Phase 0 (already scoped in the login/signup plan) |
| Tenancy | — | organizations, memberships, RBAC | None | Phase 1 |
| Domain model | — | places, properties, listings | None | Phase 1 |
| Derived data | Mockups in UI | trust scores, valuations, search | **Soft conflict** — see below | Phase 3, keep UI honest until then |

### The one real conflict

The Intelligence section presents **Trustbrick Score™**, **Property Passport™**, **Trustbrick Value™** and
**Neighborhood Intelligence** as product concepts. The brief for this schema (§21, §22) correctly requires
these to be *derived, versioned* data. The risk is that, once tables exist, the UI starts reading from them
before the underlying signals are real, and the page stops being honest.

Mitigation, carried into the migration plan: a score or valuation may only be displayed once it can be
explained from structured rows (`trust_score_factors`, `valuation_comparables`). Until then the UI keeps its
"illustrative / in development" labelling.

## 1.4 What should be preserved

- The static-first posture of the marketing page. Auth and app routes should be dynamic; `/` should stay
  prerendered. Introducing a database must not make the landing page render per-request.
- The design system in `app/globals.css` and the component conventions — the eventual app UI should reuse them.
- `lib/site.ts` as the single place link destinations live.

## 1.5 What should be refactored (small, later)

- `lib/site.ts → links.signup` currently points at an on-page anchor and should point at `/signup` once auth exists.
- The hero's intent selector (Buy/Rent/Sell/Invest) fires a client-side event. Once accounts exist, the same
  four values become `leads.intent` / `users.intent` — the vocabulary should be shared from one constant, not
  re-typed.

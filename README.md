# Trustbrick

**Real estate, built on trust.**

This repository contains the public landing page for **Trustbrick**, the brand of
**Trustbrick Realty and Fintech Company Pvt. Ltd.**

Trustbrick is building a technology platform that connects everyone involved in real estate: homebuyers, renters,
sellers, agents, brokers, developers, property managers and investors. Over time it will bring together property
discovery, property intelligence, professional tools, transactions, property management and financial services.

> **Scope of this repository:** the public landing page, **user accounts**, **property browsing** (Buy, Rent, PGs,
> Invest, listing pages, bookmarks, enquiries and visit requests), **homestays** (Airbnb-style stays: hosts, a booking
> calendar, requests and instant book, paid at the property) and the **workspaces**: an **Agent portal** for
> onboarding properties and working leads, and an **Admin / SuperAdmin portal** for moderation, people,
> organizations, analytics and the audit log. Everything runs on one PostgreSQL database with one permission system.
> Transactions, payments, messaging and seller self-listing are designed in [docs/database](docs/database/README.md)
> but not built yet. **Listings and accounts in development are sample data**, clearly labelled as such. Product concepts shown on the
> landing page (for example Trustbrick Score™ and Property Passport™) are illustrative previews using sample data.

---

## Contents

- [What's on the page](#whats-on-the-page)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Running in production](#running-in-production)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Accounts and authentication](#accounts-and-authentication)
- [Browsing properties](#browsing-properties)
- [Homestays](#homestays)
- [Workspaces: Agent, Admin and SuperAdmin](#workspaces-agent-admin-and-superadmin)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [Motion, accessibility and performance](#motion-accessibility-and-performance)
- [Customizing the site](#customizing-the-site)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Photo credits](#photo-credits)

---

## What's on the page

The landing page is a single, fully static page built as an editorial, art-directed experience.

| # | Section | What it does |
| --- | --- | --- |
| — | **Navigation** | Minimal header that turns solid after scrolling and steps aside while you read, returning as soon as you scroll up. It tints itself to the section beneath (dark over the cinematic sections, ivory over the light ones), shows **Log in / Sign up**, or once logged in a **user menu** (icon and first name) with Profile, Bookmarks and Log out, and has an animated full-screen menu on mobile. |
| — | **Hero** | Full-viewport city skyline at dusk with the headline *"Real estate, built on trust."* Includes an **"I'm looking to…"** selector that expands into Buy / Rent / Sell / Invest / Home Stay / **PGs** (a dropdown with PGs for Men and PGs for Women). |
| 01 | **The idea** | Editorial section explaining that real-estate decisions involve people, place, value, trust, information and transactions. |
| 02 | **Five paths** | Find a home (→ /buy) · Home Stay or host (→ /stays) · Sell property (→ /contact, topic preset) · Build your business (→ /become-an-agent) · Invest smarter (→ /invest). On desktop, hovering a path changes the photograph beside the list. |
| 03 | **Trustbrick Intelligence** | *"Know more before you decide."* Tabbed previews of Trustbrick Score™, Property Passport™, Trustbrick Value™ and Neighborhood Intelligence, clearly labelled as in development. |
| 04 | **The ecosystem** | The eight participant groups drawn as a brick wall, with a slow light travelling through the mortar joints. |
| 05 | **The road ahead** | The long-term vision: Discovery → Intelligence → Professionals → Transactions → Management → Finance. |
| — | **Final call to action** | *"Your next property decision starts here."* with Get Started and Talk to Trustbrick. |
| — | **Footer** | Company name, navigation, legal links and copyright. |

---

## Tech stack

| Layer | Technology | Version | Why it's used |
| --- | --- | --- | --- |
| Framework | [Next.js](https://nextjs.org) (App Router, Turbopack) | 16.3.5 | Static prerendering, image optimization, metadata/SEO APIs, font self-hosting |
| UI library | [React](https://react.dev) | 19.3.0 | Component model; most sections are Server Components, and only interactive parts ship JavaScript |
| Language | [TypeScript](https://www.typescriptlang.org) | 5.9.3 | Type safety across components and config |
| Styling | [Tailwind CSS](https://tailwindcss.com) (via `@tailwindcss/postcss`) | 4.3.3 | Utility styling on top of a CSS-variable design token system |
| Fonts | `next/font/google`: Instrument Serif, Geist, Geist Mono | — | Distinctive editorial display type with a clean UI sans; fonts are self-hosted at build time |
| Images | `next/image` + [sharp](https://sharp.pixelplumbing.com) | 0.35.4 | Responsive AVIF/WebP, blur placeholders, no layout shift; sharp also powers the image optimization script |
| Social image | `next/og` (`ImageResponse`) | — | Generates the Open Graph / X preview image from the hero photograph |
| Linting | [ESLint](https://eslint.org) + `eslint-config-next` (Core Web Vitals + TypeScript) | 9.39.5 / 16.3.5 | Code quality and Next.js best practices |
| Animation | Plain CSS + a small custom controller | — | Page motion uses no library: one IntersectionObserver and one scroll loop keep the JavaScript light |
| Footer wordmark | [Aceternity UI](https://ui.aceternity.com) Text Hover Effect on [Motion](https://motion.dev) | 13.4.0 | The footer's large "Trustbrick" outline lights up in brick orange under the cursor. Copied into `components/ui/text-hover-effect.tsx` (Aceternity components are copied in, not installed) and adapted to the brand |
| Database | [PostgreSQL](https://www.postgresql.org) + [PostGIS](https://postgis.net) (Docker) | 17.5 / 3.5.2 | Source of truth for all data; PostGIS is in place for location features |
| ORM & migrations | [Drizzle ORM](https://orm.drizzle.team) + drizzle-kit | 0.45.2 / 0.31.10 | Type-safe queries and plain, reviewable SQL migrations; handles PostGIS types, unlike Prisma |
| Database driver | [node-postgres](https://node-postgres.com) (`pg`) | 8.23.0 | Connection pooling to PostgreSQL |
| Authentication | [Better Auth](https://www.better-auth.com) | 1.7.5 | Email + password, sessions, email verification and password reset, stored in our own database |
| Validation | [Zod](https://zod.dev) | 4.6.5 | Validates every form submission on the server |
| IDs | [uuid](https://github.com/uuidjs/uuid) | 14.0.2 | Time-ordered UUIDv7 primary keys |

The **landing page is still prerendered as static HTML**. Account pages and the auth API run on the server and talk to
PostgreSQL.

---

## Getting started

### 1. Prerequisites

- **Node.js 22 LTS or 24** (recommended). Next.js 16 needs Node **20.9 or newer**. Node 23 works but prints a
  harmless `EBADENGINE` warning from an ESLint dependency during install.
- **npm** 10 or newer (included with Node.js).
- **Docker Desktop**, running. The local database runs in a container.
- An **internet connection for the first install and for builds**. `next/font` downloads the Google Fonts once at
  build time and then serves them from your own domain.

Check your versions:

```bash
node -v
```

```bash
npm -v
```

### 2. Open the project folder

The folder name contains a space, so keep the path in quotes:

```bash
cd "F:/TrustBrick v2"
```

### 3. Install dependencies

```bash
npm install
```

### 4. Create your environment file

Copy the example, then fill in `BETTER_AUTH_SECRET` with a random value (the command after it prints one):

```bash
cp .env.example .env.local
```

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The database URLs in the example already match the local Docker setup.

### 5. Start the database

Make sure Docker Desktop is running, then:

```bash
npm run db:up
```

The first start creates the database, the two roles and the PostGIS extensions. It waits until Postgres is healthy.

### 6. Create the tables

```bash
npm run db:migrate
```

### 7. Load reference data and sample listings

```bash
npm run db:seed:reference
npm run db:seed:sample
```

The first loads the permission catalogue and role templates, property types, amenities and places (cities and
localities). The second loads **sample listings for development** so the browse pages have something to show. It
refuses to run against a non-local database or with `NODE_ENV=production`, and running it again replaces the previous
sample data.

To try the Agent and Admin portals, also load the development accounts:

```bash
npm run db:seed:dev
```

This creates a SuperAdmin, two admins, agents, a brokerage, customers, and listings in every state (draft, submitted,
live, rejected…) with leads, visits, a report, and pending admin and agent invitations. It prints every account; they all share
the password `trustbrick-dev-2026` (override with `DEV_SEED_PASSWORD`) and use the reserved `.test` email domain.

### 8. Start the development server

```bash
npm run dev
```

### 9. Open the site

Visit **http://localhost:3000** in your browser. The page reloads automatically when you edit files.

To try accounts, click **Sign up**. No email provider is configured in development, so confirmation, reset and admin
invitation emails are captured at **http://localhost:3000/dev/mailbox** — open it and click the link.

To try homestays, open **http://localhost:3000/stays**, or log in as `host.rahul@trustbrick.test` to see the host side.

To see a workspace, log in as a development account, for example `agent.priya@trustbrick.test` (agent),
`moderator@trustbrick.test` (admin) or `superadmin@trustbrick.test` (SuperAdmin). All of them land on **/dashboard**,
which shows the right workspace for the account.

To stop the server, press `Ctrl + C` in the terminal.

---

## Available scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server with hot reload at http://localhost:3000 |
| `npm run build` | Creates an optimized production build in `.next/` |
| `npm run start` | Serves the production build (run `npm run build` first) |
| `npm run lint` | Runs ESLint across the project |
| `npm run typecheck` | Runs the TypeScript compiler without emitting files |
| `npm run images:optimize` | Resizes photos in `public/images` to at most 2560px wide and recompresses them as progressive JPEG |
| `npm run db:up` | Starts the local PostgreSQL + PostGIS container and waits until it is healthy |
| `npm run db:down` | Stops the database container. Your data is kept |
| `npm run db:migrate` | Applies pending migrations from `db/migrations` |
| `npm run db:generate` | Generates a new migration after you change a schema in `lib/db/schema` |
| `npm run db:studio` | Opens Drizzle Studio to browse the database |
| `npm run db:seed:reference` | Loads property types, amenities and places. Safe to run repeatedly |
| `npm run db:seed:sample` | **Development only.** Replaces the sample listings used by the browse pages |
| `npm run db:seed:dev` | **Development only.** Creates the SuperAdmin, admin, agent and customer accounts and their workspace data |
| `npm run admin:bootstrap -- --email you@company.com` | Makes an existing, email-confirmed account a SuperAdmin. The only way a SuperAdmin is created |
| `npm run test` | Runs the integration tests against a throwaway `trustbrick_test` database (see [Testing](#testing)) |

Recommended check before committing or deploying:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run test
```

```bash
npm run build
```

---

## Running in production

Build the site:

```bash
npm run build
```

Serve it:

```bash
npm run start
```

The production server runs at http://localhost:3000. To use a different port:

```bash
npx next start -p 3100
```

---

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | In production | `http://localhost:3000` | Public URL of the site. Used for the canonical URL, Open Graph/X metadata, `robots.txt` and `sitemap.xml`. |
| `DATABASE_URL` | Yes | — | Connection string the **app** uses. Connects as `trustbrick_app`, which can read and write data but cannot change the schema. |
| `DATABASE_URL_MIGRATIONS` | For migrations | — | Connection string **drizzle-kit** uses. Connects as `trustbrick_owner`, which owns the schema. Never used by the running app. |
| `BETTER_AUTH_URL` | Yes | — | The site's public URL. Used to build links in confirmation and reset emails. |
| `BETTER_AUTH_SECRET` | Yes | — | At least 32 random characters. Signs sessions and tokens, and keys the anonymised listing-view counter. Changing it logs everyone out. |
| `STORAGE_DRIVER` | No | `local` | Where uploaded photos, videos and documents go. Only `local` exists today; an S3-compatible driver plugs into `lib/storage`. |
| `STORAGE_LOCAL_DIR` | In production | `.data/storage` | Folder for uploads with the local driver (git-ignored). **In production it must be set explicitly** to a persistent volume, or uploads and media are refused. |
| `TEST_DATABASE_SUPERUSER_URL` | No | local `postgres` superuser | Used only by `npm run test` to create and drop the `trustbrick_test` database. |

All of these live in `.env.local` (git-ignored). `.env.example` lists them without secrets. The server validates them at
startup and refuses to run with a clear message if any are missing or malformed.

---

## Database

**Local setup.** `docker-compose.yml` runs `postgis/postgis:17-3.5` bound to `127.0.0.1` only, on port **5434** (not the
usual 5432, which other local Postgres instances often occupy; override with `TRUSTBRICK_DB_PORT`). Data persists in a
named Docker volume.

**Two roles.** `db/init` creates them when the database is first created:

| Role | Can | Used by |
| --- | --- | --- |
| `trustbrick_owner` | Create and alter tables | `npm run db:migrate` only |
| `trustbrick_app` | Read and write rows. **Cannot** alter or drop tables, cannot bypass row-level security | The running app |

So even a bug or injection in the app cannot drop a table.

**Schema.** Tables are grouped into PostgreSQL schemas by domain:

| Schema | Tables |
| --- | --- |
| `identity` | `users`, `sessions`, `accounts`, `verifications`, `rate_limits` |
| `orgs` | `organizations` (with lifecycle status), `memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `membership_permissions`, `teams`, `team_members`, `agent_profiles`, `admin_profiles`, `admin_invitations` |
| `geography` | `places` (country → state → city → locality, one table with an `ltree` path), `addresses` (PostGIS point) |
| `real_estate` | `property_types`, `projects`, `buildings`, `properties`, residential / commercial / land / PG attributes, `amenities`, `property_amenities`, `media`, `media_links` |
| `marketplace` | `listings`, `listing_prices` (price history), `listing_agents`, `listing_status_history`, `listing_views`, `pg_listing_terms`, `pg_room_offers`, `saved_properties` (bookmarks) |
| `crm` | `contacts`, `leads`, `lead_activities` (append-only), `visits` |
| `stays` | `host_profiles`, `stay_terms`, `stay_rates`, `stay_blocks`, `bookings` (no two confirmed stays can overlap), `booking_events` (append-only) |
| `trust` | `review_cases` (listing reviews, agent applications, organization checks), `reports` |
| `platform` | `audit_events` (append-only), `notifications`, `notification_mutes`, `system_settings`, and the reference-ID generator |

A *property* is the physical place and a *listing* is one offer to sell, rent or let it as a PG.

**Reference IDs.** Every major record has a UUIDv7 key and a human-friendly, immutable reference such as
`PRP-7K4M9Q2X`: `USR`, `AGT`, `ADM`, `SADM`, `ORG`, `PRP`, `LST`, `PROJ`, `LEAD`, `VIS`, `VER`, `RPT`, `INV`, `CON`,
`DOC`. The database generates them from 40 random bits (Crockford base32), so they reveal nothing about order or
volume, and a trigger stops them ever changing. A reference ID identifies a record; it never grants access to it.
Sample rows carry `is_sample` / `source = 'sample'` so they can never be mistaken for real data. The full plan — properties, listings, PGs, CRM, verification and more — is in
[docs/database](docs/database/README.md), with ERDs and a phased migration plan.

**Changing the schema.** Edit a file in `lib/db/schema`, run `npm run db:generate`, **read the generated SQL** in
`db/migrations`, then run `npm run db:migrate`.

---

## Accounts and authentication

### Pages

| Route | Purpose |
| --- | --- |
| `/signup` | Create an account: name, email, password and an optional "I'm looking to" choice (Buy, Rent, Sell, Invest, PG) |
| `/check-email` | Shown after signing up, with an option to resend the confirmation link |
| `/login` | Log in, with "Keep me logged in on this device" |
| `/forgot-password` | Request a password reset link |
| `/reset-password` | Choose a new password from the emailed link |
| `/account/profile` | Signed-in users only. Your name, email, what you're looking for and when you joined. `/account` opens this page |
| `/account/bookmarks` | Signed-in users only. Your saved properties; un-saving removes the card |
| `/welcome` | Where email confirmation links land. Sends you to your profile, or to login with an explanation if the link expired |
| `/become-an-agent` | Signed-in customers apply to be agents; an admin reviews the application |
| `/invite/[token]` | Accept an admin or agent invitation (one-time link, valid 72 hours) |
| `/account/trips` | Your homestay requests and bookings; the address appears once a booking is confirmed |
| `/account/messages` | Your conversations with hosts, kept for good; ask a question before you book |
| `/become-a-host` | Apply to host guests in your home |
| `/workspaces` | Pick a workspace, for people who belong to more than one |
| `/dev/mailbox` | **Development only.** Captured emails. Returns 404 in production |

### How it works

- An account must **confirm its email** before it can log in. The confirmation link logs you straight in.
- Forms submit to **server actions** that validate input with Zod, apply rate limits, then call Better Auth.
- Sessions are stored in PostgreSQL and held in an **httpOnly, SameSite=Lax** cookie (Secure in production), valid
  for 7 days, refreshed daily.

### Security properties

Each of these is covered by an automated end-to-end test run against the real database:

- **Passwords are hashed** (scrypt) and stored only as hashes. Minimum 10 characters.
- **No account enumeration.** Signing up with a registered email shows the same "check your inbox" screen (and
  quietly warns the real owner by email). "Forgot password" gives the same reply whether or not the account exists. A
  wrong password never reveals whether the email is registered.
- **Reset and verification tokens are stored hashed**, expire (30 minutes for resets), and work once.
- **Resetting a password logs the account out everywhere else.**
- **Rate limiting** on log in, sign up, reset and resend — per IP address **and** per account, so an attacker rotating
  IP addresses is still stopped. Counters live in PostgreSQL, so limits hold across multiple servers.
- **No open redirects.** After log in, only same-site paths are followed.
- **Emails are case-insensitive** at the database level, so `Asha@x.com` and `asha@x.com` can never be two accounts.
- **A person's gender is never stored.** "PGs for Men / Women" is a search filter, and the database rejects
  gendered values outright.

---

## Browsing properties

The hero's **"I'm looking to…"** options open these pages. **Sell is not wired up yet** — sellers will register as
sellers before they can list, and that flow is still being planned.

| Route | Shows | Filters |
| --- | --- | --- |
| `/buy` | **A dedicated service.** Homes for sale, including new launches, and plots (Plot, Open plot). Its own header (All properties · Ready to move · New launches · Plots, then Buying guide · EMI calculator · Buying costs, with no links to other services), popular searches before anything is filtered, and its own footer, whose last row, "Other services", is the only way across. Listings for sale open inside Buy too, with links to the EMI calculator and buying costs pre-filled from the listing |
| `/buy/emi-calculator` | Home-loan EMI, total interest, a year-by-year schedule, and a warning when the down payment is below the RBI's loan-to-value limits. Inputs are kept in the URL, so a result can be shared |
| `/buy/costs` | Stamp duty, registration and GST (under construction only) for Hyderabad, Bengaluru, Mumbai, Pune and North Goa, plus brokerage and paperwork estimates, the all-in total, and the 1% TDS reminder from ₹50 lakh. Rates live in `lib/buy/costs.ts` with the date they were checked; **review them with a legal adviser before launch** |
| `/buy/guide` | The steps of buying, a documents checklist (every home, new projects, plots), RERA checks with the official state portals, area definitions with a unit converter, money matters and red flags | Search, city and locality, budget, bedrooms, property type, ready or under construction, amenities. Choosing a type opens its size range: **plot size in sq yd** for plots (as agents enter it), **carpet area in sq ft** for homes. Each range applies only to its own kind of property, and bedrooms/furnishing step aside when only plots are chosen |
| `/rent/move-in-costs` | The cash needed to move in (deposit, advance rent, brokerage, the agreement, moving) and what's refundable, the monthly outgo and the total over the agreement; flags TDS on rent above ₹50,000 a month and the landlord's PAN for HRA |
| `/rent/guide` | Renting step by step: what to put in the agreement (and when it must be registered), deposits, documents, police verification, moving in, rent and tax, red flags |
| `/pg/checklist` | A checklist for a PG visit (safety, the room, food, house rules, money, documents). Ticks are saved on the device; it prints |
| `/pg/compare` | A PG bed against a share of a rented flat: the monthly cost per person and the money up front |
| `/invest/yield-calculator` | Gross and net rental yield after empty months, the owner's costs and buying costs, with the years of rent to earn back what was paid |
| `/invest/guide` | Homes, commercial space, land and new launches compared; reading a yield; new-launch and commercial checks with the RERA portals; tax basics under the Income-tax Act, 2025; red flags |
| `/stays/split-cost` | What a home stay costs the group and each person: nights priced as bookings are (Friday and Saturday at the weekend price), the cleaning fee, and optional food and travel. Pre-filled from any stay's page |
| `/stays/guide` | How booking works on Trustbrick (requests, instant book, the address on confirmation, paying at the property), the three cancellation policies, before you book, checking in, during the stay, red flags, and a pointer for would-be hosts. The booking window and policies are read from the product's own rules |
| `/rent` | Homes for rent | Search, city and locality, monthly rent, bedrooms, property type, furnishing, available now, amenities |
| `/pg` | PGs and co-living, priced per bed | Search, city and locality, rent per bed, who it's for (men, women, co-living), room type, AC, attached bathroom, meals, food |
| `/invest` | New launches, commercial spaces and plots | Search, city and locality, budget, investment type, possession by, minimum declared rent yield |
| `/listings/[ref]` | One listing (by its `LST-` reference): photos, key facts, PG rooms and rules, project and RERA details, amenities, price history | — |

- **Filters live in the URL**, so any filtered view can be shared or bookmarked, and the pages work without
  JavaScript. On desktop the left sidebar applies changes immediately; on mobile, filters open in a full-screen panel.
- **Sort** by newest or price. **Show more** loads the next 12 using keyset pagination, so results never repeat or skip.
- **Bookmarks** save the property, not the listing, so a saved home stays saved if it is re-listed. Logged-out visitors
  are sent to log in and returned to the page afterwards.
- **Contact the agent** on any live listing (signed-in customers): the enquiry, optionally with a visit request,
  becomes a lead in the agent's workspace. Customers can also **report** a listing to the moderators.
- **Declared rent yield** on Invest is calculated only from rent the lister declares. It is not an estimate or a
  forecast, and properties without declared rent simply show no yield.
- Sample listing pages are marked `noindex`, and every page that shows sample data says so.

---

## Commission

Trustbrick's commission from partners (agents, brokerages and hosts). Payments happen between the parties today
(stays are paid at the property), so commission is a **receivable**: charges are recorded and collected by invoice.
When online payments arrive, a charge is kept back from the payment instead (`collection = 'gateway'`); the ledger
is the same either way. Tables are in the `finance` schema (`lib/db/schema/finance.ts`).

- **Rates** are per service. The SuperAdmin sets a default in **Platform settings** (sales, rentals and leases: 20%
  of the agent's brokerage; PGs: 10% of the first month's rent per tenant; stays: 10% of each booking, as starting
  values), plus the **GST** rate added on top (18% to start; set 0 if not GST-registered). Admins with
  `commission.manage` give a partner **their own rate** from the agent, host or organization page, with a reason;
  rates belong to the organization (an independent agent's or host's own one, or the brokerage). Rate rows are never
  changed, so the full history is kept.
- **Acceptance.** A partner accepts the rates in force from their **Commission** page (`/commission`) before they can
  submit listings: the broker admin for a brokerage, or the agent or host for their own. If a rate for a service they
  offer changes, they accept again.
- **Charges.** *Mark as sold / rented out / leased* asks how it closed: **I closed the deal** (final price and
  brokerage earned; the commission and GST are shown before confirming and recorded at that day's rate), **someone
  else closed it**, or **taken off the market** (no commission; listed for the team to review). A stay is charged
  once, when the guest checks in. PG move-ins and corrections are added by the team as adjustments (negative for a
  credit). Amounts are fixed by a database trigger; only the status moves.
- **Collecting.** `/commissions` (team) shows what's due, overdue (30 days) and collected this month; record a
  payment with its bank or UPI reference, or waive a charge with a reason. Partners see their own charges, totals
  and status on `/commission`.

---

## Legal Verification

A service without listings, in the landing page's **Our Services** menu ("Legal opinions & Documents for
Verification") and as a dedicated service with its own header and footer (Overview · Apply · Your requests, then
Documents guide).

| Route | What it does |
| --- | --- |
| `/legal-verification` | The four services (document verification, title search and legal opinion, complete due diligence, agreement review), what each covers, what you get and the usual time; how it works; questions |
| `/legal-verification/apply` | The application: service, the property (kind, purpose, state, locality, an optional `LST-` listing), the documents the applicant has, and contact details with consent to share them with an advocate. Anyone may apply; `?service=` and `?listing=` pre-fill it, and every live sale and investment listing links here |
| `/legal-verification/requests` | A signed-in applicant's requests and how far along each is |
| `/legal-verification/documents` | What an advocate checks: documents for every property, the state records for Telangana, Karnataka, Maharashtra and Goa, new projects, plots, red flags, and the official portals |
| `/legal-requests` (workspace) | The team's queue (`support.view`; moving requests needs `support.manage`): New → Contacted → With the advocate → Completed, or Closed with a reason. Each change is audited and shown to the applicant |

- **Nothing is uploaded and nothing is charged online.** The team calls the applicant to agree the scope and the fee;
  documents go to the advocate who takes the request on. Requests are rate-limited per IP and per email.
- **Trustbrick doesn't give the opinion itself.** Reports are the advocates' own; the page says so. Before launch,
  settle the advocate panel and their terms, the fees, and whether you'll promise a call-back time.

---

## Homestays

Hosts list a whole home or a private room by the night, and guests book it, like Airbnb. The full design is in
[docs/stays](docs/stays/README.md).

- **Guests** search **`/stays`** by check-in and check-out, guests, type of place, instant book and pets. On a stay's
  page, the booking panel shows a calendar with taken nights struck through and the exact price night by night (weekday,
  weekend, festival rates, cleaning fee). They **request to book** (the host has 24 hours to accept) or **book
  now** on instant-book stays, and **pay the host at the property**; Trustbrick charges nothing yet. Trips are at
  `/account/trips`. The street address and the host's phone are revealed only once the booking is confirmed.
  Before booking, they can **message the host** from the stay's page; conversations live at `/account/messages` and are
  kept, so a returning guest sees everything said before.
- **Hosts** apply at `/become-a-host`. An admin checks their identity and approves them, then they list homes (homestays
  only) through the usual onboarding, with a "Price & house rules" step. Their workspace has **Bookings** (accept,
  decline, check in, cancel with a reason), **Messages** (reply to guests, live, with unread badges) and a **Calendar**
  (close dates, set festival prices). Agents can host stays
  too.
- **Admins** approve and verify hosts under **Hosts**, review stay listings in the normal queue, see every booking, and
  can cancel one on Trustbrick's behalf.
- **No double bookings**: the database itself refuses two confirmed stays on the same nights, and accepting a request
  automatically declines the others for those dates.

Not built yet: online payments and payouts, reviews, host–guest messaging, and calendar sync with Airbnb and Booking.com.

---

## Workspaces: Agent, Admin and SuperAdmin

One platform, several experiences. What someone sees is decided **on the server** from their session and live
memberships, never from the URL: there is no `/admin`, `/sa` or `/agent` path. Everyone signs in at `/login` and lands
on `/dashboard`; an agent sees their properties and leads there, an admin sees the platform. Someone with more than
one workspace picks one at `/workspaces`.

The full design — roles, the permission matrix, the listing lifecycle, reference IDs, migrations and the security
model — is in [docs/portals](docs/portals/README.md).

### Who can do what

| Role | Gets | Scope |
| --- | --- | --- |
| **SuperAdmin** | Creates admins, sets their permissions, suspends them, and changes platform settings. Sees every dashboard, list and record, but doesn't create organizations or agents, moderate or suspend people: that's admin work. Created only with `npm run admin:bootstrap`. | Whole platform |
| **Admin** | Exactly the permissions a SuperAdmin grants, starting from a preset: Operations (people, organizations, agents, listings), Moderation or Support (read-only). Only admins onboard organizations and create agents. | Whole platform |
| **Agent** | Onboard properties; their listings, leads, contacts, visits and performance | Their own work |
| **Team lead** | Same pages as an agent | Their team's work |
| **Broker admin** | Same pages, plus the organization's agents | The whole brokerage |
| **Host** | List homes as homestays only; their bookings and calendar. Approved at `/become-a-host`. | Their own stays |
| **Customer** | The public site, bookmarks, enquiries, visit requests, reports and homestay bookings | Themselves |

Developer admin, property manager, landlord, vendor and investor exist as role templates and use the same
professional workspace; they have no self-service signup yet.

### The main flows

1. **Creating agents.** An admin adds an agent at `/agents/new` (or from an organization's page): details, the
   organization they work for (or independent), agent or broker admin, and whether they're verified. The agent gets
   an email link, sets a password, and lands in their workspace. Customers can also apply at `/become-an-agent`; an
   admin approves (optionally marking them verified) or rejects with a reason.
2. **Onboarding a property.** *Onboard property* asks for the purpose (sell, rent, lease, PG), category, type and
   location, and creates a **draft** straight away (`PRP-` property, `LST-` listing). Details, pricing, amenities,
   photos, floor plans, videos and private documents are then filled in step by step, saved as you go. Only fields
   relevant to the property type are asked for. It works on a phone, including "use my current location".
   - **Location** is only where the property is. The map pin comes from a pasted **Google Maps or Apple Maps link**
     (short `maps.app.goo.gl` / `maps.apple/p` links are followed on the server, to Google and Apple hosts only),
     shown on a small map to confirm; without one, the locality's centre is used and marked approximate.
   - **Details** hold the flat or unit number (private, used to spot duplicates). Titles are at most 50 characters.
     Year built, floor, total floors, facing (homes) and ownership are required; older drafts missing them are
     flagged before submission.
   - **Pricing:** the brokerage amount and "Brokerage is negotiable" appear only for a choice that has them. Choices
     include *Half a month's rent* and *Months of rent* (rentals only) and *Flexible amount*.
   - **Amenities:** besides the standard list, agents can **Add** up to 20 of their own. One matching a standard
     amenity ticks that one instead, so it stays searchable. Customers see the others as written.
   - **Review & submit** previews the whole listing box by box, each with an Edit link; the property page after
     submitting, and the admin's approval page, use the same layout: photos and videos, location with a map,
     amenities, details, pricing.
3. **Approval.** Submitting checks for missing information and possible duplicates (same type within 30 m, same unit,
   near-identical address, identical photo). The listing then shows **Waiting for approval** and appears under
   **Approvals** in the admin sidebar. An admin approves and publishes it, asks for changes or rejects it, and must
   give a remark (at least 10 characters) either way. The agent sees the remark on the listing and in their
   notification. Approved listings appear on `/buy`,
   `/rent`, `/pg` or `/invest` immediately, alongside everything else. Approval is always mandatory: no listing,
   whoever lists it, goes live without an admin's decision.
4. **Leads and visits.** A customer's enquiry or visit request becomes a lead for the listing's agent, who moves it
   through the pipeline (new → contacted → qualified → visit scheduled → negotiation → converted or lost) and confirms
   visit times; the customer is notified.
5. **Oversight.** Admins manage users, agents and organizations (suspend, reinstate, verify, archive — never
   hard-delete), resolve reports, and find anything by reference ID. Suspending a user, an agent or an organization
   takes their live listings off the marketplace; reinstating puts them back.

### Workspace pages

| URL | Who |
| --- | --- |
| `/dashboard` | Everyone with a workspace: platform overview, or the agent's own dashboard, with date ranges |
| `/properties`, `/properties/new`, `/properties/[ref]`, `/properties/[ref]/edit` | Agents (their scope); admins (everything) |
| `/approvals`, `/approvals/[ref]` | Admins who review listings, agent applications or organizations |
| `/reports` | Admins who handle listing reports |
| `/leads`, `/leads/[ref]`, `/contacts`, `/visits` | Agents (their scope); admins (read-only) |
| `/analytics` | Platform analytics, or the agent's per-listing performance |
| `/users`, `/agents`, `/organizations` and their `[ref]` pages | Admins with the matching permission; the SuperAdmin (read-only); broker admins see their own agents |
| **View** (Action column on Properties & listings) | A pop-up card with everything about the listing (photos, details, price and terms, location, rooms, amenities, stats, price and status history) and an **Edit** tab: price, deposit, maintenance, available-from, PG rent and free beds, an **offer** shown to customers, and **Mark as sold / rented out / full** or **available again**. Live listings change straight away without another review; every change is audited and price changes enter the price history. Agents edit their own listings; admins with listing-management rights edit any; the SuperAdmin only views |
| **View** (Action column on Users, Agents, Organizations) | A pop-up card with everything about that person or organization: contact details, roles, enquiries by market (buy, invest, rent, lease, PG) and deals closed, visits, saved properties and reports; or an agent's or organization's listings, leads, visits and members. Details follow the viewer's permissions |
| `/agents/new`, `/organizations/new` | Admins with permission to create agents or organizations (not the SuperAdmin) |
| `/admins`, `/admins/invite`, `/admins/[ref]` | SuperAdmin |
| `/audit`, `/system`, `/search` | Admins with audit, settings or platform permissions |
| `/bookings`, `/bookings/[ref]`, `/calendar` | Hosts and agents with stays (their own); admins (all bookings) |
| `/messages`, `/messages/[ref]` | Hosts and agents with stays: guests' conversations |
| `/conversations`, `/conversations/[ref]` | Admins with `conversations.view`: read a guest–host conversation for a dispute (reason required, logged in the audit log) |
| `/hosts`, `/hosts/[ref]` | Admins who approve and verify hosts |
| `/notifications`, `/profile` | Everyone with a workspace |

### Security, briefly

- Every page and action checks permission **and scope** on the server. Hidden buttons are a courtesy, not a control.
- Scope is part of the database query, so another agent's `LST-…` or `LEAD-…` is simply "not found".
- Inputs are validated with Zod; status, owner, organization and agent are never taken from the request.
- Inviting admins, changing their permissions, suspending them and changing platform settings need the SuperAdmin's
  **password again**, and suspending an admin also needs their reference typed out.
- Suspended accounts are logged out everywhere and can't log back in.
- Every consequential action is written to `platform.audit_events`, which the database refuses to change or delete.
- Uploads are checked by their bytes, not their name; photos are re-encoded (removing EXIF and GPS); documents are
  private to the people who can see the listing.

---

## Testing

```bash
npm run test
```

Runs the integration tests (Vitest) against a real database, `trustbrick_test`, which is dropped, recreated, migrated
and reference-seeded on every run. The development database is never touched; Docker must be running. They cover
permission resolution, reference IDs, the listing lifecycle end to end and publishing into the marketplace,
suspensions, admin and agent invitations, who may create what, permission changes, dashboard figures checked against independent counts, uploads,
the lead pipeline, homestays (pricing, overlapping bookings, expiry, cancellations, host approval), append-only tables,
and **IDOR**: another agent guessing a reference gets "not found" everywhere.

---

## Project structure

```
TrustBrick v2/
├── app/
│   ├── (auth)/                 Sign up, log in, check email, forgot and reset password, plus server actions
│   ├── (browse)/               Buy, Rent, PG and Invest pages, listing detail, bookmarks, enquiries and reports
│   ├── (workspace)/            Every Agent / Admin / SuperAdmin page (the group name never appears in a URL)
│   ├── workspaces/             Workspace chooser for people with several memberships
│   ├── become-an-agent/        Agent application
│   ├── invite/[token]/         Accept an admin or agent invitation
│   ├── media/[...key]/         Serves uploaded media (documents only to authorized viewers)
│   ├── api/listings/…/media/   Upload endpoint
│   ├── forbidden.tsx           403 page
│   ├── account/                Signed-in account area: profile and bookmarks
│   ├── welcome/                Redirect target for email confirmation links
│   ├── api/auth/[...all]/      Better Auth HTTP endpoints
│   ├── dev/mailbox/            Development-only captured emails
│   ├── layout.tsx              Root layout: fonts, SEO metadata, viewport
│   ├── page.tsx                Page composition (the order of sections)
│   ├── globals.css             Design tokens, utilities, animations, reduced-motion rules
│   ├── icon.svg                Favicon (Trustbrick shield mark)
│   ├── opengraph-image.tsx     Generated social sharing image (1200×630)
│   ├── robots.ts               /robots.txt
│   └── sitemap.ts              /sitemap.xml
├── components/
│   ├── account/                Account area navigation
│   ├── auth/                   Form fields and forms for the account pages
│   ├── brand/                  LogoMark, wordmark and full LogoLockup
│   ├── buttons/                ButtonLink and Arrow
│   ├── footer/                 SiteFooter
│   ├── hero/                   Hero and IntentSelector (Buy / Rent / Sell / Invest / PGs)
│   ├── listings/               Listing cards, filter sidebar, sort, results, bookmark button
│   ├── motion/                 MotionController (scroll reveals and parallax)
│   ├── navigation/             SiteHeader (landing page), AppHeader (inner pages), UserMenu
│   ├── sections/               Idea, Paths, Intelligence, Ecosystem, Future, FinalCta
│   ├── typography/             SectionLabel and Lines (masked headline reveals)
│   ├── visualizations/         Score, Passport, Value and Neighborhood mockups; BrickBond wall
│   └── workspace/              App shell, tables, stat cards, charts, forms, onboarding wizard, reference IDs
├── lib/
│   ├── auth/                   Better Auth config, sessions, rate limiting, shared form types
│   ├── authz/                  Permission catalogue, actor resolution, scope predicates, session guards
│   ├── stays/                  Homestay labels, booking lifecycle, stay terms
│   ├── services/               Domain services: listings, moderation, agents, organizations, users, admins, stays,
│   │                           CRM, reports, dashboards, search, audit, notifications, media, settings
│   ├── storage/                Object-storage driver and upload type checks
│   ├── workspace/              Permission-aware navigation
│   ├── reference.ts            Reference-ID formats and parsing
│   ├── db/                     Database client and Drizzle schemas
│   ├── email/                  Email sending and templates
│   ├── listings/               Filter parsing, listing queries, display helpers
│   ├── format.ts               Indian price (₹ L / Cr), area and date formatting
│   ├── env.ts                  Validated environment variables
│   ├── intents.ts              The Buy / Rent / Sell / Invest / PG vocabulary, shared everywhere
│   ├── site.ts                 Brand names, SEO copy, navigation and link destinations
│   └── images.ts               Image manifest: file imports and alt text
├── db/
│   ├── init/                   Runs once when the database is created: roles and extensions
│   ├── migrations/             SQL migrations (generated, then reviewed)
│   └── seed/                   Reference data, sample listings, development workspace accounts
├── docs/database/              Database architecture: decisions, ERDs, tables, migration plan
├── docs/portals/               Workspaces: architecture, permissions, lifecycle, security
├── docs/stays/                 Homestays: hosts, bookings, calendar, privacy
├── tests/                      Integration tests (Vitest) against a throwaway database
├── public/images/
│   ├── hero/                   Hero photography
│   ├── architecture/           Architectural and city photography
│   ├── properties/             Homes and interiors
│   └── brand/                  Brand assets (logo masters go here)
├── scripts/
│   ├── optimize-images.mjs     Image normalisation script (sharp)
│   └── admin-bootstrap.mjs     Makes an existing account the first SuperAdmin
├── docker-compose.yml          Local PostgreSQL + PostGIS
├── drizzle.config.ts           Migration tooling config
├── .env.example                Required environment variables, without secrets
├── eslint.config.mjs
├── next.config.ts              Image formats, sizes and caching
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

---

## Design system

**Direction:** luxury real estate, modern fintech and premium technology. Editorial, spacious and restrained.

**Colour.** All colours are CSS variables in `app/globals.css`, exposed to Tailwind through `@theme inline`, so
classes like `bg-ivory` and `text-ink` work. The names are **roles**, not literal colours: each theme gives them
its own values, and everything built from them follows.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ivory` | `#f2eee6` | `#12151b` | The page |
| `--paper` | `#f8f6f1` | `#191d25` | A raised surface: panels, form fields |
| `--card` | `#ffffff` | `#1e232c` | The surface above that: cards, chat bubbles |
| `--sand` | `#e4ddd0` | `#262c36` | Subtle fills, image placeholders |
| `--ink` | `#0d1119` | `#f3f1ec` | Primary text (and inverted accents: selected chips, primary buttons) |
| `--graphite` | `#3b404b` | `#cbd0d8` | Body text |
| `--stone-deep` | `#6b655a` | `#a2a9b4` | Secondary text |
| `--contrast` / `--on-contrast` | `#0d1119` / `#f8f6f1` | `#0a0c11` / `#f3f1ec` | A block that deliberately opposes the page: the hero, the footer, the mobile menu. Dark in **both** themes |
| `--brick` / `--brick-bright` | `#b0502c` / `#de6a3d` | `#d2653c` / `#e8815a` | The single accent, taken from the logo |
| `--sage` / `--sage-deep` | `#4f7a58` / `#3b5f44` | `#7fb08a` / `#9ecfa9` | "Verified" signals; `--sage-deep` is the text on a sage tint |
| `--navy` | `#0b1c48` | `#0b1c48` | The logo's arch. Never themed |

**Dedicated services.** Buy, Rent, PGs, Home Stay and Invest are each a dedicated service: once you're in one,
everything is about it. Each has an entry in `SERVICE_SHELLS` (`lib/listings/services.ts`) with its own sections
(Rent: All rentals · Available now · Furnished · Apartments · Houses and villas; PGs: All PGs · For men · For women ·
Co-living; Home Stay: All home stays · Entire homes · Private rooms · Instant book, plus Stay guide · Split the cost · Your trips ·
Messages · Host your home; Invest: All investments · New launches · Commercial · Plots and land; Buy: see above), its quick searches and a
footer line. `ServicePage` wraps a page in `ServiceHeader` (the service's name and a row of its sections and tools,
never another service) and `ServiceFooter` (whose last row, "Other services", is the only way across). Listing pages
open inside their own service (`kindOf`: plots → Buy, other land and commercial → Invest), and `/become-a-host`, Trips (`/account/trips`) and Messages (`/account/messages`) sit
inside Home Stay. Those two keep their `/account` addresses, which emails link to: they live in the `app/account/(home-stay)` route
group, while Profile and Bookmarks stay in `app/account/(account)` with the account sidebar. The home page is where people choose a service. On phones the header's theme switch moves to the
service footer's picker so the service name and the account fit, down to 320px.

**Themes.** Light is the default; dark follows the reader's device until they choose. A choice is written to
`data-theme` on `<html>` and remembered in `localStorage`, which a small script in the root layout replays before
the first paint, so nothing flashes and the landing page stays statically rendered. Without a choice, CSS alone
answers `prefers-color-scheme`, so there is no JavaScript in the way.

- **Controls:** `ThemeToggle` (a `role="switch"` light ⇄ dark, in the headers) and `ThemeChoicePicker`
  (Light / System / Dark, in the mobile menu and the footer). Both live in `components/theme/`, share
  `components/theme/theme.ts`, and stay in step with each other, with other tabs and with the device.
- **The knob's position is CSS**, not state, so the switch is already right on the first paint.
- **Adding a colour:** add a light value (`--l-…`) and a dark one (`--d-…`) at the top of `globals.css`, then map
  the role in the three blocks below. Never hard-code a hex in a component.
- **The workspace is pinned to light** by the `theme-light` class on its shell, until it gets its own dark pass.
  Everything public — landing, browse, listings, stays, about, contact, the account area and the auth pages — is
  themed.

**Typography.**

- **Instrument Serif:** large display headlines (the `display` utility).
- **Geist:** interface and body text.
- **Geist Mono:** small uppercase labels (the `eyebrow` utility).

**Layout.** The `shell` utility gives a centred container (max 1600px) with fluid side gutters. Sections use a
12-column grid on desktop and recompose into single columns on mobile.

---

## Motion, accessibility and performance

**Motion**

- The hero entrance (image reveal, headline line rises, staggered copy) is pure CSS. It is held until the hero
  photograph has decoded and the display font is ready, so the sequence plays as one piece instead of animating
  against an empty frame and then jumping as the serif swaps in. The wait is capped at 900ms, and without
  JavaScript nothing is held back at all (see `components/hero/HeroMedia.tsx`).
- Scroll reveals and parallax are opt-in data attributes handled by `components/motion/MotionController.tsx`:
  - `data-reveal` — fade and rise when the element enters view
  - `data-reveal="lines"` — masked headline lines
  - `data-reveal="image"` — image reveal
  - `data-parallax="0.12"` — moves at a fraction of the scroll speed
- Content is only hidden for reveal animations once JavaScript is confirmed to be running, so the page is still readable without it.

**Accessibility**

- Semantic landmarks, one `h1`, and a logical `h2` per section.
- A "Skip to content" link, visible focus outlines and full keyboard support.
- The mobile menu traps focus, closes with Escape and returns focus to the menu button.
- The Intelligence previews follow the ARIA tabs pattern and support arrow, Home and End keys.
- Every meaningful image has alt text.
- `prefers-reduced-motion` switches off parallax, reveal transitions, the brick-wall light and the automatic tab rotation.

**Performance** (measured on a local production build)

- Cumulative Layout Shift: **0**.
- Largest Contentful Paint: about 1.4s on desktop and 0.6s on mobile. The small delay comes from the headline's entrance animation.
- The hero image is about 48 KB as AVIF. Images below the fold are lazy-loaded with responsive sizes.
- The landing page is prerendered as static HTML; checking whether you are logged in happens in the browser, so it stays static.

---

## Customizing the site

**Replace a photograph**

1. Overwrite the file in `public/images/...` using the **same file name**. Any size or aspect ratio works; layouts crop automatically.
2. Run `npm run images:optimize`.
3. Update the alt text in `lib/images.ts` if the subject changed.

**Add a new image:** place the file in the right folder under `public/images/`, import it in `lib/images.ts`, and use it
through the `images` object.

**Change links:** Talk to Trustbrick, Privacy and Terms currently point to on-page anchors. Update `links` in
`lib/site.ts` once the real pages exist. Log in, Sign up and Get Started lead to the account pages. Navigation items are set in `primaryNav` and `footerNav` in the same file.

**Change SEO copy:** edit `title`, `description` and `tagline` in `lib/site.ts`.

**Change colours or fonts:** edit the tokens in `app/globals.css` (a light and a dark value for each colour; see
Design system) and the font imports in `app/layout.tsx`.

**Replace the logo:** the shield mark is a hand-drawn vector in `components/brand/Logo.tsx` and `app/icon.svg`, and the
full stacked lockup (mark, wordmark, tagline) used in the footer is `components/brand/LogoLockup.tsx`. Drop the master
artwork into `public/images/brand/` and swap it in there when it's available.

**Reorder or remove sections:** edit `app/page.tsx`.

---

## Deployment

The site now needs a Node.js server and a PostgreSQL database.

- **Vercel:** import the repository and set every variable from [Environment variables](#environment-variables).
- **Any Node.js host:** run `npm install`, then `npm run build`, then `npm run start`, behind your reverse proxy.
- **Database:** any managed PostgreSQL that supports PostGIS (Neon, Supabase and AWS RDS do). Enable the extensions
  from `db/init` and create the two roles, then run `npm run db:migrate` and `npm run db:seed:reference` as part of
  each deploy (the reference seed keeps permissions and roles in sync with the code).

**Before going live, these are required, not optional:**

1. **Connect an email provider.** Without one, confirmation and reset emails are logged as an error and never
   delivered, so nobody can finish signing up. Add it in `lib/email/send.ts`.
2. **Serve over HTTPS**, so session cookies are marked Secure.
3. **Make your proxy overwrite `X-Forwarded-For`.** Rate limits per IP trust this header. If the proxy passes a
   client's own value through, an attacker can spoof it. (Per-account limits still hold either way.)
4. **Generate a fresh `BETTER_AUTH_SECRET`** for production. Never reuse the development one.
5. **Configure storage for uploads.** Set `STORAGE_LOCAL_DIR` to a persistent volume (single server), or add an
   S3-compatible driver in `lib/storage` (several servers).
6. **Create the first SuperAdmin** from a trusted shell: sign up normally, confirm the email, then run
   `npm run admin:bootstrap -- --email you@company.com`. Invite every other admin from `/admins`; admins then onboard
   organizations and agents.
7. **Never run `db:seed:sample` or `db:seed:dev` in production.** Both refuse to.

The build needs internet access so that `next/font` can fetch the Google Fonts.

---

## Troubleshooting

| Problem | Solution |
| --- | --- |
| `Port 3000 is in use` | Stop the other process, or run `npx next dev -p 3001`. |
| `npm warn EBADENGINE` during install | Harmless on Node 23. Switch to Node 22 LTS or 24 to remove it. |
| Build fails while downloading fonts | Check your internet connection or proxy. `next/font` fetches fonts at build time. |
| Images look unchanged after replacing a file | Restart the dev server and hard-refresh the browser (`Ctrl + Shift + R`). |
| `sharp` install errors | Delete `node_modules` and `package-lock.json`, then run `npm install` again on a supported Node version. |
| Command fails with a path error | Wrap the project path in quotes, because the folder name contains a space. |
| `failed to connect to the docker API` | Docker Desktop is not running. Start it, wait until it says the engine is running, then `npm run db:up` again. |
| `port is already allocated` on `db:up` | Something else uses port 5434. Set `TRUSTBRICK_DB_PORT` to a free port, and update the port in both URLs in `.env.local`. |
| `Invalid environment configuration` | A required variable is missing or malformed. The message names it; compare `.env.local` with `.env.example`. |
| `permission denied for schema identity` | Migrations have not run. Run `npm run db:migrate`. |
| Confirmation or reset email never arrives (development) | Emails are not sent in development. Open http://localhost:3000/dev/mailbox. It empties when the dev server restarts. |
| "Too many attempts" while testing | Rate limits are working. Wait for the time shown, or clear rows in `identity.rate_limits` whose key starts with `action:`. Wrong passwords on SuperAdmin confirmations count too. |
| A workspace page says you don't have access | That account's role doesn't include the page. Log in as another development account, or grant the admin that permission from `/admins`. |
| `/dashboard` sends me to my profile | The account has no workspace (it's a customer). Apply at `/become-an-agent`, or log in as a development agent. |
| Photos fail to upload or show in production | Set `STORAGE_LOCAL_DIR` to a persistent folder. See [Deployment](#deployment). |
| `npm run test` can't connect | Docker must be running. The tests create `trustbrick_test` as the `postgres` superuser; `TEST_DATABASE_SUPERUSER_URL` overrides it. |
| Changed `db/init` but nothing happened | Init scripts run only when the database volume is first created. Recreating it with `docker compose down -v` **permanently deletes all local data**. |

---

## Known limitations

- Get Started, Talk to Trustbrick, Privacy and Terms are placeholders until those pages exist.
- Social media links are intentionally omitted until official accounts are announced.
- The Intelligence mockups use hard-coded sample data. They do not describe real properties or live features.
- The social sharing image uses a sans-serif font rather than Instrument Serif.
- The site has been checked in Chromium-based browsers. Test in Safari and Firefox, and on real devices, before launch.
- **No email provider is connected yet**, so accounts can only be confirmed in local development. See [Deployment](#deployment).
- Email and password only for now. Google sign-in, phone OTP, editing your profile, changing your password while
  logged in, and deleting your account are not built yet.
- **Per-account lockout is a deliberate trade-off.** Someone who knows your email can trigger the per-account limit and
  block logins to it for up to 15 minutes. That is the cost of stopping password-guessing from many IP addresses.
- **Listings in development are sample data.** Agents list properties through the Agent portal; owners and sellers
  can't list their own yet (the seller flow is still being planned). Saved searches aren't built.
- Messaging, tasks, transactions, payments and revenue aren't built, so dashboards leave them out rather than showing
  zeros. Listing shares aren't tracked.
- Teams have no management screens yet (teams exist in the database and team scope works). Broker admins can't add
  agents themselves; an admin adds them (or agents apply naming the brokerage's `ORG-` reference). Organizations
  are created by admins.
- Uploaded media is stored on local disk; an S3-compatible driver is needed for multi-server deployments. Videos
  aren't transcoded.
- PostgreSQL row-level security isn't switched on yet: isolation is enforced in every service query and covered by the
  IDOR tests. See [docs/portals](docs/portals/README.md).
- No map or radius search yet, although addresses are stored as PostGIS points ready for it.
- Sample listings reuse the site's photography, so several listings share the same photos.

---

## Photo credits

All photographs are from Unsplash under the [Unsplash License](https://unsplash.com/license). Attribution is not
required and is given here as a courtesy.

| File | Photographer | Source |
| --- | --- | --- |
| `hero/hero-skyline-dusk.jpg` (cropped) | Harsadh Vikhaas Rajesh Kumar | unsplash.com/photos/k5WixwAVMSE |
| `architecture/city-night.jpg` | Abizer Shihorwala | unsplash.com/photos/r2xCWsTqVz8 |
| `architecture/concrete-curve.jpg` | Jonny James | unsplash.com/photos/ulFAi1jkNcA |
| `architecture/modernist-facade.jpg` | Rushikesh Sonkusale | unsplash.com/photos/cVFl8N57dt4 |
| `architecture/construction-dusk.jpg` | Samuel Regan-Asante | unsplash.com/photos/g9A2llpDObU |
| `architecture/city-aerial-dusk.jpg` | Priyansh Patidar | unsplash.com/photos/XVyrHtQdNlk |
| `properties/home-sunlit-interior.jpg` | Danilo Rios | unsplash.com/photos/AgK_XAqSbfk |
| `properties/residence-dusk.jpg` | islam allam | unsplash.com/photos/BIoLZTSra78 |

---

© Trustbrick Realty and Fintech Company Pvt. Ltd. All rights reserved.

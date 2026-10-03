// DEVELOPMENT accounts and workspace data for the Admin, SuperAdmin and Agent portals.
//
// Everything here is fake and flagged: accounts use the reserved @trustbrick.test domain,
// organizations are "Sample …" with is_sample = true, and every listing is a sample listing,
// badged in the UI. Re-running replaces the data but keeps the accounts, because the audit
// trail is append-only and must not be rewritten.
//
//   npm run db:seed:dev
//
// All accounts share one password: DEV_SEED_PASSWORD, or "trustbrick-dev-2026" by default.
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { ADMIN_PRESETS } from "../../lib/authz/catalog.ts";
import { seedReference } from "./reference.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {}

// ── Safety: never in production, never against a remote database by accident ──
const url = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed development accounts with NODE_ENV=production.");
  process.exit(1);
}
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(host) && !process.argv.includes("--allow-remote")) {
  console.error(`Refusing to seed development accounts into non-local database host "${host}".`);
  process.exit(1);
}

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "trustbrick-dev-2026";
const DOMAIN = "trustbrick.test";
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days, hours = 0) => new Date(NOW - days * DAY - hours * 3_600_000);
const ahead = (days, hour = 11) => {
  const d = new Date(NOW + days * DAY);
  return new Date(`${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+05:30`);
};

const ACCOUNTS = {
  superadmin: { name: "Sana Kapoor", email: `superadmin@${DOMAIN}` },
  opsAdmin: { name: "Dev Malhotra", email: `ops.admin@${DOMAIN}` },
  moderator: { name: "Irfan Qureshi", email: `moderator@${DOMAIN}` },
  broker: { name: "Meera Iyer", email: `broker.meera@${DOMAIN}` },
  teamLead: { name: "Arjun Rao", email: `agent.arjun@${DOMAIN}` },
  agent: { name: "Priya Nair", email: `agent.priya@${DOMAIN}` },
  independent: { name: "Kabir Sethi", email: `agent.kabir@${DOMAIN}` },
  suspendedAgent: { name: "Rohan Deshmukh", email: `agent.rohan@${DOMAIN}` },
  applicant: { name: "Nisha Verma", email: `agent.nisha@${DOMAIN}` },
  customer1: { name: "Ananya Gupta", email: `customer.ananya@${DOMAIN}` },
  customer2: { name: "Vikram Shah", email: `customer.vikram@${DOMAIN}` },
  customer3: { name: "Zoya Khan", email: `customer.zoya@${DOMAIN}` },
  host: { name: "Rahul Menon", email: `host.rahul@${DOMAIN}` },
  hostApplicant: { name: "Sneha Kulkarni", email: `host.sneha@${DOMAIN}` },
};

const client = new pg.Client({ connectionString: url });
await client.connect();
const q = (text, params) => client.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];

try {
  await q("BEGIN");
  await seedReference(client);

  // ── Accounts: upserted, never deleted ─────────────────────────────────────
  const hash = await hashPassword(PASSWORD);
  const id = {};
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    const row = await one(
      `INSERT INTO identity.users (id, name, email, email_verified, status) VALUES ($1, $2, $3, true, 'active')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, email_verified = true, status = 'active', status_reason = NULL, updated_at = now()
       RETURNING id, reference_id`,
      [uuidv7(), a.name, a.email],
    );
    id[key] = row.id;
    await q(`DELETE FROM identity.accounts WHERE user_id = $1 AND provider_id = 'credential'`, [row.id]);
    await q(`INSERT INTO identity.accounts (id, user_id, provider_id, account_id, password) VALUES ($1, $2::uuid, 'credential', $2::text, $3)`, [uuidv7(), row.id, hash]);
  }
  const devUsers = Object.values(id);

  // ── Organizations: upserted by slug ────────────────────────────────────────
  const city = Object.fromEntries((await q(`SELECT slug, id FROM geography.places WHERE place_type = 'city'`)).rows.map((r) => [r.slug, r.id]));
  const org = {};
  for (const [key, name, slug, type, status, verification, citySlug] of [
    ["skyline", "Sample Skyline Realty", "dev-skyline-realty", "brokerage", "active", "verified", "hyderabad"],
    ["harbour", "Sample Harbour Homes", "dev-harbour-homes", "brokerage", "active", "unverified", "pune"],
    ["crestline", "Sample Crestline Developers", "dev-crestline-developers", "developer", "pending", "pending", "bengaluru"],
    ["kabir", "Kabir Sethi (independent)", "dev-kabir-sethi", "personal", "active", "unverified", "bengaluru"],
    ["rahul", "Rahul Menon (host)", "dev-rahul-menon", "personal", "active", "unverified", "north_goa"],
  ]) {
    const row = await one(
      `INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, is_sample, city_place_id, contact_email, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, verification_status = EXCLUDED.verification_status,
                                        status_reason = NULL, is_sample = true, updated_at = now()
       RETURNING id, reference_id`,
      [name, slug, type, status, verification, city[citySlug], type === "personal" ? null : `hello@${slug.replace("dev-", "")}.${DOMAIN}`, id.opsAdmin],
    );
    org[key] = row;
  }
  const internal = await one(`SELECT id FROM orgs.organizations WHERE org_type = 'internal'`);
  const devOrgIds = Object.values(org).map((o) => o.id);

  // ── Clear the previous run's workspace data (accounts and organizations stay) ─
  const { rows: oldAddresses } = await q(`SELECT address_id AS id FROM real_estate.properties WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM platform.notifications WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM crm.visits WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM crm.leads WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM crm.contacts WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM trust.review_cases WHERE organization_id = ANY($1::uuid[])
             OR agent_profile_id IN (SELECT id FROM orgs.agent_profiles WHERE user_id = ANY($2::uuid[]))`, [devOrgIds, devUsers]);
  await q(`DELETE FROM stays.conversations WHERE organization_id = ANY($1::uuid[]) OR guest_user_id = ANY($2::uuid[])`, [devOrgIds, devUsers]);
  await q(`DELETE FROM stays.bookings WHERE organization_id = ANY($1::uuid[]) OR guest_user_id = ANY($2::uuid[])`, [devOrgIds, devUsers]);
  await q(`DELETE FROM marketplace.listings WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM real_estate.properties WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  if (oldAddresses.length) await q(`DELETE FROM geography.addresses WHERE id = ANY($1::uuid[])`, [oldAddresses.map((r) => r.id)]);
  await q(`DELETE FROM trust.reports WHERE reporter_user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM marketplace.saved_properties WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM orgs.admin_invitations WHERE email LIKE $1 OR invited_by = ANY($2::uuid[])`, [`%@${DOMAIN}`, devUsers]);
  await q(`DELETE FROM orgs.agent_invitations WHERE email LIKE $1 OR invited_by = ANY($2::uuid[])`, [`%@${DOMAIN}`, devUsers]);
  await q(`DELETE FROM orgs.admin_profiles WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM orgs.agent_profiles WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM stays.host_profiles WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM orgs.teams WHERE organization_id = ANY($1::uuid[])`, [devOrgIds]);
  await q(`DELETE FROM orgs.memberships WHERE user_id = ANY($1::uuid[])`, [devUsers]);
  await q(`DELETE FROM identity.sessions WHERE user_id = ANY($1::uuid[])`, [devUsers]);

  const roleId = Object.fromEntries((await q(`SELECT code, id FROM orgs.roles WHERE organization_id IS NULL`)).rows.map((r) => [r.code, r.id]));
  async function membership(userId, organizationId, roles, status = "active") {
    const m = await one(`INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`, [
      userId,
      organizationId,
      status,
      id.superadmin,
    ]);
    for (const code of roles) await q(`INSERT INTO orgs.membership_roles (membership_id, role_id) VALUES ($1, $2)`, [m.id, roleId[code]]);
    return m.id;
  }

  // ── Staff ──────────────────────────────────────────────────────────────────
  const staff = {};
  const saMembership = await membership(id.superadmin, internal.id, ["superadmin"]);
  staff.superadmin = await one(
    `INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level) VALUES (gen_random_uuid(), platform.gen_reference_id('SADM'), $1, $2, 'superadmin') RETURNING reference_id`,
    [id.superadmin, saMembership],
  );
  for (const [key, preset] of [
    ["opsAdmin", "operations"],
    ["moderator", "moderation"],
  ]) {
    const m = await membership(id[key], internal.id, ["admin"]);
    for (const code of ADMIN_PRESETS[preset].permissions) {
      await q(`INSERT INTO orgs.membership_permissions (membership_id, permission_code, scope, granted_by) VALUES ($1, $2, 'platform', $3)`, [m, code, id.superadmin]);
    }
    staff[key] = await one(
      `INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level, created_by)
       VALUES (gen_random_uuid(), platform.gen_reference_id('ADM'), $1, $2, 'admin', $3) RETURNING reference_id`,
      [id[key], m, id.superadmin],
    );
  }

  // ── Agents ─────────────────────────────────────────────────────────────────
  async function agentProfile(userId, { phone, rera, citySlug, years, status, verification, requestedOrg = null, reason = null, bio = null }) {
    return one(
      `INSERT INTO orgs.agent_profiles (id, user_id, phone, rera_agent_number, city_place_id, experience_years, bio, status, verification_status,
                                        status_reason, requested_organization_id, approved_by, approved_at, status_changed_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13) RETURNING id, reference_id`,
      [userId, phone, rera, city[citySlug], years, bio, status, verification, reason, requestedOrg,
       status === "pending" ? null : id.opsAdmin, status === "pending" ? null : ago(40), ago(status === "pending" ? 1 : 45)],
    );
  }
  const agent = {};
  agent.broker = await agentProfile(id.broker, { phone: "+919800000101", rera: "SAMPLE-RERA-AGT-0101", citySlug: "hyderabad", years: 14, status: "active", verification: "verified" });
  agent.teamLead = await agentProfile(id.teamLead, { phone: "+919800000102", rera: "SAMPLE-RERA-AGT-0102", citySlug: "hyderabad", years: 9, status: "active", verification: "verified" });
  agent.agent = await agentProfile(id.agent, { phone: "+919800000103", rera: "SAMPLE-RERA-AGT-0103", citySlug: "hyderabad", years: 4, status: "active", verification: "verified",
    bio: "Rentals and resale apartments across Hyderabad's western suburbs. Sample profile for development." });
  agent.independent = await agentProfile(id.independent, { phone: "+919800000104", rera: null, citySlug: "bengaluru", years: 2, status: "active", verification: "unverified" });
  agent.suspended = await agentProfile(id.suspendedAgent, { phone: "+919800000105", rera: "SAMPLE-RERA-AGT-0105", citySlug: "pune", years: 6, status: "suspended", verification: "verified",
    reason: "Sample: repeated complaints about unavailable listings (development data)." });
  agent.applicant = await agentProfile(id.applicant, { phone: "+919800000106", rera: "SAMPLE-RERA-AGT-0106", citySlug: "hyderabad", years: 3, status: "pending", verification: "pending", requestedOrg: org.skyline.id });

  const m = {};
  m.broker = await membership(id.broker, org.skyline.id, ["broker_admin"]);
  m.teamLead = await membership(id.teamLead, org.skyline.id, ["team_lead"]);
  m.agent = await membership(id.agent, org.skyline.id, ["agent"]);
  m.independent = await membership(id.independent, org.kabir.id, ["agent"]);
  m.suspendedAgent = await membership(id.suspendedAgent, org.harbour.id, ["agent"]);
  // ── Hosts ──────────────────────────────────────────────────────────────────
  const host = {};
  host.rahul = await one(
    `INSERT INTO stays.host_profiles (id, user_id, phone, city_place_id, about, languages, relationship, status, verification_status, approved_by, approved_at, status_changed_at, created_at)
     VALUES (gen_random_uuid(), $1, '+919800000201', $2, $3, ARRAY['English', 'Hindi', 'Konkani'], 'owner', 'active', 'verified', $4, $5, $5, $6) RETURNING id, reference_id`,
    [id.host, city.north_goa, "I grew up in Goa and host guests in two family homes near the beach. Sample host for development.", id.opsAdmin, ago(60), ago(62)],
  );
  host.sneha = await one(
    `INSERT INTO stays.host_profiles (id, user_id, phone, city_place_id, about, languages, relationship, status, verification_status, created_at)
     VALUES (gen_random_uuid(), $1, '+919800000202', $2, 'I have a spare room in my Baner flat. Sample applicant for development.', ARRAY['English', 'Marathi'], 'owner', 'pending', 'pending', $3)
     RETURNING id, reference_id`,
    [id.hostApplicant, city.pune, ago(1)],
  );
  m.host = await membership(id.host, org.rahul.id, ["host"]);

  const team = await one(`INSERT INTO orgs.teams (id, organization_id, name) VALUES (gen_random_uuid(), $1, 'Hyderabad West') RETURNING id`, [org.skyline.id]);
  await q(`INSERT INTO orgs.team_members (team_id, membership_id, is_lead) VALUES ($1, $2, true), ($1, $3, false)`, [team.id, m.teamLead, m.agent]);

  // Open review cases for the pending application and the pending organization.
  await q(`INSERT INTO trust.review_cases (id, case_type, agent_profile_id, status, submitted_by, created_at) VALUES (gen_random_uuid(), 'agent_application', $1, 'open', $2, $3)`,
    [agent.applicant.id, id.applicant, ago(1)]);
  await q(`INSERT INTO trust.review_cases (id, case_type, organization_id, status, submitted_by, created_at) VALUES (gen_random_uuid(), 'organization_verification', $1, 'open', $2, $3)`,
    [org.crestline.id, id.opsAdmin, ago(2)]);

  // ── Listings ───────────────────────────────────────────────────────────────
  const place = Object.fromEntries((await q(`SELECT path::text, id FROM geography.places`)).rows.map((r) => [r.path, r.id]));
  const typeId = Object.fromEntries((await q(`SELECT code, id FROM real_estate.property_types`)).rows.map((r) => [r.code, r.id]));
  const amenityId = Object.fromEntries((await q(`SELECT code, id FROM real_estate.amenities`)).rows.map((r) => [r.code, r.id]));
  const mediaId = {};
  for (const key of [
    "/images/properties/home-sunlit-interior.jpg",
    "/images/properties/residence-dusk.jpg",
    "/images/architecture/modernist-facade.jpg",
    "/images/architecture/city-aerial-dusk.jpg",
    "/images/architecture/construction-dusk.jpg",
    "/images/architecture/concrete-curve.jpg",
  ]) {
    const row = await one(
      `INSERT INTO real_estate.media (id, storage_key, storage_provider, media_type, mime_type, alt_text)
       VALUES ($1, $2, 'public', 'image', 'image/jpeg', 'Sample photo, not the actual property')
       ON CONFLICT (storage_key) DO UPDATE SET storage_key = EXCLUDED.storage_key RETURNING id`,
      [uuidv7(), key],
    );
    mediaId[key] = row.id;
  }

  const created = {};
  async function listing(key, spec) {
    const { agentKey, orgKey, locality, type, purpose, title, description, price, status, lifecycle = "ready", carpet = null, unit = null,
      residential = null, commercial = null, land = null, pg = null, rooms = [], images = [], amenities = [], reason = null, flags = null,
      deposit = null, maintenance = null, availableFrom = null, createdDaysAgo = 20, publishedDaysAgo = null, reraId = null, lease = null } = spec;
    const loc = await one(`SELECT id, ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lng FROM geography.places WHERE id = $1`, [place[locality]]);
    const jitter = () => (Math.random() - 0.5) * 0.01;
    const address = await one(
      `INSERT INTO geography.addresses (id, place_id, line1, landmark, location)
       VALUES (gen_random_uuid(), $1, $2, 'Sample address for development', ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) RETURNING id`,
      [loc.id, `${title.split(" in ")[0]}, sample street`, Number(loc.lng) + jitter(), Number(loc.lat) + jitter()],
    );
    const createdAt = ago(createdDaysAgo);
    const property = await one(
      `INSERT INTO real_estate.properties (id, address_id, property_type_id, organization_id, unit_number, carpet_area_sqft, built_up_area_sqft,
                                           lifecycle_status, source, created_by, verification_status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'sample', $8, $9, $10, $10) RETURNING id, reference_id`,
      [address.id, typeId[type], org[orgKey].id, unit, carpet, carpet ? Math.round(carpet * 1.15) : null, lifecycle, id[agentKey],
       status === "published" && agentKey === "agent" ? "verified" : "unverified", createdAt],
    );
    if (residential) {
      await q(`INSERT INTO real_estate.residential_attributes (property_id, bedrooms, bathrooms, balconies, furnishing, facing, covered_parking)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`, [property.id, ...residential]);
    }
    if (commercial) await q(`INSERT INTO real_estate.commercial_attributes (property_id, fitout_status, washrooms, parking_spaces, power_backup) VALUES ($1, $2, $3, $4, $5)`, [property.id, ...commercial]);
    if (land) await q(`INSERT INTO real_estate.land_attributes (property_id, plot_area_sqyd, zoning, road_width_ft, corner_plot) VALUES ($1, $2, $3, $4, $5)`, [property.id, ...land]);
    if (pg) await q(`INSERT INTO real_estate.pg_attributes (property_id, total_rooms, total_beds, attached_bathrooms, common_kitchen) VALUES ($1, $2, $3, $4, true)`, [property.id, ...pg.physical]);
    for (const [i, img] of images.entries()) await q(`INSERT INTO real_estate.media_links (id, media_id, property_id, sort_order) VALUES ($1, $2, $3, $4)`, [uuidv7(), mediaId[img], property.id, i]);
    for (const code of amenities) await q(`INSERT INTO real_estate.property_amenities (property_id, amenity_id) VALUES ($1, $2)`, [property.id, amenityId[code]]);

    const submittedAt = ["draft"].includes(status) ? null : ago(Math.max(createdDaysAgo - 2, 0));
    const publishedAt = publishedDaysAgo === null ? null : ago(publishedDaysAgo);
    const listingRow = await one(
      `INSERT INTO marketplace.listings (id, property_id, organization_id, created_by, transaction_type, status, title, description, price,
                                         deposit_amount, maintenance_amount, available_from, lease_duration_months, rera_id, is_sample,
                                         status_reason, submitted_at, published_at, expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16, $17, $18, now())
       RETURNING id, reference_id`,
      [property.id, org[orgKey].id, id[agentKey], purpose, status, title, description, price, deposit, maintenance, availableFrom, lease, reraId,
       reason, submittedAt, publishedAt, publishedAt ? new Date(publishedAt.getTime() + 90 * DAY) : null, createdAt],
    );
    await q(`INSERT INTO marketplace.listing_agents (id, listing_id, agent_user_id, membership_id, role, assigned_by, assigned_at) VALUES ($1, $2, $3, $4, 'primary', $3, $5)`,
      [uuidv7(), listingRow.id, id[agentKey], m[agentKey], createdAt]);
    if (pg) {
      await q(`INSERT INTO marketplace.pg_listing_terms (listing_id, gender_policy, meals, food_preference, notice_period_days, lock_in_months, visitors_allowed, house_rules)
               VALUES ($1, $2, $3, $4, 30, 3, false, 'Sample house rules: no smoking indoors, quiet hours after 10:30 pm.')`, [listingRow.id, ...pg.terms]);
      for (const r of rooms) {
        await q(`INSERT INTO marketplace.pg_room_offers (id, listing_id, occupancy, rent_per_bed, deposit_amount, beds_available, has_ac, attached_bathroom)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [uuidv7(), listingRow.id, ...r]);
      }
    }

    // History that matches the final status.
    const path = {
      draft: [["draft", "create"]],
      submitted: [["draft", "create"], ["submitted", "submit"]],
      under_review: [["draft", "create"], ["submitted", "submit"], ["under_review", "start_review"]],
      changes_requested: [["draft", "create"], ["submitted", "submit"], ["changes_requested", "request_changes"]],
      rejected: [["draft", "create"], ["submitted", "submit"], ["under_review", "start_review"], ["rejected", "reject"]],
      published: [["draft", "create"], ["submitted", "submit"], ["approved", "approve"], ["published", "publish"]],
      paused: [["draft", "create"], ["submitted", "submit"], ["approved", "approve"], ["published", "publish"], ["paused", "pause"]],
    }[status];
    let from = null;
    for (const [i, [to, action]] of path.entries()) {
      const actor = ["start_review", "approve", "publish", "reject", "request_changes"].includes(action) ? id.moderator : action === "pause" ? id.opsAdmin : id[agentKey];
      const why = ["reject", "request_changes", "pause"].includes(action) ? reason : null;
      await q(`INSERT INTO marketplace.listing_status_history (id, listing_id, from_status, to_status, action, reason, actor_user_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [uuidv7(), listingRow.id, from, to, action, why, actor, new Date(createdAt.getTime() + i * 3_600_000 * 20)]);
      from = to;
    }
    if (publishedAt) {
      await q(`INSERT INTO marketplace.listing_prices (id, listing_id, price, effective, changed_by) VALUES ($1, $2, $3, tstzrange($4, NULL), $5)`,
        [uuidv7(), listingRow.id, price, publishedAt, id.moderator]);
    }
    const caseStatus = { submitted: "open", under_review: "in_review", changes_requested: "changes_requested", rejected: "rejected", published: "approved", paused: "approved" }[status];
    if (caseStatus) {
      const decided = !["open", "in_review"].includes(caseStatus);
      await q(`INSERT INTO trust.review_cases (id, case_type, listing_id, status, flags, submitted_by, assigned_to, decided_by, decided_at, decision_reason, created_at)
               VALUES (gen_random_uuid(), 'listing_review', $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`,
        [listingRow.id, caseStatus, JSON.stringify(flags ?? {}), id[agentKey], caseStatus === "in_review" ? id.moderator : null,
         decided ? id.moderator : null, decided ? ago(Math.max(createdDaysAgo - 3, 0)) : null, decided && status !== "published" && status !== "paused" ? reason : null, submittedAt]);
    }
    created[key] = { id: listingRow.id, reference: listingRow.reference_id, propertyId: property.id, agentKey, orgKey };
    return created[key];
  }

  const APT = ["/images/properties/home-sunlit-interior.jpg", "/images/architecture/modernist-facade.jpg"];
  await listing("priyaRent", {
    agentKey: "agent", orgKey: "skyline", locality: "in.telangana.hyderabad.kondapur", type: "apartment", purpose: "rent", status: "published",
    title: "2 BHK apartment in Kondapur", description: "Sample listing for development. A bright two-bedroom flat close to the Kondapur main road, with covered parking and power backup.",
    price: 32000, deposit: 96000, maintenance: 2500, carpet: 1080, residential: [2, 2, 1, "semi_furnished", "east", 1], images: APT,
    amenities: ["lift", "power_backup", "covered_parking", "gated_security"], createdDaysAgo: 28, publishedDaysAgo: 24, availableFrom: ago(-5).toISOString().slice(0, 10),
  });
  await listing("priyaSale", {
    agentKey: "agent", orgKey: "skyline", locality: "in.telangana.hyderabad.gachibowli", type: "apartment", purpose: "sale", status: "submitted",
    title: "3 BHK apartment in Gachibowli", description: "Sample listing for development.", price: 14500000, carpet: 1650,
    residential: [3, 3, 2, "unfurnished", "north_east", 2], images: [APT[0]], amenities: ["lift", "gym", "swimming_pool"], createdDaysAgo: 3,
    flags: { quality: [{ code: "short_description", message: "The description is under 80 characters." }, { code: "few_photos", message: "Only 1 photo." }] },
  });
  await listing("priyaDraft", {
    agentKey: "agent", orgKey: "skyline", locality: "in.telangana.hyderabad.kokapet", type: "villa", purpose: "sale", status: "draft",
    title: "Villa in Kokapet", description: null, price: null, createdDaysAgo: 1,
  });
  await listing("priyaPg", {
    agentKey: "agent", orgKey: "skyline", locality: "in.telangana.hyderabad.madhapur", type: "pg", purpose: "pg", status: "changes_requested",
    title: "Women's PG in Madhapur", description: "Sample listing for development. Walking distance to the Madhapur tech parks, with three meals a day.",
    price: 9500, pg: { physical: [12, 30, 8], terms: ["women", "three", "veg"] }, rooms: [["double", 11500, 11500, 4, true, true], ["triple", 9500, 9500, 6, false, true]],
    images: ["/images/properties/home-sunlit-interior.jpg"], amenities: ["wifi", "laundry", "housekeeping", "cctv"], createdDaysAgo: 6,
    reason: "Please add photos of the rooms and the common kitchen, and confirm the curfew time.",
  });
  await listing("arjunOffice", {
    agentKey: "teamLead", orgKey: "skyline", locality: "in.telangana.hyderabad.madhapur", type: "office", purpose: "rent", status: "published",
    title: "Office space in Madhapur", description: "Sample listing for development. A warm-shell office floor with 60 workstations' worth of space and full power backup.",
    price: 185000, deposit: 1110000, carpet: 3200, commercial: ["warm_shell", 4, 6, "full"], images: ["/images/architecture/city-aerial-dusk.jpg", "/images/architecture/concrete-curve.jpg"],
    amenities: ["lift", "power_backup", "fire_safety"], createdDaysAgo: 35, publishedDaysAgo: 30,
  });
  await listing("arjunShop", {
    agentKey: "teamLead", orgKey: "skyline", locality: "in.telangana.hyderabad.kukatpally", type: "retail", purpose: "sale", status: "rejected",
    title: "Shop in Kukatpally", description: "Sample listing for development.", price: 9000000, carpet: 420, commercial: ["bare_shell", 1, 1, "partial"],
    images: ["/images/architecture/modernist-facade.jpg"], createdDaysAgo: 12,
    reason: "The photos show a different building from the address given. Please upload photos of this shop.",
  });
  await listing("kabirRent", {
    agentKey: "independent", orgKey: "kabir", locality: "in.karnataka.bengaluru.hsr_layout", type: "apartment", purpose: "rent", status: "published",
    title: "1 BHK apartment in HSR Layout", description: "Sample listing for development. A compact one-bedroom near 27th Main, suitable for a single professional or a couple.",
    price: 24000, deposit: 120000, carpet: 620, residential: [1, 1, 1, "furnished", null, 0], images: APT, amenities: ["lift", "power_backup"],
    createdDaysAgo: 18, publishedDaysAgo: 15,
  });
  await listing("kabirSale", {
    agentKey: "independent", orgKey: "kabir", locality: "in.karnataka.bengaluru.whitefield", type: "apartment", purpose: "sale", status: "under_review",
    title: "2 BHK apartment in Whitefield", description: "Sample listing for development. Two bedrooms in a gated community near the Whitefield metro station.",
    price: 8200000, carpet: 1150, residential: [2, 2, 2, "semi_furnished", "west", 1], images: APT, amenities: ["gated_security", "gym"], createdDaysAgo: 4,
    flags: { duplicates: [{ referenceId: "LST-SAMPLE00", title: "Sample duplicate candidate", reasons: ["Very similar address in the same locality"] }] },
  });
  await listing("kabirPlot", {
    agentKey: "independent", orgKey: "kabir", locality: "in.karnataka.bengaluru.sarjapur_road", type: "residential_plot", purpose: "sale", status: "published",
    title: "Residential plot on Sarjapur Road", description: "Sample listing for development. A 240 sq yd east-facing plot in an approved layout, 30 ft road.",
    price: 6500000, land: [240, "residential", 30, false], images: ["/images/architecture/construction-dusk.jpg"], createdDaysAgo: 22, publishedDaysAgo: 19,
  });
  await listing("rohanRent", {
    agentKey: "suspendedAgent", orgKey: "harbour", locality: "in.maharashtra.pune.wakad", type: "apartment", purpose: "rent", status: "paused",
    title: "2 BHK apartment in Wakad", description: "Sample listing for development.", price: 22000, deposit: 66000, carpet: 950,
    residential: [2, 2, 1, "unfurnished", null, 1], images: APT, createdDaysAgo: 50, publishedDaysAgo: 45, reason: "Agent suspended",
  });

  // Fix up references in flags now that real references exist.
  await q(`UPDATE trust.review_cases SET flags = jsonb_set(flags, '{duplicates,0,referenceId}', to_jsonb($1::text))
            WHERE listing_id = $2`, [created.priyaRent.reference, created.kabirSale.id]);
  await q(`UPDATE trust.review_cases SET flags = jsonb_set(flags, '{duplicates,0,title}', to_jsonb($1::text))
            WHERE listing_id = $2`, ["2 BHK apartment in Kondapur", created.kabirSale.id]);

  // ── Views: a month of daily traffic on live listings ───────────────────────
  for (const key of ["priyaRent", "arjunOffice", "kabirRent", "kabirPlot"]) {
    for (let day = 0; day < 30; day++) {
      const visitors = Math.floor(Math.random() * 9) + (key === "priyaRent" ? 4 : 1);
      for (let v = 0; v < visitors; v++) {
        await q(`INSERT INTO marketplace.listing_views (listing_id, viewer_key, viewed_on, view_count) VALUES ($1, $2, (now() AT TIME ZONE 'Asia/Kolkata')::date - $3::int, $4)
                 ON CONFLICT DO NOTHING`, [created[key].id, `dev-${key}-${day}-${v}`, day, 1 + Math.floor(Math.random() * 2)]);
      }
    }
  }

  // ── Leads, visits, contacts ────────────────────────────────────────────────
  async function lead(listingKey, customerKey, { status, message, days, visit = null, lostReason = null }) {
    const l = created[listingKey];
    const customer = ACCOUNTS[customerKey];
    const contact = await one(
      `INSERT INTO crm.contacts (id, organization_id, user_id, name, email, phone) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT contacts_org_user_unique DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [org[l.orgKey].id, id[customerKey], customer.name, customer.email, `+9197000${String(Object.keys(ACCOUNTS).indexOf(customerKey)).padStart(5, "0")}`],
    );
    const row = await one(
      `INSERT INTO crm.leads (id, organization_id, contact_id, listing_id, property_id, agent_user_id, agent_membership_id, status, source, message, lost_reason, created_at, last_activity_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id, reference_id`,
      [org[l.orgKey].id, contact.id, l.id, l.propertyId, id[l.agentKey], m[l.agentKey], status, visit ? "visit_request" : "listing_enquiry", message, lostReason, ago(days)],
    );
    await q(`INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, to_status, actor_user_id, created_at) VALUES ($1, $2, 'created', $3, 'new', $4, $5)`,
      [uuidv7(), row.id, message, id[customerKey], ago(days)]);
    if (status !== "new") {
      await q(`INSERT INTO crm.lead_activities (id, lead_id, activity_type, from_status, to_status, actor_user_id, created_at) VALUES ($1, $2, 'status_changed', 'new', $3, $4, $5)`,
        [uuidv7(), row.id, status, id[l.agentKey], ago(Math.max(days - 1, 0))]);
    }
    if (visit) {
      await q(`INSERT INTO crm.visits (id, organization_id, lead_id, listing_id, property_id, agent_user_id, customer_user_id, requested_for, scheduled_at, status, created_by, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $6, $10)`,
        [org[l.orgKey].id, row.id, l.id, l.propertyId, id[l.agentKey], id[customerKey], visit.requestedFor, visit.scheduledAt ?? null, visit.status, ago(days)]);
    }
    return row;
  }
  await lead("priyaRent", "customer1", { status: "new", message: "Is the flat available from next month? Sample enquiry.", days: 1 });
  await lead("priyaRent", "customer2", { status: "visit_scheduled", message: "I'd like to see it this week. Sample enquiry.", days: 4,
    visit: { status: "scheduled", requestedFor: ahead(2, 10), scheduledAt: ahead(2, 11) } });
  await lead("priyaRent", "customer3", { status: "lost", message: "Is the rent negotiable? Sample enquiry.", days: 12, lostReason: "Chose a flat closer to their office" });
  await lead("arjunOffice", "customer3", { status: "contacted", message: "We need about 50 seats from next quarter. Sample enquiry.", days: 6,
    visit: { status: "requested", requestedFor: ahead(5, 14) } });
  await lead("kabirPlot", "customer2", { status: "negotiation", message: "Is the layout approved? Sample enquiry.", days: 9,
    visit: { status: "completed", requestedFor: ago(5), scheduledAt: ago(5) } });
  await lead("kabirRent", "customer1", { status: "converted", message: "Sample enquiry.", days: 14 });

  // ── Homestays: two of Rahul's homes, their calendar, and bookings in every state ─
  const STAY = ["/images/properties/residence-dusk.jpg", "/images/properties/home-sunlit-interior.jpg"];
  await listing("rahulVilla", {
    agentKey: "host", orgKey: "rahul", locality: "in.goa.north_goa.calangute", type: "villa", purpose: "stay", status: "published",
    title: "Garden villa near Calangute beach", description: "Sample stay for development. A three-bedroom family villa with a garden, a kitchen guests can use and fast Wi-Fi, a ten-minute walk from the beach.",
    price: 8500, carpet: 1900, residential: [3, 3, 1, "furnished", "west", 2], images: STAY,
    amenities: ["wifi", "kitchen", "air_conditioning", "washing_machine", "tv", "power_backup", "first_aid"], createdDaysAgo: 50, publishedDaysAgo: 45,
  });
  await listing("rahulRoom", {
    agentKey: "host", orgKey: "rahul", locality: "in.goa.north_goa.anjuna", type: "independent_house", purpose: "stay", status: "published",
    title: "Quiet garden room in Anjuna", description: "Sample stay for development. A private room with its own bathroom in our family home, breakfast on request.",
    price: 2600, carpet: 300, residential: [1, 1, 0, "furnished", "north", 0], images: [STAY[1]],
    amenities: ["wifi", "hot_water", "workspace", "self_check_in"], createdDaysAgo: 30, publishedDaysAgo: 26,
  });
  for (const [key, terms] of [
    ["rahulVilla", ["entire_home", 6, 4, 11000, 1500, 2, 21, false, "moderate", true, "No parties or loud music after 10 pm. Pets welcome in the garden."]],
    ["rahulRoom", ["private_room", 2, 1, null, null, 1, 14, true, "flexible", false, "Shared entrance with the family. Quiet hours 10 pm to 7 am."]],
  ]) {
    await q(`INSERT INTO stays.stay_terms (listing_id, space_type, max_guests, beds, weekend_price, cleaning_fee, min_nights, max_nights, instant_book, cancellation_policy, pets_allowed, house_rules)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [created[key].id, ...terms]);
  }
  const isoDay = (offset) => {
    const d = new Date(`${new Date(NOW).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  await q(`INSERT INTO stays.stay_blocks (id, listing_id, dates, reason, created_by) VALUES (gen_random_uuid(), $1, daterange($2::date, $3::date), 'Family visiting (sample)', $4)`,
    [created.rahulVilla.id, isoDay(40), isoDay(44), id.host]);
  await q(`INSERT INTO stays.stay_rates (id, listing_id, dates, nightly_price, note, created_by) VALUES (gen_random_uuid(), $1, daterange($2::date, $3::date), 14000, 'Festival weekend (sample)', $4)`,
    [created.rahulVilla.id, isoDay(25), isoDay(28), id.host]);

  async function booking(listingKey, guestKey, { from, nights, status, adults = 2, children = 0, message = null, reason = null, cancelledBy = null, createdDaysAgo = 3 }) {
    const l = created[listingKey];
    const t = await one(`SELECT l.price, st.weekend_price, st.cleaning_fee, st.cancellation_policy FROM marketplace.listings l JOIN stays.stay_terms st ON st.listing_id = l.id WHERE l.id = $1`, [l.id]);
    const nightly = [];
    for (let i = 0; i < nights; i++) {
      const date = isoDay(from + i);
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      nightly.push({ date, price: Number(t.weekend_price && (dow === 5 || dow === 6) ? t.weekend_price : t.price) });
    }
    const subtotal = nightly.reduce((a, n) => a + n.price, 0);
    const cleaning = Number(t.cleaning_fee ?? 0);
    const guest = ACCOUNTS[guestKey];
    const row = await one(
      `INSERT INTO stays.bookings (id, listing_id, property_id, organization_id, host_user_id, guest_user_id, dates, nights, adults, children, nightly_breakdown, subtotal, cleaning_fee, total,
                                   status, guest_name, guest_phone, guest_message, cancellation_policy, check_in_time, check_out_time, status_reason, cancelled_by, expires_at, confirmed_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, daterange($6::date, $7::date), $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, '+919811100000', $17, $18, '14:00', '11:00', $19, $20, $21, $22, $23)
       RETURNING id, reference_id`,
      [l.id, l.propertyId, org[l.orgKey].id, id[l.agentKey], id[guestKey], isoDay(from), isoDay(from + nights), nights, adults, children, JSON.stringify(nightly), subtotal, cleaning,
       subtotal + cleaning, status, guest.name, message, t.cancellation_policy, reason, cancelledBy,
       status === "requested" ? new Date(NOW + 20 * 3_600_000) : null, ["confirmed", "checked_in", "completed"].includes(status) ? ago(Math.max(createdDaysAgo - 1, 0)) : null, ago(createdDaysAgo)],
    );
    const trail = { requested: [["requested", "request", "guest"]], confirmed: [["requested", "request", "guest"], ["confirmed", "accept", "host"]],
      completed: [["requested", "request", "guest"], ["confirmed", "accept", "host"], ["checked_in", "check_in", "host"], ["completed", "complete", "host"]],
      cancelled: [["requested", "request", "guest"], ["confirmed", "accept", "host"], ["cancelled", "guest_cancel", "guest"]] }[status];
    let prev = null;
    for (const [i, [to, action, role]] of trail.entries()) {
      await q(`INSERT INTO stays.booking_events (id, booking_id, from_status, to_status, action, note, actor_user_id, actor_role, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv7(), row.id, prev, to, action, i === 0 ? message : to === "cancelled" ? reason : null, role === "guest" ? id[guestKey] : id[l.agentKey], role, new Date(ago(createdDaysAgo).getTime() + i * 3_600_000 * 6)]);
      prev = to;
    }
    return row;
  }
  const stayBookings = {};
  stayBookings.upcoming = await booking("rahulVilla", "customer1", { from: 10, nights: 3, status: "confirmed", adults: 3, message: "Coming for a family holiday. Sample booking." });
  stayBookings.request = await booking("rahulVilla", "customer2", { from: 18, nights: 4, status: "requested", adults: 2, children: 1, message: "Is the garden safe for a toddler? Sample request.", createdDaysAgo: 0 });
  stayBookings.past = await booking("rahulRoom", "customer3", { from: -12, nights: 2, status: "completed", adults: 1, createdDaysAgo: 20 });
  stayBookings.cancelled = await booking("rahulRoom", "customer1", { from: 6, nights: 2, status: "cancelled", adults: 2, reason: "Plans changed (sample).", cancelledBy: "guest", createdDaysAgo: 5 });

  // ── Guest ↔ host messages: Ananya asked before booking the villa; Vikram's question is unread ─
  async function conversation(listingKey, guestKey, messages) {
    const l = created[listingKey];
    const c = await one(
      `INSERT INTO stays.conversations (id, listing_id, organization_id, host_user_id, guest_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id`,
      [l.id, org[l.orgKey].id, id[l.agentKey], id[guestKey], new Date(NOW - messages[0][2] * 60_000)],
    );
    const seen = { guest: 0, host: 0 };
    for (const [role, body, minutesAgo, readByOther] of messages) {
      const m = await one(
        `INSERT INTO stays.messages (id, conversation_id, sender_user_id, sender_role, body, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING seq`,
        [c.id, role === "guest" ? id[guestKey] : id[l.agentKey], role, body, new Date(NOW - minutesAgo * 60_000)],
      );
      seen[role] = Number(m.seq);
      if (readByOther) seen[role === "guest" ? "host" : "guest"] = Number(m.seq);
    }
    const last = messages.at(-1);
    await q(`UPDATE stays.conversations SET guest_last_read_seq = $2, host_last_read_seq = $3, last_message_at = $4 WHERE id = $1`,
      [c.id, seen.guest, seen.host, new Date(NOW - last[2] * 60_000)]);
  }
  await conversation("rahulVilla", "customer1", [
    ["guest", "Hi Rahul! We're a family of three thinking of coming next month. Is there parking for one car? (Sample message.)", 4 * 1440, true],
    ["host", "Hello Ananya, yes: there's covered parking inside the gate for one car, and street parking for a second.", 4 * 1440 - 10, true],
    ["guest", "Perfect. And is the kitchen fully equipped? We'd like to cook a couple of meals.", 4 * 1440 - 25, true],
    ["host", "It is: gas stove, fridge, microwave, mixer and all the utensils. The market is a five-minute walk.", 4 * 1440 - 40, true],
    ["guest", "Great, booking now. Thank you!", 3 * 1440 + 30, true],
    ["host", "See you soon! I'll share directions the day before you arrive.", 90, false],
  ]);
  await conversation("rahulVilla", "customer2", [
    ["guest", "Hello, is the garden fenced? We have a two-year-old. (Sample message.)", 35, false],
  ]);

  // ── A report, bookmarks, an invitation, notifications ──────────────────────
  await q(`INSERT INTO trust.reports (id, listing_id, reporter_user_id, reason, details, created_at) VALUES (gen_random_uuid(), $1, $2, 'incorrect_details', $3, $4)`,
    [created.kabirRent.id, id.customer3, "Sample report: the photos don't match the flat I visited.", ago(2)]);
  for (const [customerKey, listingKey] of [["customer1", "priyaRent"], ["customer1", "kabirPlot"], ["customer2", "arjunOffice"]]) {
    await q(`INSERT INTO marketplace.saved_properties (user_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id[customerKey], created[listingKey].propertyId]);
  }
  const inviteToken = randomBytes(32).toString("base64url");
  await q(`INSERT INTO orgs.admin_invitations (id, email, name, token_hash, permission_codes, invited_by, expires_at)
           VALUES (gen_random_uuid(), $1, 'New Admin', $2, $3::text[], $4, now() + interval '72 hours')`,
    [`new.admin@${DOMAIN}`, createHash("sha256").update(inviteToken).digest("hex"), ADMIN_PRESETS.support.permissions, id.superadmin]);
  const agentInviteToken = randomBytes(32).toString("base64url");
  await q(`INSERT INTO orgs.agent_invitations (id, email, name, phone, city_place_id, rera_agent_number, experience_years, organization_id, role_code, token_hash, invited_by, expires_at)
           VALUES (gen_random_uuid(), $1, 'Dev Agent Invitee', '+919800000199', $2, 'SAMPLE-RERA-AGT-0199', 2, $3, 'agent', $4, $5, now() + interval '72 hours')`,
    [`new.agent@${DOMAIN}`, city.hyderabad, org.skyline.id, createHash("sha256").update(agentInviteToken).digest("hex"), id.opsAdmin]);

  const note = (userId, type, title, link) =>
    q(`INSERT INTO platform.notifications (id, user_id, type, title, link) VALUES ($1, $2, $3, $4, $5)`, [uuidv7(), userId, type, title, link]);
  await note(id.agent, "new_lead", `New enquiry on ${created.priyaRent.reference}`, `/leads`);
  await note(id.host, "booking_requested", `Vikram Shah asks to book ${created.rahulVilla.reference}`, `/bookings/${stayBookings.request.reference_id}`);
  await note(id.opsAdmin, "host_application", `New host application ${host.sneha.reference_id}`, `/hosts/${host.sneha.reference_id}`);
  await note(id.agent, "listing_changes_requested", `Changes requested on ${created.priyaPg.reference}`, `/properties/${created.priyaPg.reference}`);
  await note(id.moderator, "listing_submitted", `${created.priyaSale.reference} is waiting for review`, `/moderation`);
  await note(id.opsAdmin, "agent_application", `New agent application ${agent.applicant.reference_id}`, `/agents/${agent.applicant.reference_id}`);

  // ── Audit rows describing how this state came about, marked as seed data ──
  const auditRow = (event, actorKey, actorRef, role, targetType, targetRef, metadata = {}) =>
    q(`INSERT INTO platform.audit_events (id, event_type, actor_user_id, actor_reference_id, actor_role, target_type, target_reference_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`, [uuidv7(), event, id[actorKey], actorRef, role, targetType, targetRef, JSON.stringify({ ...metadata, seed: true })]);
  await auditRow("ADMIN_CREATED", "superadmin", staff.superadmin.reference_id, "superadmin", "admin", staff.opsAdmin.reference_id, { preset: "operations" });
  await auditRow("ADMIN_CREATED", "superadmin", staff.superadmin.reference_id, "superadmin", "admin", staff.moderator.reference_id, { preset: "moderation" });
  await auditRow("AGENT_APPROVED", "opsAdmin", staff.opsAdmin.reference_id, "admin", "agent", agent.agent.reference_id);
  await auditRow("LISTING_APPROVED", "moderator", staff.moderator.reference_id, "admin", "listing", created.priyaRent.reference);
  await auditRow("LISTING_REJECTED", "moderator", staff.moderator.reference_id, "admin", "listing", created.arjunShop.reference);
  await auditRow("AGENT_SUSPENDED", "opsAdmin", staff.opsAdmin.reference_id, "admin", "agent", agent.suspended.reference_id, { listingsPaused: 1 });
  await auditRow("ADMIN_INVITED", "superadmin", staff.superadmin.reference_id, "superadmin", "invitation", null, { email: `new.admin@${DOMAIN}` });
  await auditRow("AGENT_INVITED", "opsAdmin", staff.opsAdmin.reference_id, "admin", "invitation", null, { email: `new.agent@${DOMAIN}` });

  await q("COMMIT");

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  console.log("\nDevelopment workspaces ready. Every account's password:", PASSWORD, "\n");
  console.table(
    Object.entries(ACCOUNTS).map(([key, a]) => ({
      account: a.email,
      role: {
        superadmin: `SuperAdmin ${staff.superadmin.reference_id}`,
        opsAdmin: `Admin (operations) ${staff.opsAdmin.reference_id}`,
        moderator: `Admin (moderation) ${staff.moderator.reference_id}`,
        broker: `Broker admin, Sample Skyline Realty ${agent.broker.reference_id}`,
        teamLead: `Team lead, Sample Skyline Realty ${agent.teamLead.reference_id}`,
        agent: `Agent, Sample Skyline Realty ${agent.agent.reference_id}`,
        independent: `Independent agent ${agent.independent.reference_id}`,
        suspendedAgent: `Suspended agent ${agent.suspended.reference_id}`,
        applicant: `Pending agent application ${agent.applicant.reference_id}`,
        host: `Host, 2 stays in Goa ${host.rahul.reference_id}`,
        hostApplicant: `Pending host application ${host.sneha.reference_id}`,
      }[key] ?? "Customer",
    })),
  );
  console.log(`Pending admin invitation for new.admin@${DOMAIN}: ${base}/invite/${inviteToken}`);
  console.log(`Pending agent invitation for new.agent@${DOMAIN}: ${base}/invite/${agentInviteToken}\n`);
} catch (error) {
  await q("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}

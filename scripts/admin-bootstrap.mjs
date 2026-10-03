// Makes an existing, email-verified account a SuperAdmin. This is the only way a
// SuperAdmin is ever created: no page or API can do it, so a compromised admin session
// cannot mint new SuperAdmins. Run it from a trusted shell with database access.
//
//   npm run admin:bootstrap -- --email you@company.com
//
// The account must already exist (sign up normally first) and have confirmed its email.
import os from "node:os";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {}

const flag = process.argv.indexOf("--email");
const email = flag > -1 ? process.argv[flag + 1]?.trim().toLowerCase() : undefined;
if (!email || !email.includes("@")) {
  console.error("Usage: npm run admin:bootstrap -- --email you@company.com");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const one = async (text, params) => (await client.query(text, params)).rows[0];

try {
  await client.query("BEGIN");
  const user = await one(`SELECT id, reference_id, email_verified, status FROM identity.users WHERE email = $1 FOR UPDATE`, [email]);
  if (!user) throw new Error(`No account with email ${email}. Sign up first, then run this again.`);
  if (!user.email_verified) throw new Error("That account hasn't confirmed its email yet.");
  if (user.status !== "active") throw new Error(`That account is ${user.status}.`);

  const internal = await one(`SELECT id FROM orgs.organizations WHERE org_type = 'internal'`);
  if (!internal) throw new Error("The internal organization is missing. Run npm run db:migrate.");
  const role = await one(`SELECT id FROM orgs.roles WHERE organization_id IS NULL AND code = 'superadmin'`);
  if (!role) throw new Error("Role templates are missing. Run npm run db:seed:reference.");

  const existing = await one(`SELECT reference_id, level FROM orgs.admin_profiles WHERE user_id = $1`, [user.id]);
  if (existing?.level === "superadmin") {
    console.log(`${email} is already a SuperAdmin (${existing.reference_id}). Nothing to do.`);
    await client.query("ROLLBACK");
    process.exit(0);
  }
  if (existing) {
    // Reference IDs are immutable and encode the level, so an admin is never silently promoted.
    throw new Error(`${email} is an admin (${existing.reference_id}). Use a separate account for SuperAdmin access.`);
  }

  const membership = await one(
    `INSERT INTO orgs.memberships (id, user_id, organization_id, status) VALUES (gen_random_uuid(), $1, $2, 'active')
     ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', updated_at = now() RETURNING id`,
    [user.id, internal.id],
  );
  await client.query(`INSERT INTO orgs.membership_roles (membership_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [membership.id, role.id]);
  const profile = await one(
    `INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level)
     VALUES (gen_random_uuid(), platform.gen_reference_id('SADM'), $1, $2, 'superadmin') RETURNING id, reference_id`,
    [user.id, membership.id],
  );
  await client.query(
    `INSERT INTO platform.audit_events (id, event_type, actor_user_id, actor_role, target_type, target_id, target_reference_id, metadata)
     VALUES (gen_random_uuid(), 'SUPERADMIN_BOOTSTRAPPED', NULL, 'system', 'admin', $1, $2, $3::jsonb)`,
    [profile.id, profile.reference_id, JSON.stringify({ email, via: "scripts/admin-bootstrap.mjs", host: os.hostname() })],
  );
  await client.query("COMMIT");
  console.log(`${email} is now a SuperAdmin (${profile.reference_id}). They'll see the platform workspace at /dashboard.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}

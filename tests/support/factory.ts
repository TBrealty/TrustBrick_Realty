import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { type Actor, loadActor, loadWorkspaces } from "@/lib/authz/actor";
import { ADMIN_PRESETS, type Permission, type RoleCode } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import type { PersonActor, RequestContext } from "@/lib/services/audit";
import { ratesFor } from "@/lib/services/commission";

type Row = Record<string, unknown>;
export const ctx: RequestContext = { ipAddress: "10.0.0.1", userAgent: "vitest" };
const tag = () => randomBytes(4).toString("hex");

export async function one<T = Row>(query: ReturnType<typeof sql>): Promise<T> {
  return (await db.execute(query)).rows[0] as T;
}

export async function makeUser(name = "Test User", options: { verified?: boolean } = {}) {
  const email = `${name.toLowerCase().replace(/\W+/g, ".")}.${tag()}@example.test`;
  const row = await one<{ id: string; reference_id: string }>(sql`
    INSERT INTO identity.users (id, name, email, email_verified) VALUES (${uuidv7()}, ${name}, ${email}, ${options.verified ?? true})
    RETURNING id, reference_id`);
  return { id: row.id, referenceId: row.reference_id, email, name };
}

export async function makeSession(userId: string) {
  await db.execute(sql`
    INSERT INTO identity.sessions (id, user_id, token, expires_at) VALUES (${uuidv7()}, ${userId}, ${tag() + tag()}, now() + interval '1 day')`);
}

export const person = (u: { id: string; referenceId: string }): PersonActor => ({ kind: "person", userId: u.id, referenceId: u.referenceId, role: "customer" });

export async function makeOrg(name = "Test Brokerage", options: { type?: string; status?: string } = {}) {
  const row = await one<{ id: string; reference_id: string }>(sql`
    INSERT INTO orgs.organizations (id, name, slug, org_type, status) VALUES (gen_random_uuid(), ${name}, ${`test-${tag()}`}, ${options.type ?? "brokerage"}, ${options.status ?? "active"})
    RETURNING id, reference_id`);
  return { id: row.id, referenceId: row.reference_id };
}

export const internalOrgId = async () => (await one<{ id: string }>(sql`SELECT id FROM orgs.organizations WHERE org_type = 'internal'`)).id;

export async function addMembership(userId: string, organizationId: string, roles: RoleCode[]) {
  const m = await one<{ id: string }>(sql`
    INSERT INTO orgs.memberships (id, user_id, organization_id, status) VALUES (gen_random_uuid(), ${userId}, ${organizationId}, 'active') RETURNING id`);
  for (const code of roles) {
    await db.execute(sql`INSERT INTO orgs.membership_roles (membership_id, role_id) SELECT ${m.id}, id FROM orgs.roles WHERE organization_id IS NULL AND code = ${code}`);
  }
  return m.id;
}

export async function actorFor(userId: string, membershipId?: string): Promise<Actor> {
  const workspaces = await loadWorkspaces(userId);
  const chosen = membershipId ?? workspaces[0]?.membershipId;
  if (!chosen) throw new Error("user has no workspace");
  const actor = await loadActor(userId, chosen);
  if (!actor) throw new Error("membership not in force");
  return actor;
}

/**
 * Records that an organization accepted the commission rates in force, as a partner does from
 * their Commission page; submitting listings needs it. Pass `accept: false` to a maker to skip.
 */
export async function acceptCommission(organizationId: string) {
  const rates = await ratesFor(organizationId);
  const snapshot = Object.fromEntries(Object.entries(rates).map(([s, r]) => [s, { basis: r.basis, percent: r.percent }]));
  await db.execute(sql`INSERT INTO finance.commission_acceptances (id, organization_id, rates) VALUES (gen_random_uuid(), ${organizationId}, ${JSON.stringify(snapshot)}::jsonb)`);
}

/** An active agent in an organization, with the given role. */
export async function makeAgent(organizationId: string, name = "Agent", role: RoleCode = "agent", options: { verified?: boolean; accept?: boolean } = {}) {
  const user = await makeUser(name);
  const profile = await one<{ id: string; reference_id: string }>(sql`
    INSERT INTO orgs.agent_profiles (id, user_id, phone, status, verification_status)
    VALUES (gen_random_uuid(), ${user.id}, '+919999999999', 'active', ${options.verified ? "verified" : "unverified"}) RETURNING id, reference_id`);
  const membershipId = await addMembership(user.id, organizationId, [role]);
  if (options.accept !== false) await acceptCommission(organizationId);
  return { user, profileId: profile.id, referenceId: profile.reference_id, membershipId, actor: () => actorFor(user.id, membershipId) };
}

export async function makeSuperadmin() {
  const user = await makeUser("Super Admin");
  const membershipId = await addMembership(user.id, await internalOrgId(), ["superadmin"]);
  const profile = await one<{ reference_id: string }>(sql`
    INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level)
    VALUES (gen_random_uuid(), platform.gen_reference_id('SADM'), ${user.id}, ${membershipId}, 'superadmin') RETURNING reference_id`);
  return { user, membershipId, referenceId: profile.reference_id, actor: () => actorFor(user.id, membershipId) };
}

export async function makeAdmin(permissions: readonly Permission[] = ADMIN_PRESETS.operations.permissions) {
  const user = await makeUser("Admin");
  const membershipId = await addMembership(user.id, await internalOrgId(), ["admin"]);
  for (const code of permissions) {
    await db.execute(sql`INSERT INTO orgs.membership_permissions (membership_id, permission_code, scope) VALUES (${membershipId}, ${code}, 'platform')`);
  }
  const profile = await one<{ reference_id: string }>(sql`
    INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level)
    VALUES (gen_random_uuid(), platform.gen_reference_id('ADM'), ${user.id}, ${membershipId}, 'admin') RETURNING reference_id`);
  return { user, membershipId, referenceId: profile.reference_id, actor: () => actorFor(user.id, membershipId) };
}

export const locality = async (slug = "kondapur") =>
  (await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE place_type = 'locality' AND slug = ${slug}`)).id;

/** Links an existing public sample image as a photo, the way an upload would. */
export async function attachPhoto(listingReference: string) {
  const media = await one<{ id: string }>(sql`
    INSERT INTO real_estate.media (id, storage_key, storage_provider, media_type, mime_type)
    VALUES (gen_random_uuid(), ${`/images/test-${tag()}.jpg`}, 'public', 'image', 'image/jpeg') RETURNING id`);
  await db.execute(sql`
    INSERT INTO real_estate.media_links (id, media_id, property_id, sort_order)
    SELECT gen_random_uuid(), ${media.id}, l.property_id, 0 FROM marketplace.listings l WHERE l.reference_id = ${listingReference}`);
}

export const statusOf = async (listingReference: string) =>
  (await one<{ status: string }>(sql`SELECT status FROM marketplace.listings WHERE reference_id = ${listingReference}`)).status;

/** An approved host: active host profile and a `host` membership in their own personal organization. */
export async function makeHost(name = "Host", options: { verified?: boolean; accept?: boolean } = {}) {
  const user = await makeUser(name);
  const profile = await one<{ id: string; reference_id: string }>(sql`
    INSERT INTO stays.host_profiles (id, user_id, phone, status, verification_status, approved_at)
    VALUES (gen_random_uuid(), ${user.id}, '+919888877777', 'active', ${options.verified ? "verified" : "unverified"}, now()) RETURNING id, reference_id`);
  const org = await makeOrg(`${name} (host)`, { type: "personal" });
  const membershipId = await addMembership(user.id, org.id, ["host"]);
  if (options.accept !== false) await acceptCommission(org.id);
  return { user, org, referenceId: profile.reference_id, membershipId, actor: () => actorFor(user.id, membershipId) };
}

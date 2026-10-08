import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { HOST_RELATIONSHIPS } from "@/lib/db/schema/stays";
import { type PersonActor, type RequestContext, audit } from "../audit";
import { HOLD_REASONS, pauseListings, resumeListings } from "../listings/lifecycle";
import { notify, notifyPermissionHolders } from "../notifications";
import { type Page, pageParams } from "../pagination";
import { getSetting } from "../settings";
import { SUBSCRIPTION_FILTER, ownPlanColumn, subscriptionFilterSql } from "../subscriptions";

/**
 * Hosts (docs/stays/README.md §3). Anyone with a confirmed account may apply; an admin checks
 * their identity and approves. Approval gives them a `host` membership in their own personal
 * organization, which is what lets them list homes (homestays only) and manage bookings.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export const hostApplicationSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits")),
  cityId: z.uuid({ message: "Choose the city your home is in" }),
  relationship: z.enum(HOST_RELATIONSHIPS, { message: "Tell us how you relate to the home" }),
  languages: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(z.string().max(30)).max(8, "Up to 8 languages").optional(),
  ),
  about: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000, "Keep it under 1,000 characters").optional()),
  agree: z.preprocess((v) => v === "on" || v === true, z.literal(true, { message: "Confirm you're allowed to host guests in this home" })),
});

export type HostApplicationState =
  | { state: "none" }
  | { state: "pending" | "active" | "suspended" | "rejected"; referenceId: string; reason: string | null; submittedAt: string };

export async function hostApplicationFor(userId: string): Promise<HostApplicationState> {
  const { rows } = await db.execute(sql`SELECT reference_id, status, status_reason, created_at FROM stays.host_profiles WHERE user_id = ${userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return { state: "none" };
  return { state: r.status as "pending", referenceId: String(r.reference_id), reason: (r.status_reason as string) ?? null, submittedAt: iso(r.created_at)! };
}

export async function applyAsHost(user: PersonActor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  if (!(await getSetting("stays.host_applications_open"))) throw new AppError("FORBIDDEN", "Host applications are paused at the moment.");
  const parsed = hostApplicationSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const limited = await limit([{ key: `host-apply:user:${user.userId}`, rule: RULES.hostApplicationByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  return db.transaction(async (tx) => {
    const account = await tx.execute(sql`SELECT email_verified, status FROM identity.users WHERE id = ${user.userId}`);
    const a = account.rows[0] as Row | undefined;
    if (!a || a.status !== "active" || !a.email_verified) throw new AppError("FORBIDDEN");
    const staff = await tx.execute(sql`SELECT 1 FROM orgs.admin_profiles WHERE user_id = ${user.userId}`);
    if (staff.rows[0]) throw new AppError("FORBIDDEN", "Trustbrick staff can't host.");
    const city = await tx.execute(sql`SELECT id FROM geography.places WHERE id = ${input.cityId} AND place_type = 'city' AND is_active`);
    if (!city.rows[0]) throw invalid("Choose the city your home is in.", { cityId: "Choose a city" });

    const existing = await tx.execute(sql`SELECT id, status FROM stays.host_profiles WHERE user_id = ${user.userId} FOR UPDATE`);
    const prior = existing.rows[0] as Row | undefined;
    if (prior && prior.status !== "rejected") throw conflict("You have already applied. You'll be notified when it's decided.");

    const langs = sql.param(input.languages ?? []);
    const saved = prior
      ? await tx.execute(sql`
          UPDATE stays.host_profiles
             SET phone = ${input.phone}, city_place_id = ${input.cityId}, relationship = ${input.relationship}, languages = ${langs}::text[],
                 about = ${input.about ?? null}, status = 'pending', verification_status = 'pending', status_reason = NULL,
                 status_changed_at = now(), updated_at = now()
           WHERE id = ${String(prior.id)} RETURNING id, reference_id`)
      : await tx.execute(sql`
          INSERT INTO stays.host_profiles (id, user_id, phone, city_place_id, relationship, languages, about)
          VALUES (gen_random_uuid(), ${user.userId}, ${input.phone}, ${input.cityId}, ${input.relationship}, ${langs}::text[], ${input.about ?? null})
          RETURNING id, reference_id`);
    const profile = saved.rows[0] as Row;
    const referenceId = String(profile.reference_id);
    await audit(tx, user, { event: "HOST_APPLIED", target: { type: "host", id: String(profile.id), referenceId } }, ctx);
    await notifyPermissionHolders(tx, "hosts.verify", { type: "host_application", title: `New host application ${referenceId}`, link: `/hosts/${referenceId}` });
    return { referenceId };
  });
}

// ── Admin: list, view, decide ─────────────────────────────────────────────────

export const hostFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["pending", "active", "suspended", "rejected"]).optional().catch(undefined),
  subscription: SUBSCRIPTION_FILTER,
});
export type HostFilters = z.infer<typeof hostFilters>;

export type HostRow = {
  id: string;
  referenceId: string;
  userId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  relationship: string;
  status: string;
  verificationStatus: string;
  stays: number;
  liveStays: number;
  bookings: number;
  createdAt: string;
  /** Their own live subscription (a host's partner plan), for staff who can see subscriptions. */
  plan: { name: string; status: string } | null;
};

const HOST_COLUMNS = sql`
  hp.id, hp.reference_id, hp.user_id, u.reference_id AS user_reference_id, u.name, u.email, hp.phone, city.name AS city, hp.relationship,
  hp.status, hp.verification_status, hp.created_at,
  (SELECT count(*) FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id
    WHERE la.agent_user_id = hp.user_id AND la.ended_at IS NULL AND l.transaction_type = 'stay' AND l.deleted_at IS NULL)::int AS stays,
  (SELECT count(*) FROM marketplace.listing_agents la JOIN marketplace.listings l ON l.id = la.listing_id
    WHERE la.agent_user_id = hp.user_id AND la.ended_at IS NULL AND l.transaction_type = 'stay' AND l.status = 'published')::int AS live_stays,
  (SELECT count(*) FROM stays.bookings b WHERE b.host_user_id = hp.user_id)::int AS bookings`;

const toHostRow = (r: Row): HostRow => ({
  id: String(r.id),
  referenceId: String(r.reference_id),
  userId: String(r.user_id),
  userReferenceId: String(r.user_reference_id),
  name: String(r.name),
  email: String(r.email),
  phone: String(r.phone),
  city: (r.city as string) ?? null,
  relationship: String(r.relationship),
  status: String(r.status),
  verificationStatus: String(r.verification_status),
  stays: Number(r.stays),
  liveStays: Number(r.live_stays),
  bookings: Number(r.bookings),
  createdAt: iso(r.created_at)!,
  plan: (r.own_plan as { name: string; status: string } | null) ?? null,
});

export async function listHosts(actor: Actor, filters: HostFilters, page: number): Promise<Page<HostRow>> {
  assertCan(actor, "hosts.view", "platform");
  const where: SQL[] = [sql`TRUE`];
  if (filters.status) where.push(sql`hp.status = ${filters.status}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(hp.reference_id = ${ref} OR u.reference_id = ${ref} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR hp.phone LIKE ${like})`);
  }
  const seesPlans = can(actor, "subscriptions.view", "platform");
  const bySubscription = seesPlans ? subscriptionFilterSql(filters.subscription, sql`hp.user_id`) : null;
  if (bySubscription) where.push(bySubscription);
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT ${HOST_COLUMNS}, ${seesPlans ? ownPlanColumn(sql`hp.user_id`) : sql`NULL AS own_plan`} FROM stays.host_profiles hp JOIN identity.users u ON u.id = hp.user_id
        LEFT JOIN geography.places city ON city.id = hp.city_place_id
       WHERE ${whereSql} ORDER BY (hp.status = 'pending') DESC, hp.created_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM stays.host_profiles hp JOIN identity.users u ON u.id = hp.user_id WHERE ${whereSql}`),
  ]);
  return { rows: (rows.rows as Row[]).map(toHostRow), total: Number((count.rows[0] as Row).n), page, pageSize: take };
}

export type HostDetail = HostRow & {
  about: string | null;
  languages: string[];
  statusReason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  listings: { referenceId: string; title: string; status: string }[];
};

export async function getHost(actor: Actor, referenceId: string): Promise<HostDetail> {
  assertCan(actor, "hosts.view", "platform");
  if (!isReferenceId(referenceId, "HST")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT ${HOST_COLUMNS}, hp.about, hp.languages, hp.status_reason, hp.approved_at, ab.name AS approved_by
      FROM stays.host_profiles hp JOIN identity.users u ON u.id = hp.user_id
      LEFT JOIN geography.places city ON city.id = hp.city_place_id
      LEFT JOIN identity.users ab ON ab.id = hp.approved_by
     WHERE hp.reference_id = ${referenceId}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const listings = await db.execute(sql`
    SELECT l.reference_id, l.title, l.status FROM marketplace.listings l
      JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.ended_at IS NULL AND la.agent_user_id = ${String(r.user_id)}
     WHERE l.transaction_type = 'stay' AND l.deleted_at IS NULL ORDER BY l.updated_at DESC LIMIT 20`);
  return {
    ...toHostRow(r),
    about: (r.about as string) ?? null,
    languages: (r.languages as string[]) ?? [],
    statusReason: (r.status_reason as string) ?? null,
    approvedAt: iso(r.approved_at),
    approvedBy: (r.approved_by as string) ?? null,
    listings: (listings.rows as Row[]).map((l) => ({ referenceId: String(l.reference_id), title: String(l.title), status: String(l.status) })),
  };
}

type Locked = { id: string; referenceId: string; userId: string; status: string; verificationStatus: string; name: string };

async function lockHost(tx: Tx, referenceId: string): Promise<Locked> {
  if (!isReferenceId(referenceId, "HST")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT hp.id, hp.reference_id, hp.user_id, hp.status, hp.verification_status, u.name
      FROM stays.host_profiles hp JOIN identity.users u ON u.id = hp.user_id
     WHERE hp.reference_id = ${referenceId} FOR UPDATE OF hp`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { id: String(r.id), referenceId: String(r.reference_id), userId: String(r.user_id), status: String(r.status), verificationStatus: String(r.verification_status), name: String(r.name) };
}

const target = (h: Locked) => ({ type: "host", id: h.id, referenceId: h.referenceId });
const reasonOf = (reason: unknown, required: boolean) => {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (required && text.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });
  return text.slice(0, 2000) || null;
};

/** The host's personal organization (reusing an independent agent's, if they have one), with the host role. */
async function hostMembership(tx: Tx, actor: Actor, host: Locked): Promise<string> {
  const personal = await tx.execute(sql`
    SELECT o.id FROM orgs.organizations o JOIN orgs.memberships m ON m.organization_id = o.id
     WHERE o.org_type = 'personal' AND m.user_id = ${host.userId} ORDER BY o.created_at LIMIT 1`);
  let organizationId = (personal.rows[0] as Row | undefined)?.id as string | undefined;
  if (!organizationId) {
    const created = await tx.execute(sql`
      INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, created_by)
      VALUES (gen_random_uuid(), ${`${host.name} (host)`}, ${`host-${host.referenceId.toLowerCase()}`}, 'personal', 'active', 'unverified', ${actor.userId})
      RETURNING id`);
    organizationId = String((created.rows[0] as Row).id);
  }
  const membership = await tx.execute(sql`
    INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by)
    VALUES (gen_random_uuid(), ${host.userId}, ${organizationId}, 'active', ${actor.userId})
    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', updated_at = now()
    RETURNING id`);
  await tx.execute(sql`
    INSERT INTO orgs.membership_roles (membership_id, role_id)
    SELECT ${String((membership.rows[0] as Row).id)}, id FROM orgs.roles WHERE organization_id IS NULL AND code = 'host'
    ON CONFLICT DO NOTHING`);
  return organizationId;
}

export async function approveHost(actor: Actor, referenceId: string, options: { verify: boolean }, ctx: RequestContext) {
  assertCan(actor, "hosts.verify", "platform");
  await db.transaction(async (tx) => {
    const host = await lockHost(tx, referenceId);
    if (host.status !== "pending") throw conflict("Only pending applications can be approved.");
    if (host.userId === actor.userId) throw new AppError("FORBIDDEN", "You can't approve your own application.");
    const organizationId = await hostMembership(tx, actor, host);
    const verification = options.verify ? "verified" : "unverified";
    await tx.execute(sql`
      UPDATE stays.host_profiles SET status = 'active', verification_status = ${verification}, status_reason = NULL,
             approved_by = ${actor.userId}, approved_at = now(), status_changed_at = now(), updated_at = now() WHERE id = ${host.id}`);
    await audit(tx, actor, { event: "HOST_APPROVED", target: target(host), organizationId, before: { status: host.status }, after: { status: "active", verificationStatus: verification } }, ctx);
    await notify(tx, [host.userId], {
      type: "host_decision",
      title: "You're approved to host on Trustbrick",
      body: "List your home from your hosting workspace: add photos, a nightly price and house rules, then submit it for review.",
      link: "/properties/new",
    });
  });
}

export async function rejectHost(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "hosts.verify", "platform");
  const reason = reasonOf(rawReason, true);
  await db.transaction(async (tx) => {
    const host = await lockHost(tx, referenceId);
    if (host.status !== "pending") throw conflict("Only pending applications can be rejected.");
    await tx.execute(sql`
      UPDATE stays.host_profiles SET status = 'rejected', verification_status = 'rejected', status_reason = ${reason},
             status_changed_at = now(), updated_at = now() WHERE id = ${host.id}`);
    await audit(tx, actor, { event: "HOST_REJECTED", target: target(host), before: { status: host.status }, after: { status: "rejected" }, metadata: { reason } }, ctx);
    await notify(tx, [host.userId], { type: "host_decision", title: "Your host application was not approved", body: reason ?? undefined, link: "/become-a-host" });
  });
}

export async function setHostVerification(actor: Actor, referenceId: string, verified: boolean, ctx: RequestContext) {
  assertCan(actor, "hosts.verify", "platform");
  await db.transaction(async (tx) => {
    const host = await lockHost(tx, referenceId);
    if (host.status !== "active") throw conflict("Only active hosts can be verified.");
    const next = verified ? "verified" : "unverified";
    if (host.verificationStatus === next) return;
    await tx.execute(sql`UPDATE stays.host_profiles SET verification_status = ${next}, updated_at = now() WHERE id = ${host.id}`);
    await audit(tx, actor, { event: "HOST_VERIFIED", target: target(host), before: { verificationStatus: host.verificationStatus }, after: { verificationStatus: next } }, ctx);
  });
}

/** Suspending a host pauses their live stays. Confirmed bookings stay as they are; admins can cancel them one by one. */
export async function suspendHost(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext): Promise<{ paused: number }> {
  assertCan(actor, "hosts.suspend", "platform");
  const reason = reasonOf(rawReason, true);
  return db.transaction(async (tx) => {
    const host = await lockHost(tx, referenceId);
    if (host.status !== "active") throw conflict("Only active hosts can be suspended.");
    if (host.userId === actor.userId) throw new AppError("FORBIDDEN");
    await tx.execute(sql`UPDATE stays.host_profiles SET status = 'suspended', status_reason = ${reason}, status_changed_at = now(), updated_at = now() WHERE id = ${host.id}`);
    const paused = await pauseListings(tx, sql`la.agent_user_id = ${host.userId} AND l.transaction_type = 'stay'`, HOLD_REASONS.host, actor.userId);
    await audit(tx, actor, { event: "HOST_SUSPENDED", target: target(host), before: { status: "active" }, after: { status: "suspended" }, metadata: { reason, staysPaused: paused } }, ctx);
    await notify(tx, [host.userId], { type: "security", title: "Your hosting is suspended", body: reason ?? undefined });
    return { paused };
  });
}

export async function reinstateHost(actor: Actor, referenceId: string, ctx: RequestContext): Promise<{ resumed: number }> {
  assertCan(actor, "hosts.suspend", "platform");
  return db.transaction(async (tx) => {
    const host = await lockHost(tx, referenceId);
    if (host.status !== "suspended") throw conflict("Only suspended hosts can be reinstated.");
    await tx.execute(sql`UPDATE stays.host_profiles SET status = 'active', status_reason = NULL, status_changed_at = now(), updated_at = now() WHERE id = ${host.id}`);
    const resumed = await resumeListings(tx, sql`la.agent_user_id = ${host.userId} AND l.transaction_type = 'stay'`, actor.userId);
    await audit(tx, actor, { event: "HOST_REINSTATED", target: target(host), before: { status: "suspended" }, after: { status: "active" }, metadata: { staysResumed: resumed } }, ctx);
    await notify(tx, [host.userId], { type: "security", title: "Your hosting is restored", link: "/dashboard" });
    return { resumed };
  });
}

/** Public: what guests see about a host on a stay's page. No contact details. */
export async function publicHost(userId: string): Promise<{ name: string; referenceId: string | null; verified: boolean; since: string; languages: string[]; about: string | null } | null> {
  const { rows } = await db.execute(sql`
    SELECT u.name, u.created_at, hp.reference_id, hp.verification_status, hp.languages, hp.about, hp.approved_at, ap.verification_status AS agent_verification
      FROM identity.users u
      LEFT JOIN stays.host_profiles hp ON hp.user_id = u.id AND hp.status = 'active'
      LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id AND ap.status = 'active'
     WHERE u.id = ${userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    name: String(r.name).split(" ")[0],
    referenceId: (r.reference_id as string) ?? null,
    verified: r.verification_status === "verified" || r.agent_verification === "verified",
    since: iso(r.approved_at ?? r.created_at)!,
    languages: (r.languages as string[]) ?? [],
    about: (r.about as string) ?? null,
  };
}

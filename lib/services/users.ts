import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type RequestContext, audit } from "./audit";
import { HOLD_REASONS, pauseListings, resumeListings } from "./listings/lifecycle";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export const userFilters = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["active", "suspended", "deactivated"]).optional().catch(undefined),
  kind: z.enum(["customer", "agent", "staff"]).optional().catch(undefined),
  verified: z.enum(["yes", "no"]).optional().catch(undefined),
});
export type UserFilters = z.infer<typeof userFilters>;

export type UserRow = {
  id: string;
  referenceId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  status: string;
  intent: string | null;
  isStaff: boolean;
  agentReferenceId: string | null;
  createdAt: string;
  lastActiveAt: string | null;
};

/** Never selects anything from accounts, sessions or verifications beyond timestamps. */
const USER_COLUMNS = sql`
  u.id, u.reference_id, u.name, u.email, u.email_verified, u.phone, u.status, u.intent, u.created_at,
  EXISTS (SELECT 1 FROM orgs.admin_profiles ad WHERE ad.user_id = u.id) AS is_staff,
  (SELECT ap.reference_id FROM orgs.agent_profiles ap WHERE ap.user_id = u.id) AS agent_reference_id,
  (SELECT max(s.updated_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at`;

const toUserRow = (r: Row): UserRow => ({
  id: String(r.id),
  referenceId: String(r.reference_id),
  name: String(r.name),
  email: String(r.email),
  emailVerified: Boolean(r.email_verified),
  phone: (r.phone as string) ?? null,
  status: String(r.status),
  intent: (r.intent as string) ?? null,
  isStaff: Boolean(r.is_staff),
  agentReferenceId: (r.agent_reference_id as string) ?? null,
  createdAt: iso(r.created_at)!,
  lastActiveAt: iso(r.last_active_at),
});

export async function listUsers(actor: Actor, filters: UserFilters, page: number): Promise<Page<UserRow>> {
  assertCan(actor, "users.view", "platform");
  const where: SQL[] = [sql`TRUE`];
  if (filters.status) where.push(sql`u.status = ${filters.status}`);
  if (filters.verified) where.push(sql`u.email_verified = ${filters.verified === "yes"}`);
  if (filters.kind === "staff") where.push(sql`EXISTS (SELECT 1 FROM orgs.admin_profiles ad WHERE ad.user_id = u.id)`);
  if (filters.kind === "agent") where.push(sql`EXISTS (SELECT 1 FROM orgs.agent_profiles ap WHERE ap.user_id = u.id)`);
  if (filters.kind === "customer") {
    where.push(sql`NOT EXISTS (SELECT 1 FROM orgs.admin_profiles ad WHERE ad.user_id = u.id)
                   AND NOT EXISTS (SELECT 1 FROM orgs.agent_profiles ap WHERE ap.user_id = u.id)`);
  }
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(u.reference_id = ${ref} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.phone LIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`SELECT ${USER_COLUMNS} FROM identity.users u WHERE ${whereSql} ORDER BY u.created_at DESC, u.id DESC LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM identity.users u WHERE ${whereSql}`),
  ]);
  return { rows: (rows.rows as Row[]).map(toUserRow), total: Number((count.rows[0] as Row).total), page, pageSize: limit };
}

export type UserDetail = UserRow & {
  statusReason: string | null;
  memberships: { organization: string; organizationReferenceId: string; roles: string[]; status: string }[];
  counts: { bookmarks: number; enquiries: number; reports: number; activeSessions: number };
  bookmarks: { referenceId: string; title: string }[] | null;
};

export async function getUser(actor: Actor, referenceId: string): Promise<UserDetail> {
  assertCan(actor, "users.view", "platform");
  if (!isReferenceId(referenceId, "USR")) throw notFound();
  const { rows } = await db.execute(sql`SELECT ${USER_COLUMNS}, u.status_reason FROM identity.users u WHERE u.reference_id = ${referenceId}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const userId = String(r.id);

  const [memberships, counts, bookmarks] = await Promise.all([
    db.execute(sql`
      SELECT o.name, o.reference_id, m.status, array_agg(ro.name) FILTER (WHERE ro.id IS NOT NULL) AS roles
        FROM orgs.memberships m JOIN orgs.organizations o ON o.id = m.organization_id
        LEFT JOIN orgs.membership_roles mr ON mr.membership_id = m.id LEFT JOIN orgs.roles ro ON ro.id = mr.role_id
       WHERE m.user_id = ${userId} GROUP BY o.name, o.reference_id, m.status`),
    db.execute(sql`SELECT
        (SELECT count(*) FROM marketplace.saved_properties WHERE user_id = ${userId})::int AS bookmarks,
        (SELECT count(*) FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id WHERE c.user_id = ${userId})::int AS enquiries,
        (SELECT count(*) FROM trust.reports WHERE reporter_user_id = ${userId})::int AS reports,
        (SELECT count(*) FROM identity.sessions WHERE user_id = ${userId} AND expires_at > now())::int AS active_sessions`),
    // Saved properties are personal: listed only for admins who may manage users, counted otherwise.
    can(actor, "users.manage", "platform")
      ? db.execute(sql`
          SELECT DISTINCT ON (sp.property_id) l.reference_id, l.title FROM marketplace.saved_properties sp
            JOIN marketplace.listings l ON l.property_id = sp.property_id AND l.deleted_at IS NULL
           WHERE sp.user_id = ${userId} ORDER BY sp.property_id, l.created_at DESC LIMIT 50`)
      : Promise.resolve(null),
  ]);
  const c = counts.rows[0] as Row;
  return {
    ...toUserRow(r),
    statusReason: (r.status_reason as string) ?? null,
    memberships: (memberships.rows as Row[]).map((m) => ({
      organization: String(m.name),
      organizationReferenceId: String(m.reference_id),
      roles: (m.roles as string[]) ?? [],
      status: String(m.status),
    })),
    counts: { bookmarks: Number(c.bookmarks), enquiries: Number(c.enquiries), reports: Number(c.reports), activeSessions: Number(c.active_sessions) },
    bookmarks: bookmarks ? (bookmarks.rows as Row[]).map((b) => ({ referenceId: String(b.reference_id), title: String(b.title) })) : null,
  };
}

async function lockUser(tx: Tx, referenceId: string) {
  if (!isReferenceId(referenceId, "USR")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT u.id, u.reference_id, u.status, u.email_verified, u.name, u.phone,
           EXISTS (SELECT 1 FROM orgs.admin_profiles ad WHERE ad.user_id = u.id) AS is_staff
      FROM identity.users u WHERE u.reference_id = ${referenceId} FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    status: String(r.status),
    emailVerified: Boolean(r.email_verified),
    name: String(r.name),
    phone: (r.phone as string) ?? null,
    isStaff: Boolean(r.is_staff),
  };
}

const target = (u: { id: string; referenceId: string }) => ({ type: "user", id: u.id, referenceId: u.referenceId });

/** Revokes every session. Better Auth reads sessions from the database, so this logs the user out everywhere. */
export async function revokeSessions(tx: Tx, userId: string) {
  await tx.execute(sql`DELETE FROM identity.sessions WHERE user_id = ${userId}`);
}

export async function suspendUser(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext): Promise<{ paused: number }> {
  assertCan(actor, "users.suspend", "platform");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (reason.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, referenceId);
    if (user.id === actor.userId) throw new AppError("FORBIDDEN", "You can't suspend your own account.");
    // Staff accounts are managed under Admins, by someone with admins.manage.
    if (user.isStaff) throw new AppError("FORBIDDEN", "Administrator accounts are managed from the Admins page.");
    if (user.status !== "active") throw conflict("Only active accounts can be suspended.");
    await tx.execute(sql`UPDATE identity.users SET status = 'suspended', status_reason = ${reason}, status_changed_at = now(), updated_at = now() WHERE id = ${user.id}`);
    await revokeSessions(tx, user.id);
    const paused = await pauseListings(tx, sql`la.agent_user_id = ${user.id}`, HOLD_REASONS.user, actor.userId);
    await audit(tx, actor, { event: "USER_SUSPENDED", target: target(user), before: { status: "active" }, after: { status: "suspended" }, metadata: { reason, listingsPaused: paused } }, ctx);
    return { paused };
  });
}

export async function reinstateUser(actor: Actor, referenceId: string, ctx: RequestContext): Promise<{ resumed: number }> {
  assertCan(actor, "users.suspend", "platform");
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, referenceId);
    if (user.isStaff) throw new AppError("FORBIDDEN", "Administrator accounts are managed from the Admins page.");
    if (user.status !== "suspended") throw conflict("Only suspended accounts can be reinstated.");
    await tx.execute(sql`UPDATE identity.users SET status = 'active', status_reason = NULL, status_changed_at = now(), updated_at = now() WHERE id = ${user.id}`);
    const resumed = await resumeListings(tx, sql`la.agent_user_id = ${user.id}`, actor.userId);
    await audit(tx, actor, { event: "USER_REINSTATED", target: target(user), before: { status: "suspended" }, after: { status: "active" }, metadata: { listingsResumed: resumed } }, ctx);
    return { resumed };
  });
}

/** Support can confirm an email on a user's behalf (for example after checking it by phone). */
export async function verifyUserEmail(actor: Actor, referenceId: string, ctx: RequestContext) {
  assertCan(actor, "users.manage", "platform");
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, referenceId);
    if (user.emailVerified) return;
    await tx.execute(sql`UPDATE identity.users SET email_verified = true, updated_at = now() WHERE id = ${user.id}`);
    await audit(tx, actor, { event: "USER_VERIFIED", target: target(user), before: { emailVerified: false }, after: { emailVerified: true } }, ctx);
  });
}

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  phone: z.preprocess((v) => (v === "" ? undefined : typeof v === "string" ? v.replace(/[\s()-]/g, "") : v), z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter 10 to 15 digits").optional()),
});

/** Admin edit: name and phone only. Email and passwords are the user's own to change. */
export async function updateUser(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "users.manage", "platform");
  const parsed = userUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const user = await lockUser(tx, referenceId);
    if (user.isStaff && !can(actor, "admins.manage", "platform")) throw new AppError("FORBIDDEN");
    await tx.execute(sql`UPDATE identity.users SET name = ${parsed.data.name}, phone = ${parsed.data.phone ?? null}, updated_at = now() WHERE id = ${user.id}`);
    await audit(tx, actor, { event: "USER_UPDATED", target: target(user), before: { name: user.name, phone: user.phone }, after: { name: parsed.data.name, phone: parsed.data.phone ?? null } }, ctx);
  });
}

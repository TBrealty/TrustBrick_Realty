import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_GRANTABLE, type Permission, isPermission } from "@/lib/authz/catalog";
import { type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { adminInvitationMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { AppError, conflict, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId } from "@/lib/reference";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { type AcceptInput, INVITATION_TTL_HOURS, guardAcceptance, hashToken, isTokenShape, newInvitationToken, resolveInvitedAccount } from "./invitation-core";
import { notify, notifyPermissionHolders } from "./notifications";
import { confirmPassword } from "./reauth";
import { revokeSessions } from "./users";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const INTERNAL_ORG = sql`(SELECT id FROM orgs.organizations WHERE org_type = 'internal')`;

/** Only grantable permissions survive: admins.* and settings.manage belong to SuperAdmins alone. */
function grantable(codes: unknown): Permission[] {
  const list = Array.isArray(codes) ? codes : [];
  return [...new Set(list.filter((c): c is Permission => isPermission(c) && ADMIN_GRANTABLE.includes(c)))].sort();
}

// ── Listing ──────────────────────────────────────────────────────────────────

export type AdminRow = {
  userId: string;
  referenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  level: "admin" | "superadmin";
  status: string;
  permissions: Permission[];
  createdAt: string;
  lastActiveAt: string | null;
  createdBy: string | null;
};

export async function listAdmins(actor: Actor): Promise<AdminRow[]> {
  assertCan(actor, "admins.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT ad.user_id, ad.reference_id, u.reference_id AS user_reference_id, u.name, u.email, ad.level, m.status, ad.created_at,
           cb.name AS created_by,
           (SELECT max(s.updated_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_active_at,
           coalesce((SELECT array_agg(mp.permission_code ORDER BY mp.permission_code) FROM orgs.membership_permissions mp
                      WHERE mp.membership_id = m.id), '{}') AS permissions
      FROM orgs.admin_profiles ad
      JOIN identity.users u ON u.id = ad.user_id
      JOIN orgs.memberships m ON m.id = ad.membership_id
      LEFT JOIN identity.users cb ON cb.id = ad.created_by
     ORDER BY (ad.level = 'superadmin') DESC, ad.created_at`);
  return (rows as Row[]).map((r) => ({
    userId: String(r.user_id),
    referenceId: String(r.reference_id),
    userReferenceId: String(r.user_reference_id),
    name: String(r.name),
    email: String(r.email),
    level: r.level as AdminRow["level"],
    status: String(r.status),
    permissions: grantable(r.permissions),
    createdAt: iso(r.created_at)!,
    lastActiveAt: iso(r.last_active_at),
    createdBy: (r.created_by as string) ?? null,
  }));
}

export async function getAdmin(actor: Actor, referenceId: string): Promise<AdminRow> {
  const admins = await listAdmins(actor);
  const admin = admins.find((a) => a.referenceId === referenceId);
  if (!admin) throw notFound();
  return admin;
}

export type InvitationRow = {
  referenceId: string;
  email: string;
  name: string | null;
  status: string;
  permissions: Permission[];
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
};

export async function listInvitations(actor: Actor): Promise<InvitationRow[]> {
  assertCan(actor, "admins.view", "platform");
  // Expiry is derived at read time, so there is no background job to forget.
  await db.execute(sql`UPDATE orgs.admin_invitations SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at <= now()`);
  const { rows } = await db.execute(sql`
    SELECT i.reference_id, i.email, i.name, i.status, i.permission_codes, i.created_at, i.expires_at, u.name AS invited_by
      FROM orgs.admin_invitations i JOIN identity.users u ON u.id = i.invited_by
     ORDER BY (i.status = 'pending') DESC, i.created_at DESC LIMIT 100`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    email: String(r.email),
    name: (r.name as string) ?? null,
    status: String(r.status),
    permissions: grantable(r.permission_codes),
    invitedBy: String(r.invited_by),
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at)!,
  }));
}

// ── Inviting ─────────────────────────────────────────────────────────────────

export const inviteSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(120).optional()),
  permissions: z.array(z.string()).min(1, "Choose at least one permission"),
});

export async function inviteAdmin(actor: Actor, raw: unknown, password: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "admins.create", "platform");
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const permissions = grantable(parsed.data.permissions);
  if (permissions.length === 0) throw invalid("Choose at least one permission.", { permissions: "Choose at least one permission" });
  await confirmPassword(actor.userId, password);

  const token = newInvitationToken();
  const result = await db
    .transaction(async (tx) => {
      const staff = await tx.execute(sql`
        SELECT 1 FROM orgs.admin_profiles ad JOIN identity.users u ON u.id = ad.user_id WHERE u.email = ${parsed.data.email}`);
      if (staff.rows[0]) throw conflict("That person is already an administrator.");
      await tx.execute(sql`UPDATE orgs.admin_invitations SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at <= now()`);
      const created = await tx.execute(sql`
        INSERT INTO orgs.admin_invitations (id, email, name, token_hash, permission_codes, invited_by, expires_at)
        VALUES (gen_random_uuid(), ${parsed.data.email}, ${parsed.data.name ?? null}, ${hashToken(token)},
                ${sql.param(permissions)}::text[], ${actor.userId}, now() + ${`${INVITATION_TTL_HOURS} hours`}::interval)
        RETURNING id, reference_id`);
      const inv = created.rows[0] as Row;
      await audit(
        tx,
        actor,
        { event: "ADMIN_INVITED", target: { type: "invitation", id: String(inv.id), referenceId: String(inv.reference_id) }, metadata: { email: parsed.data.email, permissions } },
        ctx,
      );
      await notifyPermissionHolders(tx, "admins.view", { type: "admin_invited", title: `${parsed.data.email} was invited as an admin`, link: "/admins" }, actor.userId);
      return { referenceId: String(inv.reference_id) };
    })
    .catch((error) => {
      if (isUniqueViolation(error)) throw conflict("That email already has a pending invitation. Revoke it first to send a new one.");
      throw error;
    });

  const url = new URL(`/invite/${token}`, env.BETTER_AUTH_URL).toString();
  void sendEmail(adminInvitationMessage(parsed.data.email, actor.name, url, INVITATION_TTL_HOURS)).catch((e) => log.error("email.invite_failed", { error: String(e) }));
  return result;
}

export async function revokeInvitation(actor: Actor, referenceId: string, ctx: RequestContext) {
  assertCan(actor, "admins.create", "platform");
  if (!isReferenceId(referenceId, "INV")) throw notFound();
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      UPDATE orgs.admin_invitations SET status = 'revoked', revoked_at = now(), revoked_by = ${actor.userId}, updated_at = now()
       WHERE reference_id = ${referenceId} AND status = 'pending' RETURNING id, email`);
    const r = rows[0] as Row | undefined;
    if (!r) throw conflict("Only pending invitations can be revoked.");
    await audit(tx, actor, { event: "ADMIN_INVITATION_REVOKED", target: { type: "invitation", id: String(r.id), referenceId }, metadata: { email: r.email } }, ctx);
  });
}

// ── Accepting ────────────────────────────────────────────────────────────────

export type InvitationPreview = { email: string; name: string | null; invitedBy: string; expiresAt: string; accountExists: boolean };

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  if (!isTokenShape(token)) return null;
  const { rows } = await db.execute(sql`
    SELECT i.email, i.name, i.expires_at, u.name AS invited_by,
           EXISTS (SELECT 1 FROM identity.users x WHERE x.email = i.email) AS account_exists
      FROM orgs.admin_invitations i JOIN identity.users u ON u.id = i.invited_by
     WHERE i.token_hash = ${hashToken(token)} AND i.status = 'pending' AND i.expires_at > now()`);
  const r = rows[0] as Row | undefined;
  return r ? { email: String(r.email), name: (r.name as string) ?? null, invitedBy: String(r.invited_by), expiresAt: iso(r.expires_at)!, accountExists: Boolean(r.account_exists) } : null;
}

/**
 * Accepts an admin invitation. Everything happens in one transaction: either the person
 * becomes an admin with exactly the invited permissions, or nothing changes.
 */
export async function acceptInvitation(token: string, input: AcceptInput, ctx: RequestContext): Promise<{ email: string; createdAccount: boolean }> {
  await guardAcceptance(token, input.ipKey);

  return db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT id, reference_id, email, permission_codes, invited_by, status, expires_at > now() AS live
        FROM orgs.admin_invitations WHERE token_hash = ${hashToken(token)} FOR UPDATE`);
    const inv = found.rows[0] as Row | undefined;
    if (!inv || inv.status !== "pending" || !inv.live) throw notFound("This invitation has expired or was already used. Ask for a new one.");
    const email = String(inv.email);
    const { userId, referenceId: userReferenceId, createdAccount } = await resolveInvitedAccount(tx, email, input);

    const membership = await tx.execute(sql`
      INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by)
      VALUES (gen_random_uuid(), ${userId}, ${INTERNAL_ORG}, 'active', ${String(inv.invited_by)})
      ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', updated_at = now()
      RETURNING id`);
    const membershipId = String((membership.rows[0] as Row).id);
    await tx.execute(sql`
      INSERT INTO orgs.membership_roles (membership_id, role_id)
      SELECT ${membershipId}, id FROM orgs.roles WHERE organization_id IS NULL AND code = 'admin' ON CONFLICT DO NOTHING`);
    const permissions = grantable(inv.permission_codes);
    await tx.execute(sql`DELETE FROM orgs.membership_permissions WHERE membership_id = ${membershipId}`);
    for (const code of permissions) {
      await tx.execute(sql`
        INSERT INTO orgs.membership_permissions (membership_id, permission_code, scope, granted_by)
        VALUES (${membershipId}, ${code}, 'platform', ${String(inv.invited_by)})`);
    }
    const profile = await tx.execute(sql`
      INSERT INTO orgs.admin_profiles (id, reference_id, user_id, membership_id, level, created_by)
      VALUES (gen_random_uuid(), platform.gen_reference_id('ADM'), ${userId}, ${membershipId}, 'admin', ${String(inv.invited_by)})
      RETURNING id, reference_id`);
    await tx.execute(sql`
      UPDATE orgs.admin_invitations SET status = 'accepted', accepted_at = now(), accepted_user_id = ${userId}, updated_at = now()
       WHERE id = ${String(inv.id)}`);

    const person: PersonActor = { kind: "person", userId, referenceId: userReferenceId, role: "admin" };
    const created = profile.rows[0] as Row;
    await audit(
      tx,
      person,
      {
        event: "ADMIN_CREATED",
        target: { type: "admin", id: String(created.id), referenceId: String(created.reference_id) },
        metadata: { invitation: inv.reference_id, invitedBy: inv.invited_by, permissions, createdAccount },
      },
      ctx,
    );
    await notify(tx, [String(inv.invited_by)], { type: "admin_invited", title: `${email} accepted the admin invitation`, link: `/admins/${created.reference_id}` });
    return { email, createdAccount };
  });
}

// ── Managing admins (SuperAdmin) ─────────────────────────────────────────────

async function lockAdmin(tx: Tx, actor: Actor, referenceId: string) {
  if (!isReferenceId(referenceId, "ADM") && !isReferenceId(referenceId, "SADM")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ad.id, ad.reference_id, ad.user_id, ad.level, ad.membership_id, m.status
      FROM orgs.admin_profiles ad JOIN orgs.memberships m ON m.id = ad.membership_id
     WHERE ad.reference_id = ${referenceId} FOR UPDATE OF m`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  // SuperAdmins are managed only by the bootstrap script, and nobody manages their own access.
  if (r.level !== "admin") throw new AppError("FORBIDDEN", "SuperAdmin access can't be changed here.");
  if (String(r.user_id) === actor.userId) throw new AppError("FORBIDDEN", "You can't change your own access.");
  return { id: String(r.id), referenceId: String(r.reference_id), userId: String(r.user_id), membershipId: String(r.membership_id), status: String(r.status) };
}

export async function setAdminPermissions(actor: Actor, referenceId: string, rawPermissions: unknown, password: unknown, ctx: RequestContext) {
  assertCan(actor, "admins.manage", "platform");
  const next = grantable(rawPermissions);
  await confirmPassword(actor.userId, password);
  await db.transaction(async (tx) => {
    const admin = await lockAdmin(tx, actor, referenceId);
    const current = await tx.execute(sql`SELECT permission_code FROM orgs.membership_permissions WHERE membership_id = ${admin.membershipId} ORDER BY 1`);
    const before = grantable((current.rows as Row[]).map((r) => r.permission_code));
    if (before.join() === next.join()) return;
    await tx.execute(sql`DELETE FROM orgs.membership_permissions WHERE membership_id = ${admin.membershipId}`);
    for (const code of next) {
      await tx.execute(sql`
        INSERT INTO orgs.membership_permissions (membership_id, permission_code, scope, granted_by)
        VALUES (${admin.membershipId}, ${code}, 'platform', ${actor.userId})`);
    }
    await audit(
      tx,
      actor,
      {
        event: "ADMIN_PERMISSION_CHANGED",
        target: { type: "admin", id: admin.id, referenceId: admin.referenceId },
        before: { permissions: before },
        after: { permissions: next },
        metadata: { added: next.filter((p) => !before.includes(p)), removed: before.filter((p) => !next.includes(p)) },
      },
      ctx,
    );
    await notify(tx, [admin.userId], { type: "admin_access_changed", title: "Your administrator permissions changed", link: "/profile" });
  });
}

export async function suspendAdmin(actor: Actor, referenceId: string, rawReason: unknown, password: unknown, ctx: RequestContext) {
  assertCan(actor, "admins.manage", "platform");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (reason.length < 10) throw invalid("Give a reason of at least 10 characters.", { reason: "Give a reason of at least 10 characters" });
  await confirmPassword(actor.userId, password);
  await db.transaction(async (tx) => {
    const admin = await lockAdmin(tx, actor, referenceId);
    if (admin.status !== "active") throw conflict("Only active admins can be suspended.");
    await tx.execute(sql`UPDATE orgs.memberships SET status = 'suspended', status_reason = ${reason}, updated_at = now() WHERE id = ${admin.membershipId}`);
    // Staff sessions are revoked outright: a suspended admin is logged out everywhere, now.
    await revokeSessions(tx, admin.userId);
    await audit(tx, actor, { event: "ADMIN_SUSPENDED", target: { type: "admin", id: admin.id, referenceId: admin.referenceId }, before: { status: "active" }, after: { status: "suspended" }, metadata: { reason } }, ctx);
    await notify(tx, [admin.userId], { type: "admin_access_changed", title: "Your administrator access is suspended", body: reason });
  });
}

export async function reinstateAdmin(actor: Actor, referenceId: string, password: unknown, ctx: RequestContext) {
  assertCan(actor, "admins.manage", "platform");
  await confirmPassword(actor.userId, password);
  await db.transaction(async (tx) => {
    const admin = await lockAdmin(tx, actor, referenceId);
    if (admin.status !== "suspended") throw conflict("Only suspended admins can be reinstated.");
    await tx.execute(sql`UPDATE orgs.memberships SET status = 'active', status_reason = NULL, updated_at = now() WHERE id = ${admin.membershipId}`);
    await audit(tx, actor, { event: "ADMIN_REINSTATED", target: { type: "admin", id: admin.id, referenceId: admin.referenceId }, before: { status: "suspended" }, after: { status: "active" } }, ctx);
    await notify(tx, [admin.userId], { type: "admin_access_changed", title: "Your administrator access is restored", link: "/dashboard" });
  });
}

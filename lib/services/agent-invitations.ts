import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { INVITED_AGENT_ROLES } from "@/lib/db/schema/orgs";
import { sendEmail } from "@/lib/email/send";
import { agentInvitationMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { createAgentMembership, phone } from "./agents";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { type AcceptInput, INVITATION_TTL_HOURS, guardAcceptance, hashToken, isTokenShape, newInvitationToken, resolveInvitedAccount } from "./invitation-core";
import { notify } from "./notifications";

/**
 * Admins create agents (docs/portals/README.md §6). The admin enters the agent's details and
 * where they work; the agent gets a one-time link, and only when they accept do their
 * account, AGT- profile and workspace exist. Customers can still apply at /become-an-agent,
 * which an admin approves; both paths end with an admin's decision.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const ROLE_LABELS: Record<(typeof INVITED_AGENT_ROLES)[number], string> = { agent: "Agent", broker_admin: "Broker admin" };

export const agentInviteSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the agent's name").max(120),
    email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
    phone,
    cityId: z.uuid({ message: "Choose the city they work in" }),
    reraAgentNumber: optional(z.string().trim().max(60)),
    experienceYears: optional(z.coerce.number().int().min(0).max(70)),
    organizationReference: z.preprocess(
      (v) => (typeof v === "string" && v.trim() ? normalizeReferenceId(v) : undefined),
      z.string().refine((v) => isReferenceId(v, "ORG"), "Enter an organization reference like ORG-7K4M9Q2X").optional(),
    ),
    role: z.enum(INVITED_AGENT_ROLES).catch("agent"),
    verified: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  })
  .refine((v) => v.role === "agent" || v.organizationReference, {
    path: ["organizationReference"],
    message: "A broker admin runs an organization. Enter its reference.",
  });

export async function inviteAgent(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "agents.create", "platform");
  const parsed = agentInviteSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;

  const token = newInvitationToken();
  const result = await db
    .transaction(async (tx) => {
      const city = await tx.execute(sql`SELECT id FROM geography.places WHERE id = ${input.cityId} AND place_type = 'city' AND is_active`);
      if (!city.rows[0]) throw invalid("Choose the city they work in.", { cityId: "Choose the city they work in" });

      let organization: { id: string; name: string } | null = null;
      if (input.organizationReference) {
        const org = await tx.execute(sql`
          SELECT id, name FROM orgs.organizations WHERE reference_id = ${input.organizationReference}
             AND status = 'active' AND org_type IN ('brokerage', 'developer', 'property_manager', 'pg_operator') AND deleted_at IS NULL`);
        const o = org.rows[0] as Row | undefined;
        if (!o) throw invalid("We couldn't find an active organization with that reference.", { organizationReference: "No active organization has this reference" });
        organization = { id: String(o.id), name: String(o.name) };
      }

      const person = await tx.execute(sql`
        SELECT ap.reference_id AS agent_ref, ap.status AS agent_status, ad.id AS admin_id
          FROM identity.users u
          LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
          LEFT JOIN orgs.admin_profiles ad ON ad.user_id = u.id
         WHERE u.email = ${input.email}`);
      const p = person.rows[0] as Row | undefined;
      if (p?.admin_id) throw conflict("That person is an administrator. Staff can't also be agents.");
      if (p?.agent_status === "pending") throw conflict(`That person has already applied (${p.agent_ref}). Review the application in Approvals instead.`);
      if (p?.agent_status && p.agent_status !== "rejected") throw conflict(`That person is already an agent (${p.agent_ref}).`);

      await tx.execute(sql`UPDATE orgs.agent_invitations SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at <= now()`);
      const created = await tx.execute(sql`
        INSERT INTO orgs.agent_invitations (id, email, name, phone, city_place_id, rera_agent_number, experience_years,
                                            organization_id, role_code, verified, token_hash, invited_by, expires_at)
        VALUES (gen_random_uuid(), ${input.email}, ${input.name}, ${input.phone}, ${input.cityId}, ${input.reraAgentNumber ?? null},
                ${input.experienceYears ?? null}, ${organization?.id ?? null}, ${input.role}, ${input.verified}, ${hashToken(token)},
                ${actor.userId}, now() + ${`${INVITATION_TTL_HOURS} hours`}::interval)
        RETURNING id, reference_id`);
      const inv = created.rows[0] as Row;
      await audit(
        tx,
        actor,
        {
          event: "AGENT_INVITED",
          target: { type: "invitation", id: String(inv.id), referenceId: String(inv.reference_id) },
          organizationId: organization?.id ?? null,
          metadata: { email: input.email, role: input.role, verified: input.verified, organization: input.organizationReference ?? null },
        },
        ctx,
      );
      return { referenceId: String(inv.reference_id), organization: organization?.name ?? null };
    })
    .catch((error) => {
      if (isUniqueViolation(error)) throw conflict("That email already has a pending agent invitation. Revoke it first to send a new one.");
      throw error;
    });

  const url = new URL(`/invite/${token}`, env.BETTER_AUTH_URL).toString();
  void sendEmail(agentInvitationMessage(input.email, actor.name, result.organization, url, INVITATION_TTL_HOURS)).catch((e) =>
    log.error("email.agent_invite_failed", { error: String(e) }),
  );
  return { referenceId: result.referenceId };
}

export type AgentInvitationRow = {
  referenceId: string;
  name: string;
  email: string;
  role: string;
  organization: string | null;
  verified: boolean;
  status: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
};

export async function listAgentInvitations(actor: Actor): Promise<AgentInvitationRow[]> {
  assertCan(actor, "agents.view", "platform");
  await db.execute(sql`UPDATE orgs.agent_invitations SET status = 'expired', updated_at = now() WHERE status = 'pending' AND expires_at <= now()`);
  const { rows } = await db.execute(sql`
    SELECT i.reference_id, i.name, i.email, i.role_code, i.verified, i.status, i.created_at, i.expires_at,
           o.name AS organization, u.name AS invited_by
      FROM orgs.agent_invitations i
      JOIN identity.users u ON u.id = i.invited_by
      LEFT JOIN orgs.organizations o ON o.id = i.organization_id
     WHERE i.status IN ('pending', 'expired', 'revoked') AND i.created_at > now() - interval '30 days'
     ORDER BY (i.status = 'pending') DESC, i.created_at DESC LIMIT 50`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    name: String(r.name),
    email: String(r.email),
    role: ROLE_LABELS[r.role_code as keyof typeof ROLE_LABELS] ?? String(r.role_code),
    organization: (r.organization as string) ?? null,
    verified: Boolean(r.verified),
    status: String(r.status),
    invitedBy: String(r.invited_by),
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at)!,
  }));
}

export async function revokeAgentInvitation(actor: Actor, referenceId: string, ctx: RequestContext) {
  assertCan(actor, "agents.create", "platform");
  if (!isReferenceId(referenceId, "INV")) throw notFound();
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      UPDATE orgs.agent_invitations SET status = 'revoked', revoked_at = now(), revoked_by = ${actor.userId}, updated_at = now()
       WHERE reference_id = ${referenceId} AND status = 'pending' RETURNING id, email`);
    const r = rows[0] as Row | undefined;
    if (!r) throw conflict("Only pending invitations can be revoked.");
    await audit(tx, actor, { event: "AGENT_INVITATION_REVOKED", target: { type: "invitation", id: String(r.id), referenceId }, metadata: { email: r.email } }, ctx);
  });
}

// ── Accepting ────────────────────────────────────────────────────────────────

export type AgentInvitationPreview = {
  email: string;
  name: string;
  invitedBy: string;
  expiresAt: string;
  accountExists: boolean;
  organization: string | null;
  role: string;
};

export async function previewAgentInvitation(token: string): Promise<AgentInvitationPreview | null> {
  if (!isTokenShape(token)) return null;
  const { rows } = await db.execute(sql`
    SELECT i.email, i.name, i.expires_at, i.role_code, u.name AS invited_by, o.name AS organization,
           EXISTS (SELECT 1 FROM identity.users x WHERE x.email = i.email) AS account_exists
      FROM orgs.agent_invitations i
      JOIN identity.users u ON u.id = i.invited_by
      LEFT JOIN orgs.organizations o ON o.id = i.organization_id
     WHERE i.token_hash = ${hashToken(token)} AND i.status = 'pending' AND i.expires_at > now()`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    email: String(r.email),
    name: String(r.name),
    invitedBy: String(r.invited_by),
    expiresAt: iso(r.expires_at)!,
    accountExists: Boolean(r.account_exists),
    organization: (r.organization as string) ?? null,
    role: ROLE_LABELS[r.role_code as keyof typeof ROLE_LABELS] ?? String(r.role_code),
  };
}

/**
 * Accepts an agent invitation in one transaction: the account (if new), the active agent
 * profile with the details the admin entered, and the workspace membership all appear
 * together, or nothing changes.
 */
export async function acceptAgentInvitation(token: string, input: AcceptInput, ctx: RequestContext): Promise<{ email: string; createdAccount: boolean }> {
  await guardAcceptance(token, input.ipKey);

  return db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT id, reference_id, email, name, phone, city_place_id, rera_agent_number, experience_years, organization_id,
             role_code, verified, invited_by, status, expires_at > now() AS live
        FROM orgs.agent_invitations WHERE token_hash = ${hashToken(token)} FOR UPDATE`);
    const inv = found.rows[0] as Row | undefined;
    if (!inv || inv.status !== "pending" || !inv.live) throw notFound("This invitation has expired or was already used. Ask for a new one.");
    const email = String(inv.email);
    const invitedBy = String(inv.invited_by);
    const account = await resolveInvitedAccount(tx, email, { ...input, name: input.name ?? inv.name });

    const staff = await tx.execute(sql`SELECT 1 FROM orgs.admin_profiles WHERE user_id = ${account.userId}`);
    if (staff.rows[0]) throw conflict("Administrators can't also be agents.");
    const prior = await tx.execute(sql`SELECT id, status FROM orgs.agent_profiles WHERE user_id = ${account.userId} FOR UPDATE`);
    const existing = prior.rows[0] as Row | undefined;
    if (existing && existing.status !== "rejected") throw conflict("You already have an agent profile.");

    const verification = inv.verified ? "verified" : "unverified";
    const details = sql`${String(inv.phone)}, ${(inv.rera_agent_number as string) ?? null}, ${(inv.city_place_id as string) ?? null},
                        ${inv.experience_years === null ? null : Number(inv.experience_years)}, ${(inv.organization_id as string) ?? null}`;
    const saved = existing
      ? await tx.execute(sql`
          UPDATE orgs.agent_profiles
             SET (phone, rera_agent_number, city_place_id, experience_years, requested_organization_id) = (${details}),
                 status = 'active', verification_status = ${verification}, status_reason = NULL, status_changed_at = now(),
                 approved_by = ${invitedBy}, approved_at = now(), updated_at = now()
           WHERE id = ${String(existing.id)} RETURNING id, reference_id`)
      : await tx.execute(sql`
          INSERT INTO orgs.agent_profiles (id, user_id, phone, rera_agent_number, city_place_id, experience_years, requested_organization_id,
                                           status, verification_status, approved_by, approved_at, status_changed_at)
          VALUES (gen_random_uuid(), ${account.userId}, ${details}, 'active', ${verification}, ${invitedBy}, now(), now())
          RETURNING id, reference_id`);
    const profile = saved.rows[0] as Row;
    const agentReferenceId = String(profile.reference_id);

    const nameRow = await tx.execute(sql`SELECT name FROM identity.users WHERE id = ${account.userId}`);
    const organizationId = await createAgentMembership(
      tx,
      invitedBy,
      { userId: account.userId, name: String((nameRow.rows[0] as Row).name), referenceId: agentReferenceId },
      (inv.organization_id as string) ?? null,
      inv.role_code as "agent" | "broker_admin",
    );
    await tx.execute(sql`
      UPDATE orgs.agent_invitations SET status = 'accepted', accepted_at = now(), accepted_user_id = ${account.userId}, updated_at = now()
       WHERE id = ${String(inv.id)}`);

    const person: PersonActor = { kind: "person", userId: account.userId, referenceId: account.referenceId, role: "agent" };
    await audit(
      tx,
      person,
      {
        event: "AGENT_CREATED",
        target: { type: "agent", id: String(profile.id), referenceId: agentReferenceId },
        organizationId,
        after: { status: "active", verificationStatus: verification, role: inv.role_code },
        metadata: { invitation: inv.reference_id, invitedBy, createdAccount: account.createdAccount },
      },
      ctx,
    );
    await notify(tx, [invitedBy], { type: "agent_invite_accepted", title: `${email} accepted the agent invitation`, link: `/agents/${agentReferenceId}` });
    return { email, createdAccount: account.createdAccount };
  });
}

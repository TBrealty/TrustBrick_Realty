import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { seal, unseal } from "@/lib/crypto/sealed";
import { sendEmail } from "@/lib/email/send";
import { noticeMessage } from "@/lib/email/templates";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { paymentDriver } from "@/lib/payments";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { storage } from "@/lib/storage";
import { sniff } from "@/lib/storage/sniff";
import { type BankAccountStatus, OWNERSHIP_PROOF_KINDS, type OwnershipProofKind, type PropertyLandlordStatus } from "@/lib/vocab";
import { type PersonActor, type RequestContext, audit } from "../audit";
import { type AcceptInput, INVITATION_TTL_HOURS, guardAcceptance, hashToken, isTokenShape, newInvitationToken, resolveInvitedAccount } from "../invitation-core";
import { notify, notifyPermissionHolders } from "../notifications";
import { BANKS, IFSC, PAN, type Row, VPA, absoluteUrl, iso, maskPan, maskVpa, namesMatch, phoneSchema, rentListing } from "./common";
import { refreshSettlements } from "./settlement-holds";

/**
 * Landlords (lib/db/schema/rent.ts). An agent adds a property's landlord in one of two ways:
 *
 * - "Add new landlord": a one-time sign-up link for someone who doesn't receive rent through
 *   Trustbrick yet. It works only for the email the agent entered, once, for 72 hours. The agent
 *   shares it (WhatsApp, SMS) and it's emailed too.
 * - "Add existing landlord": someone who already does is found by their exact email, phone or LND-
 *   reference, and accepts the property in their dashboard. No link travels.
 *
 * Either way the landlord ends up with a workspace (their personal organization, the landlord role)
 * listing "My properties". Before any rent reaches them they upload proof of ownership, which a
 * Trustbrick admin approves, and give a bank account, which is verified.
 */

export const OWNERSHIP_PROOF_LABELS: Record<OwnershipProofKind, string> = {
  sale_deed: "Sale deed",
  property_tax_receipt: "Property tax receipt",
  allotment_letter: "Allotment or possession letter",
  electricity_bill: "Electricity bill in your name",
  other: "Other proof of ownership",
};

export const PROPERTY_LANDLORD_LABELS: Record<PropertyLandlordStatus, string> = {
  awaiting_proof: "Proof of ownership needed",
  under_review: "Proof being checked",
  approved: "Ownership approved",
  rejected: "Proof not accepted",
  ended: "No longer the landlord",
};

const PROOF_MAX_BYTES = 10 * 1024 * 1024;
/** After a bank account changes, settlements wait this long: time for the landlord to notice if it wasn't them. */
const BANK_CHANGE_HOLD_HOURS = 48;

const person = (userId: string, referenceId: string, role: string): PersonActor => ({ kind: "person", userId, referenceId, role });

// ── The landlord's workspace ─────────────────────────────────────────────────

/**
 * Makes someone a landlord: their LND- profile, and the landlord role in their personal
 * organization (reusing one they already have, as an independent agent or host).
 */
export async function ensureLandlord(tx: Tx, userId: string, phone: string | null): Promise<{ referenceId: string; membershipId: string }> {
  const profile = await tx.execute(sql`
    INSERT INTO rent.landlord_profiles (id, user_id, phone) VALUES (gen_random_uuid(), ${userId}, ${phone})
    ON CONFLICT (user_id) DO UPDATE SET phone = coalesce(rent.landlord_profiles.phone, EXCLUDED.phone), updated_at = now()
    RETURNING reference_id`);
  const user = (await tx.execute(sql`SELECT name, reference_id FROM identity.users WHERE id = ${userId}`)).rows[0] as Row;
  const personal = await tx.execute(sql`
    SELECT o.id FROM orgs.organizations o JOIN orgs.memberships m ON m.organization_id = o.id
     WHERE o.org_type = 'personal' AND m.user_id = ${userId} ORDER BY o.created_at LIMIT 1`);
  let organizationId = (personal.rows[0] as Row | undefined)?.id as string | undefined;
  if (!organizationId) {
    const created = await tx.execute(sql`
      INSERT INTO orgs.organizations (id, name, slug, org_type, status, verification_status, created_by)
      VALUES (gen_random_uuid(), ${`${user.name} (landlord)`}, ${`landlord-${String(user.reference_id).toLowerCase()}`}, 'personal', 'active', 'unverified', ${userId})
      RETURNING id`);
    organizationId = String((created.rows[0] as Row).id);
  }
  const membership = await tx.execute(sql`
    INSERT INTO orgs.memberships (id, user_id, organization_id, status, created_by)
    VALUES (gen_random_uuid(), ${userId}, ${organizationId}, 'active', ${userId})
    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', updated_at = now()
    RETURNING id`);
  const membershipId = String((membership.rows[0] as Row).id);
  await tx.execute(sql`
    INSERT INTO orgs.membership_roles (membership_id, role_id)
    SELECT ${membershipId}, id FROM orgs.roles WHERE organization_id IS NULL AND code = 'landlord'
    ON CONFLICT DO NOTHING`);
  return { referenceId: String((profile.rows[0] as Row).reference_id), membershipId };
}

/** Links a landlord to a property, waiting for proof of ownership. Fails if it already has one. */
async function linkLandlord(tx: Tx, propertyId: string, landlordUserId: string, invitationId: string) {
  const current = await tx.execute(sql`SELECT 1 FROM rent.property_landlords WHERE property_id = ${propertyId} AND status <> 'ended'`);
  if (current.rows.length) throw conflict("This property already has a landlord. Ask the agent to remove them first.");
  await tx.execute(sql`
    INSERT INTO rent.property_landlords (id, property_id, landlord_user_id, invitation_id, status)
    VALUES (gen_random_uuid(), ${propertyId}, ${landlordUserId}, ${invitationId}, 'awaiting_proof')`);
}

// ── The agent's side ─────────────────────────────────────────────────────────

export type LandlordPanel = {
  landlord: {
    name: string;
    email: string;
    referenceId: string;
    status: PropertyLandlordStatus;
    statusLabel: string;
    reviewNote: string | null;
    bank: "verified" | "pending" | "failed" | "missing";
    since: string;
  } | null;
  invitation: { referenceId: string; kind: "new" | "existing"; name: string; email: string; expiresAt: string; expired: boolean; sentAt: string } | null;
};

/** What the agent sees about a property's landlord. Call it only for a listing found in the agent's scope. */
export async function landlordPanel(propertyId: string): Promise<LandlordPanel> {
  const [link, invite] = await Promise.all([
    db.execute(sql`
      SELECT pl.status, pl.review_note, pl.created_at, u.name, u.email, lp.reference_id, ba.status AS bank_status
        FROM rent.property_landlords pl JOIN identity.users u ON u.id = pl.landlord_user_id
        JOIN rent.landlord_profiles lp ON lp.user_id = pl.landlord_user_id
        LEFT JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = pl.landlord_user_id
       WHERE pl.property_id = ${propertyId} AND pl.status <> 'ended'`),
    db.execute(sql`
      SELECT reference_id, kind, name, email, expires_at, created_at, updated_at, expires_at < now() AS expired
        FROM rent.landlord_invitations WHERE property_id = ${propertyId} AND status = 'pending'`),
  ]);
  const l = link.rows[0] as Row | undefined;
  const i = invite.rows[0] as Row | undefined;
  return {
    landlord: l
      ? {
          name: String(l.name),
          email: String(l.email),
          referenceId: String(l.reference_id),
          status: l.status as PropertyLandlordStatus,
          statusLabel: PROPERTY_LANDLORD_LABELS[l.status as PropertyLandlordStatus],
          reviewNote: (l.review_note as string) ?? null,
          bank: l.bank_status ? (l.bank_status as "verified" | "pending" | "failed") : "missing",
          since: iso(l.created_at)!,
        }
      : null,
    invitation: i
      ? {
          referenceId: String(i.reference_id),
          kind: i.kind as "new" | "existing",
          name: String(i.name),
          email: String(i.email),
          expiresAt: iso(i.expires_at)!,
          expired: Boolean(i.expired),
          sentAt: iso(i.updated_at)!,
        }
      : null,
  };
}

const newLandlordSchema = z.object({
  name: z.string().trim().min(1, "Enter the landlord's name").max(120),
  email: z.email("Enter a valid email").transform((v) => v.trim().toLowerCase()),
  phone: phoneSchema,
});

/** Nothing else may be under way: no current landlord, no waiting invitation. */
async function assertNoLandlord(tx: Tx, propertyId: string) {
  const current = await tx.execute(sql`
    SELECT u.name FROM rent.property_landlords pl JOIN identity.users u ON u.id = pl.landlord_user_id WHERE pl.property_id = ${propertyId} AND pl.status <> 'ended'`);
  if (current.rows[0]) throw conflict(`This property's landlord is already ${(current.rows[0] as Row).name}. Remove them first to add someone else.`);
  // An invitation that ran out no longer blocks a new one.
  await tx.execute(sql`UPDATE rent.landlord_invitations SET status = 'expired', updated_at = now() WHERE property_id = ${propertyId} AND status = 'pending' AND expires_at < now()`);
  const waiting = await tx.execute(sql`SELECT email FROM rent.landlord_invitations WHERE property_id = ${propertyId} AND status = 'pending'`);
  if (waiting.rows[0]) throw conflict(`An invitation to ${(waiting.rows[0] as Row).email} is still waiting. Cancel it first, or send them a new link.`);
}

/** Nobody manages a property and collects its rent: the agent and Trustbrick staff can't be its landlord. */
async function assertCanBeLandlord(tx: Tx, actor: Actor, userId: string) {
  if (userId === actor.userId) throw invalid("You can't be the landlord of a property you manage.", { email: "That's your own account" });
  const staff = await tx.execute(sql`SELECT 1 FROM orgs.admin_profiles WHERE user_id = ${userId}`);
  if (staff.rows.length) throw invalid("Trustbrick staff can't be landlords.", { email: "This account belongs to Trustbrick staff" });
}

/**
 * "Add new landlord": a one-time sign-up link for that email. Returned for the agent to share, and
 * emailed. Someone who already receives rent through Trustbrick is sent to "Add existing landlord".
 */
export async function inviteNewLandlord(actor: Actor, listingReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string; url: string; email: string; expiresAt: string }> {
  assertCan(actor, "landlords.invite");
  const parsed = newLandlordSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const token = newInvitationToken();
  const result = await db.transaction(async (tx) => {
    const listing = await rentListing(actor, listingReferenceId, "landlords.invite", tx);
    await assertNoLandlord(tx, listing.propertyId);
    const existing = await tx.execute(sql`
      SELECT u.id, lp.id AS landlord_id FROM identity.users u LEFT JOIN rent.landlord_profiles lp ON lp.user_id = u.id WHERE u.email = ${input.email}`);
    const e = existing.rows[0] as Row | undefined;
    if (e) {
      await assertCanBeLandlord(tx, actor, String(e.id));
      if (e.landlord_id) throw invalid(`${input.email} is already a Trustbrick landlord. Use "Add existing landlord" instead.`, { email: "Already a landlord: use Add existing landlord" });
    }
    const inserted = await tx.execute(sql`
      INSERT INTO rent.landlord_invitations (id, kind, property_id, listing_id, name, email, phone, token_hash, expires_at, invited_by, organization_id)
      VALUES (gen_random_uuid(), 'new', ${listing.propertyId}, ${listing.id}, ${input.name}, ${input.email}, ${input.phone}, ${hashToken(token)},
              now() + ${`${INVITATION_TTL_HOURS} hours`}::interval, ${actor.userId}, ${actor.organization.id})
      RETURNING reference_id, expires_at`);
    const r = inserted.rows[0] as Row;
    await audit(tx, actor, { event: "LANDLORD_INVITED", target: { type: "landlord_invitation", referenceId: String(r.reference_id) }, organizationId: actor.organization.id, metadata: { kind: "new", listing: listing.referenceId, property: listing.propertyReferenceId } }, ctx);
    return { referenceId: String(r.reference_id), expiresAt: iso(r.expires_at)!, title: listing.title };
  });
  const url = absoluteUrl(`/invite/landlord/${token}`);
  await emailNewLandlord(input.email, input.name, actor.name, result.title, url);
  return { referenceId: result.referenceId, url, email: input.email, expiresAt: result.expiresAt };
}

async function emailNewLandlord(email: string, name: string, agentName: string, title: string, url: string) {
  try {
    await sendEmail(
      noticeMessage(email, {
        subject: `${agentName} added you as the landlord of ${title}`,
        heading: "Receive your rent through Trustbrick",
        lines: [
          `Hi ${name.split(" ")[0]},`,
          `${agentName} added you as the landlord of ${title} on Trustbrick. Your tenant will pay the rent online, and Trustbrick pays it into your bank account.`,
          `Create your account to see the property, add your bank account and upload proof that you own it. The link works only for this email, once, for ${INVITATION_TTL_HOURS} hours.`,
        ],
        action: { label: "Create your account", url },
      }),
    );
  } catch (e) {
    log.warn("rent.landlord_email_failed", { error: String(e) });
  }
}

const existingLandlordSchema = z.object({ who: z.string().trim().min(3, "Enter their email, phone or landlord ID").max(160) });

/**
 * "Add existing landlord": found by their exact email, phone or LND- reference (never a search, so
 * agents can't browse landlords), then asked in their dashboard.
 */
export async function inviteExistingLandlord(actor: Actor, listingReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string; landlordName: string }> {
  assertCan(actor, "landlords.invite");
  const parsed = existingLandlordSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const who = parsed.data.who;
  const ref = normalizeReferenceId(who);
  const phone = who.replace(/[\s()-]/g, "");
  const result = await db.transaction(async (tx) => {
    const listing = await rentListing(actor, listingReferenceId, "landlords.invite", tx);
    await assertNoLandlord(tx, listing.propertyId);
    const found = await tx.execute(sql`
      SELECT u.id, u.name, u.email, u.status FROM rent.landlord_profiles lp JOIN identity.users u ON u.id = lp.user_id
       WHERE ${isReferenceId(ref, "LND") ? sql`lp.reference_id = ${ref}` : who.includes("@") ? sql`u.email = ${who.toLowerCase()}` : sql`(lp.phone = ${phone} OR right(lp.phone, 10) = right(${phone}, 10))`}
       LIMIT 2`);
    if (found.rows.length !== 1) {
      throw invalid("No Trustbrick landlord has that email, phone or landlord ID. If they haven't received rent through Trustbrick before, use \"Add new landlord\".", {
        who: "No landlord found",
      });
    }
    const l = found.rows[0] as Row;
    if (l.status !== "active") throw invalid("That landlord's account is suspended.", { who: "Account suspended" });
    await assertCanBeLandlord(tx, actor, String(l.id));
    const inserted = await tx.execute(sql`
      INSERT INTO rent.landlord_invitations (id, kind, property_id, listing_id, name, email, landlord_user_id, expires_at, invited_by, organization_id)
      VALUES (gen_random_uuid(), 'existing', ${listing.propertyId}, ${listing.id}, ${String(l.name)}, ${String(l.email)}, ${String(l.id)},
              now() + ${`${INVITATION_TTL_HOURS} hours`}::interval, ${actor.userId}, ${actor.organization.id})
      RETURNING reference_id`);
    const referenceId = String((inserted.rows[0] as Row).reference_id);
    await notify(tx, [String(l.id)], {
      type: "rent_landlord",
      title: `${actor.name} added ${listing.title} to your properties`,
      body: "Accept it in My properties if you're its landlord, or decline it if not.",
      link: "/my-properties",
    });
    await audit(tx, actor, { event: "LANDLORD_INVITED", target: { type: "landlord_invitation", referenceId }, organizationId: actor.organization.id, metadata: { kind: "existing", listing: listing.referenceId, property: listing.propertyReferenceId } }, ctx);
    return { referenceId, landlordName: String(l.name), email: String(l.email), title: listing.title };
  });
  try {
    await sendEmail(
      noticeMessage(result.email, {
        subject: `Is ${result.title} yours? ${actor.name} added it to your properties`,
        heading: "A property was added to your account",
        lines: [
          `${actor.name} added ${result.title} to your properties on Trustbrick, so its rent can be paid to you.`,
          "If you're its landlord, accept it in My properties. If not, decline it. Nothing changes until you do.",
        ],
        action: { label: "Open My properties", url: absoluteUrl("/my-properties") },
      }),
    );
  } catch (e) {
    log.warn("rent.landlord_email_failed", { error: String(e) });
  }
  return { referenceId: result.referenceId, landlordName: result.landlordName };
}

async function lockInvitationForAgent(tx: Tx, actor: Actor, invitationReferenceId: string) {
  if (!isReferenceId(invitationReferenceId, "LIN")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT i.id, i.kind, i.status, i.email, i.name, i.landlord_user_id, l.reference_id AS listing_ref
      FROM rent.landlord_invitations i JOIN marketplace.listings l ON l.id = i.listing_id
     WHERE i.reference_id = ${invitationReferenceId} FOR UPDATE OF i`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  // The agent must still have the listing in scope.
  const listing = await rentListing(actor, String(r.listing_ref), "landlords.invite", tx);
  return Object.assign(r, { listing });
}

/** Sends a fresh link (a new token; the old one stops working) and another 72 hours. */
export async function resendLandlordInvitation(actor: Actor, invitationReferenceId: string, ctx: RequestContext): Promise<{ url: string | null; email: string }> {
  assertCan(actor, "landlords.invite");
  const token = newInvitationToken();
  const r = await db.transaction(async (tx) => {
    const i = await lockInvitationForAgent(tx, actor, normalizeReferenceId(invitationReferenceId));
    if (i.status !== "pending") throw conflict("This invitation was already answered or cancelled.");
    await tx.execute(sql`
      UPDATE rent.landlord_invitations SET ${i.kind === "new" ? sql`token_hash = ${hashToken(token)},` : sql``}
             expires_at = now() + ${`${INVITATION_TTL_HOURS} hours`}::interval, updated_at = now()
       WHERE id = ${String(i.id)}`);
    if (i.kind === "existing") {
      await notify(tx, [String(i.landlord_user_id)], { type: "rent_landlord", title: `Reminder: ${actor.name} added ${i.listing.title} to your properties`, link: "/my-properties" });
    }
    await audit(tx, actor, { event: "LANDLORD_INVITATION_RESENT", target: { type: "landlord_invitation", referenceId: normalizeReferenceId(invitationReferenceId) }, organizationId: actor.organization.id }, ctx);
    return i;
  });
  if (r.kind === "new") {
    const url = absoluteUrl(`/invite/landlord/${token}`);
    await emailNewLandlord(String(r.email), String(r.name), actor.name, r.listing.title, url);
    return { url, email: String(r.email) };
  }
  return { url: null, email: String(r.email) };
}

export async function revokeLandlordInvitation(actor: Actor, invitationReferenceId: string, ctx: RequestContext) {
  assertCan(actor, "landlords.invite");
  await db.transaction(async (tx) => {
    const i = await lockInvitationForAgent(tx, actor, normalizeReferenceId(invitationReferenceId));
    if (i.status !== "pending") throw conflict("This invitation was already answered or cancelled.");
    await tx.execute(sql`UPDATE rent.landlord_invitations SET status = 'revoked', responded_at = now(), updated_at = now() WHERE id = ${String(i.id)}`);
    await audit(tx, actor, { event: "LANDLORD_INVITATION_REVOKED", target: { type: "landlord_invitation", referenceId: normalizeReferenceId(invitationReferenceId) }, organizationId: actor.organization.id }, ctx);
  });
}

const reasonSchema = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

/**
 * The property's landlord stops being its landlord (sold, or added by mistake). Only while no
 * tenancy is running: end that first. Rent already paid is still settled to them.
 */
export async function removeLandlord(actor: Actor, listingReferenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "landlords.invite");
  const reason = reasonSchema.safeParse(rawReason);
  if (!reason.success) throw invalid(reason.error.issues[0].message, { reason: reason.error.issues[0].message });
  await db.transaction(async (tx) => {
    const listing = await rentListing(actor, listingReferenceId, "landlords.invite", tx);
    const { rows } = await tx.execute(sql`SELECT id, landlord_user_id FROM rent.property_landlords WHERE property_id = ${listing.propertyId} AND status <> 'ended' FOR UPDATE`);
    const link = rows[0] as Row | undefined;
    if (!link) throw conflict("This property has no landlord.");
    const running = await tx.execute(sql`SELECT 1 FROM rent.tenancies WHERE property_landlord_id = ${String(link.id)} AND status IN ('pending', 'disputed', 'active')`);
    if (running.rows.length) throw conflict("End or cancel the tenancy first.");
    await tx.execute(sql`
      UPDATE rent.property_landlords SET status = 'ended', ended_at = now(), ended_by = ${actor.userId}, end_reason = ${reason.data}, updated_at = now() WHERE id = ${String(link.id)}`);
    await tx.execute(sql`UPDATE real_estate.properties SET owner_user_id = NULL, updated_at = now() WHERE id = ${listing.propertyId} AND owner_user_id = ${String(link.landlord_user_id)} AND organization_id IS NOT NULL`);
    await notify(tx, [String(link.landlord_user_id)], { type: "rent_landlord", title: `You're no longer listed as the landlord of ${listing.title}`, body: reason.data, link: "/my-properties" });
    await audit(tx, actor, { event: "LANDLORD_REMOVED", target: { type: "property", referenceId: listing.propertyReferenceId }, organizationId: actor.organization.id, metadata: { reason: reason.data } }, ctx);
  });
}

// ── The invited landlord ─────────────────────────────────────────────────────

export type LandlordInvitationPreview = { email: string; name: string; phone: string | null; invitedBy: string; title: string; place: string; expiresAt: Date; accountExists: boolean };

/** What the sign-up page shows for a valid, unused, unexpired link; null for anything else. */
export async function previewLandlordInvitation(token: string): Promise<LandlordInvitationPreview | null> {
  if (!isTokenShape(token)) return null;
  const { rows } = await db.execute(sql`
    SELECT i.email, i.name, i.phone, i.expires_at, iu.name AS invited_by, l.title, pc.name AS place, EXISTS (SELECT 1 FROM identity.users u WHERE u.email = i.email) AS account_exists
      FROM rent.landlord_invitations i JOIN identity.users iu ON iu.id = i.invited_by
      JOIN real_estate.properties p ON p.id = i.property_id JOIN geography.addresses a ON a.id = p.address_id JOIN geography.places pc ON pc.id = a.place_id
      LEFT JOIN marketplace.listings l ON l.id = i.listing_id
     WHERE i.token_hash = ${hashToken(token)} AND i.kind = 'new' AND i.status = 'pending' AND i.expires_at > now()`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    email: String(r.email),
    name: String(r.name),
    phone: (r.phone as string) ?? null,
    invitedBy: String(r.invited_by),
    title: String(r.title ?? "A property"),
    place: String(r.place),
    expiresAt: new Date(r.expires_at as string),
    accountExists: Boolean(r.account_exists),
  };
}

/**
 * Accepting a sign-up link: the account is created (its email confirmed by the link) or the person
 * logs in as that email; they become a landlord, and the property is theirs, waiting for proof.
 */
export async function acceptLandlordInvitation(token: string, input: AcceptInput & { phone?: unknown; confirm?: unknown }, ctx: RequestContext): Promise<{ createdAccount: boolean; membershipId: string }> {
  await guardAcceptance(token, input.ipKey);
  const result = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT i.id, i.reference_id, i.email, i.phone, i.property_id, i.invited_by, i.status, i.expires_at < now() AS expired, l.title
        FROM rent.landlord_invitations i LEFT JOIN marketplace.listings l ON l.id = i.listing_id
       WHERE i.token_hash = ${hashToken(token)} AND i.kind = 'new' FOR UPDATE OF i`);
    const i = rows[0] as Row | undefined;
    if (!i || i.status !== "pending" || i.expired) throw notFound("This link isn't valid any more. Ask your agent to send a new one.");
    const email = String(i.email);
    const hasAccount = (await tx.execute(sql`SELECT 1 FROM identity.users WHERE email = ${email}`)).rows.length > 0;
    let phone: string | null = (i.phone as string) ?? null;
    if (!hasAccount) {
      const errors: Record<string, string> = {};
      const p = phoneSchema.safeParse(input.phone ?? "");
      if (!p.success) errors.phone = p.error.issues[0].message;
      else phone = p.data;
      if (typeof input.password !== "string" || input.password !== input.confirm) errors.confirm = "The passwords don't match";
      if (Object.keys(errors).length) throw invalid("Please check the highlighted fields.", errors);
    }
    const account = await resolveInvitedAccount(tx, email, input);
    if (!hasAccount && phone) await tx.execute(sql`UPDATE identity.users SET phone = coalesce(phone, ${phone}) WHERE id = ${account.userId}`);
    const landlord = await ensureLandlord(tx, account.userId, phone);
    await linkLandlord(tx, String(i.property_id), account.userId, String(i.id));
    await tx.execute(sql`
      UPDATE rent.landlord_invitations SET status = 'accepted', landlord_user_id = ${account.userId}, responded_at = now(), updated_at = now() WHERE id = ${String(i.id)}`);
    await notify(tx, [String(i.invited_by)], { type: "rent_landlord", title: `${email} accepted: they're now the landlord of ${i.title ?? "the property"}`, body: "Next, they upload proof of ownership and add a bank account." });
    await audit(tx, person(account.userId, account.referenceId, "landlord"), { event: "LANDLORD_LINKED", target: { type: "landlord_invitation", referenceId: String(i.reference_id) }, metadata: { landlord: landlord.referenceId, createdAccount: account.createdAccount } }, ctx);
    return { createdAccount: account.createdAccount, membershipId: landlord.membershipId };
  });
  return result;
}

/** An existing landlord answers a request in their dashboard. */
export async function respondToLandlordRequest(userId: string, userReferenceId: string, invitationReferenceId: string, accept: boolean, ctx: RequestContext) {
  const ref = normalizeReferenceId(invitationReferenceId);
  if (!isReferenceId(ref, "LIN")) throw notFound();
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT i.id, i.property_id, i.invited_by, i.status, i.expires_at < now() AS expired, l.title
        FROM rent.landlord_invitations i LEFT JOIN marketplace.listings l ON l.id = i.listing_id
       WHERE i.reference_id = ${ref} AND i.kind = 'existing' AND i.landlord_user_id = ${userId} FOR UPDATE OF i`);
    const i = rows[0] as Row | undefined;
    if (!i) throw notFound();
    if (i.status !== "pending") throw conflict("This was already answered or cancelled.");
    if (i.expired) throw conflict("This request ran out. Ask the agent to send it again.");
    if (accept) {
      await ensureLandlord(tx, userId, null);
      await linkLandlord(tx, String(i.property_id), userId, String(i.id));
    }
    await tx.execute(sql`UPDATE rent.landlord_invitations SET status = ${accept ? "accepted" : "declined"}, responded_at = now(), updated_at = now() WHERE id = ${String(i.id)}`);
    const name = (await tx.execute(sql`SELECT name FROM identity.users WHERE id = ${userId}`)).rows[0] as Row;
    await notify(tx, [String(i.invited_by)], {
      type: "rent_landlord",
      title: accept ? `${name.name} accepted: they're now the landlord of ${i.title}` : `${name.name} declined to be the landlord of ${i.title}`,
    });
    await audit(tx, person(userId, userReferenceId, "landlord"), { event: accept ? "LANDLORD_LINKED" : "LANDLORD_REQUEST_DECLINED", target: { type: "landlord_invitation", referenceId: ref } }, ctx);
  });
}

// ── The landlord's dashboard ─────────────────────────────────────────────────

export type LandlordProperty = {
  linkId: string;
  propertyReferenceId: string;
  title: string;
  address: string;
  status: PropertyLandlordStatus;
  statusLabel: string;
  reviewNote: string | null;
  proof: { kind: OwnershipProofKind; label: string; filename: string | null; uploadedAt: string } | null;
  agentName: string | null;
  since: string;
};

export type LandlordHome = {
  referenceId: string;
  name: string;
  email: string;
  panMasked: string | null;
  bank: BankAccountView | null;
  requests: { referenceId: string; title: string; address: string; agentName: string; expiresAt: string }[];
  properties: LandlordProperty[];
};

export type BankAccountView = {
  method: "bank" | "upi";
  holderName: string;
  bankName: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  upiMasked: string | null;
  status: BankAccountStatus;
  statusReason: string | null;
  nameAtBank: string | null;
  verifiedAt: string | null;
  holdUntil: string | null;
  updatedAt: string;
};

const PROPERTY_SQL = sql`
  coalesce((SELECT l.title FROM marketplace.listings l WHERE l.property_id = p.id AND l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 1), 'A property') AS title,
  concat_ws(', ', nullif(a.line1, ''), pc.name) AS address`;
const PROPERTY_JOINS = sql`JOIN geography.addresses a ON a.id = p.address_id JOIN geography.places pc ON pc.id = a.place_id`;

export async function bankAccountFor(landlordUserId: string, tx: DbOrTx = db): Promise<BankAccountView | null> {
  const { rows } = await tx.execute(sql`SELECT * FROM rent.landlord_bank_accounts WHERE landlord_user_id = ${landlordUserId}`);
  const b = rows[0] as Row | undefined;
  if (!b) return null;
  return {
    method: b.method as "bank" | "upi",
    holderName: String(b.holder_name),
    bankName: (b.bank_name as string) ?? null,
    accountLast4: (b.account_last4 as string) ?? null,
    ifsc: (b.ifsc as string) ?? null,
    upiMasked: (b.upi_masked as string) ?? null,
    status: b.status as BankAccountStatus,
    statusReason: (b.status_reason as string) ?? null,
    nameAtBank: (b.name_at_bank as string) ?? null,
    verifiedAt: iso(b.verified_at),
    holdUntil: b.hold_until && new Date(b.hold_until as string) > new Date() ? iso(b.hold_until) : null,
    updatedAt: iso(b.updated_at)!,
  };
}

export async function landlordProperties(landlordUserId: string, propertyReferenceId?: string): Promise<LandlordProperty[]> {
  const { rows } = await db.execute(sql`
    SELECT pl.id, pl.status, pl.review_note, pl.proof_kind, pl.proof_filename, pl.proof_uploaded_at, pl.created_at, p.reference_id, ${PROPERTY_SQL},
           (SELECT u.name FROM rent.landlord_invitations i JOIN identity.users u ON u.id = i.invited_by WHERE i.id = pl.invitation_id) AS agent_name
      FROM rent.property_landlords pl JOIN real_estate.properties p ON p.id = pl.property_id ${PROPERTY_JOINS}
     WHERE pl.landlord_user_id = ${landlordUserId} AND pl.status <> 'ended' ${propertyReferenceId ? sql`AND p.reference_id = ${propertyReferenceId}` : sql``}
     ORDER BY pl.created_at DESC`);
  return (rows as Row[]).map((r) => ({
    linkId: String(r.id),
    propertyReferenceId: String(r.reference_id),
    title: String(r.title),
    address: String(r.address),
    status: r.status as PropertyLandlordStatus,
    statusLabel: PROPERTY_LANDLORD_LABELS[r.status as PropertyLandlordStatus],
    reviewNote: (r.review_note as string) ?? null,
    proof: r.proof_kind
      ? { kind: r.proof_kind as OwnershipProofKind, label: OWNERSHIP_PROOF_LABELS[r.proof_kind as OwnershipProofKind], filename: (r.proof_filename as string) ?? null, uploadedAt: iso(r.proof_uploaded_at)! }
      : null,
    agentName: (r.agent_name as string) ?? null,
    since: iso(r.created_at)!,
  }));
}

export async function landlordHome(actor: Actor): Promise<LandlordHome> {
  assertCan(actor, "rent.receive");
  const [profile, bank, requests, properties] = await Promise.all([
    db.execute(sql`SELECT lp.reference_id, lp.pan_masked, u.name, u.email FROM rent.landlord_profiles lp JOIN identity.users u ON u.id = lp.user_id WHERE lp.user_id = ${actor.userId}`),
    bankAccountFor(actor.userId),
    db.execute(sql`
      SELECT i.reference_id, i.expires_at, iu.name AS agent_name, ${PROPERTY_SQL}
        FROM rent.landlord_invitations i JOIN identity.users iu ON iu.id = i.invited_by JOIN real_estate.properties p ON p.id = i.property_id ${PROPERTY_JOINS}
       WHERE i.landlord_user_id = ${actor.userId} AND i.kind = 'existing' AND i.status = 'pending' AND i.expires_at > now()
       ORDER BY i.created_at DESC`),
    landlordProperties(actor.userId),
  ]);
  const p = profile.rows[0] as Row | undefined;
  if (!p) throw notFound();
  return {
    referenceId: String(p.reference_id),
    name: String(p.name),
    email: String(p.email),
    panMasked: (p.pan_masked as string) ?? null,
    bank,
    requests: (requests.rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), title: String(r.title), address: String(r.address), agentName: String(r.agent_name), expiresAt: iso(r.expires_at)! })),
    properties,
  };
}

const panSchema = z.object({ pan: z.string().trim().toUpperCase().regex(PAN, "A PAN is 10 characters, like ABCDE1234F") });

/** The landlord's PAN: shown on their tenants' rent receipts, which an HRA claim needs above ₹1 lakh a year. */
export async function saveLandlordPan(actor: Actor, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.receive");
  const parsed = panSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const pan = parsed.data.pan;
  await db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE rent.landlord_profiles SET pan_sealed = ${seal(pan)}, pan_masked = ${maskPan(pan)}, updated_at = now() WHERE user_id = ${actor.userId} RETURNING reference_id`);
    if (!updated.rows[0]) throw notFound();
    await audit(tx, actor, { event: "LANDLORD_PAN_CHANGED", target: { type: "landlord", referenceId: String((updated.rows[0] as Row).reference_id) }, after: { pan: maskPan(pan) } }, ctx);
  });
}

export const bankAccountSchema = z
  .object({
    method: z.enum(["bank", "upi"], { message: "Choose a bank account or UPI" }),
    holderName: z.string().trim().min(2, "Enter the name on the account").max(120),
    accountNumber: z.string().trim().optional(),
    confirmAccountNumber: z.string().trim().optional(),
    ifsc: z.string().trim().toUpperCase().optional(),
    vpa: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === "bank") {
      if (!v.accountNumber || !/^[0-9]{9,18}$/.test(v.accountNumber)) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "An account number is 9 to 18 digits" });
      else if (v.accountNumber !== v.confirmAccountNumber) ctx.addIssue({ code: "custom", path: ["confirmAccountNumber"], message: "The account numbers don't match" });
      if (!v.ifsc || !IFSC.test(v.ifsc)) ctx.addIssue({ code: "custom", path: ["ifsc"], message: "An IFSC is 11 characters, like HDFC0001234" });
    } else if (!v.vpa || !VPA.test(v.vpa)) {
      ctx.addIssue({ code: "custom", path: ["vpa"], message: "Enter a UPI ID like name@bank" });
    }
  });

/**
 * Adds or replaces where the landlord's rent is settled. Checked with the provider (a ₹1 deposit or
 * the UPI directory) where one is connected, and the name it holds must match the landlord's;
 * otherwise a Trustbrick admin verifies it. A change holds settlements for 48 hours and the landlord
 * is told, in case it wasn't them.
 */
export async function saveLandlordBankAccount(actor: Actor, raw: unknown, ctx: RequestContext): Promise<BankAccountView> {
  assertCan(actor, "rent.receive");
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const landlordName = String(((await db.execute(sql`SELECT name FROM identity.users WHERE id = ${actor.userId}`)).rows[0] as Row).name);
  if (!namesMatch(v.holderName, landlordName)) {
    throw invalid(`The account must be in your own name (${landlordName}).`, { holderName: `Use an account in your name, ${landlordName}` });
  }

  // Ask the provider before writing anything (never inside a transaction).
  let status: BankAccountStatus = "pending";
  let reason: string | null = "Trustbrick will check this account before paying rent into it.";
  let nameAtBank: string | null = null;
  const driver = paymentDriver();
  if (driver) {
    try {
      const check = await driver.verifyBankAccount(v.method === "bank" ? { holder: v.holderName, accountNumber: v.accountNumber!, ifsc: v.ifsc! } : { holder: v.holderName, vpa: v.vpa! });
      nameAtBank = check.nameAtBank;
      if (!check.valid) {
        status = "failed";
        reason = check.reason ?? "The bank couldn't verify this account.";
      } else if (check.nameAtBank && !namesMatch(check.nameAtBank, landlordName)) {
        status = "failed";
        reason = `The bank has this account in the name of ${check.nameAtBank}, not ${landlordName}.`;
      } else {
        status = "verified";
        reason = null;
      }
    } catch (e) {
      log.warn("rent.bank_check_failed", { error: String(e) });
      reason = "We couldn't reach the bank to check this account. Trustbrick will check it.";
    }
  }
  if (status === "failed") throw invalid(reason ?? "The bank couldn't verify this account.", v.method === "bank" ? { accountNumber: reason ?? "" } : { vpa: reason ?? "" });

  const bankName = v.method === "bank" ? (BANKS[v.ifsc!.slice(0, 4)] ?? null) : null;
  const changed = await db.transaction(async (tx) => {
    const before = await tx.execute(sql`SELECT method, account_last4, ifsc, upi_masked, status FROM rent.landlord_bank_accounts WHERE landlord_user_id = ${actor.userId} FOR UPDATE`);
    const b = before.rows[0] as Row | undefined;
    // A first account needs no wait; a change of a verified one does.
    const hold = b && b.status === "verified" ? sql`now() + ${`${BANK_CHANGE_HOLD_HOURS} hours`}::interval` : sql`NULL`;
    const values =
      v.method === "bank"
        ? { account: seal(v.accountNumber!), last4: v.accountNumber!.slice(-4), ifsc: v.ifsc!, upi: null, upiMasked: null }
        : { account: null, last4: null, ifsc: null, upi: seal(v.vpa!.toLowerCase()), upiMasked: maskVpa(v.vpa!.toLowerCase()) };
    await tx.execute(sql`
      INSERT INTO rent.landlord_bank_accounts (id, landlord_user_id, method, holder_name, bank_name, account_sealed, account_last4, ifsc, upi_sealed, upi_masked,
                                               status, status_reason, name_at_bank, verified_at, hold_until)
      VALUES (gen_random_uuid(), ${actor.userId}, ${v.method}, ${v.holderName}, ${bankName}, ${values.account}, ${values.last4}, ${values.ifsc}, ${values.upi}, ${values.upiMasked},
              ${status}, ${reason}, ${nameAtBank}, ${status === "verified" ? sql`now()` : sql`NULL`}, ${hold})
      ON CONFLICT (landlord_user_id) DO UPDATE SET method = EXCLUDED.method, holder_name = EXCLUDED.holder_name, bank_name = EXCLUDED.bank_name,
             account_sealed = EXCLUDED.account_sealed, account_last4 = EXCLUDED.account_last4, ifsc = EXCLUDED.ifsc, upi_sealed = EXCLUDED.upi_sealed,
             upi_masked = EXCLUDED.upi_masked, status = EXCLUDED.status, status_reason = EXCLUDED.status_reason, name_at_bank = EXCLUDED.name_at_bank,
             verified_at = EXCLUDED.verified_at, verified_by = NULL, hold_until = EXCLUDED.hold_until, updated_at = now()`);
    await refreshSettlements(tx, { landlordUserId: actor.userId });
    if (status === "pending") {
      await notifyPermissionHolders(tx, "rent.manage", { type: "rent_review", title: `${landlordName}'s bank account needs checking`, link: "/rent-collection?tab=banks" });
    }
    if (b) {
      await notify(tx, [actor.userId], {
        type: "security",
        title: "Your bank account for rent was changed",
        body: `Rent will now go to ${v.method === "bank" ? `the account ending ${values.last4}` : values.upiMasked}. If you didn't do this, contact Trustbrick at once.`,
        link: "/bank-account",
      });
    }
    await audit(
      tx,
      actor,
      {
        event: "LANDLORD_BANK_ACCOUNT_CHANGED",
        target: { type: "landlord_bank_account", referenceId: actor.userReferenceId },
        before: b ? { method: b.method, last4: b.account_last4, ifsc: b.ifsc, upi: b.upi_masked } : undefined,
        after: { method: v.method, last4: values.last4, ifsc: values.ifsc, upi: values.upiMasked, status },
      },
      ctx,
    );
    return Boolean(b);
  });
  if (changed) {
    try {
      await sendEmail(
        noticeMessage(actor.email, {
          subject: "Your bank account for rent was changed",
          heading: "Your bank account was changed",
          lines: [
            `Rent will now be paid into ${v.method === "bank" ? `the account ending ${v.accountNumber!.slice(-4)}` : maskVpa(v.vpa!)}.`,
            `For your safety, rent waits ${BANK_CHANGE_HOLD_HOURS} hours before it's paid into a changed account.`,
            "If you didn't make this change, reply to this email or contact Trustbrick straight away.",
          ],
          action: { label: "Check your bank account", url: absoluteUrl("/bank-account") },
        }),
      );
    } catch (e) {
      log.warn("rent.bank_email_failed", { error: String(e) });
    }
  }
  return (await bankAccountFor(actor.userId))!;
}

// ── Proof of ownership ───────────────────────────────────────────────────────

/**
 * The landlord uploads proof that they own the property (a PDF or a photo, up to 10 MB). It goes to
 * a Trustbrick admin to approve. It can be replaced until it's approved.
 */
export async function uploadOwnershipProof(actor: Actor, propertyReferenceId: string, rawKind: unknown, file: { bytes: Buffer; filename: string }, ctx: RequestContext) {
  assertCan(actor, "rent.receive");
  const ref = normalizeReferenceId(propertyReferenceId);
  if (!isReferenceId(ref, "PRP")) throw notFound();
  const kind = (OWNERSHIP_PROOF_KINDS as readonly string[]).includes(String(rawKind)) ? (String(rawKind) as OwnershipProofKind) : null;
  if (!kind) throw invalid("Choose what the document is.", { kind: "Choose what the document is" });
  if (file.bytes.byteLength === 0) throw invalid("Choose a file to upload.", { file: "Choose a file" });
  if (file.bytes.byteLength > PROOF_MAX_BYTES) throw invalid("The file is larger than 10 MB.", { file: "Up to 10 MB" });
  const type = sniff(file.bytes.subarray(0, 32));
  if (!type || (type.family !== "pdf" && !["image/jpeg", "image/png", "image/webp"].includes(type.mime))) {
    throw invalid("Upload a PDF, JPEG or PNG.", { file: "A PDF, JPEG or PNG" });
  }

  const link = await db.execute(sql`
    SELECT pl.id, pl.status, pl.proof_storage_key FROM rent.property_landlords pl JOIN real_estate.properties p ON p.id = pl.property_id
     WHERE p.reference_id = ${ref} AND pl.landlord_user_id = ${actor.userId} AND pl.status <> 'ended'`);
  const l = link.rows[0] as Row | undefined;
  if (!l) throw notFound();
  if (l.status === "approved") throw conflict("Your ownership is already approved.");

  const key = `rent/proofs/${String(l.id)}/${randomBytes(12).toString("hex")}.${type.ext}`;
  await storage().put(key, file.bytes);
  const filename = file.filename.replace(/[^\w .()-]/g, "_").slice(0, 120) || `proof.${type.ext}`;
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        UPDATE rent.property_landlords SET status = 'under_review', proof_kind = ${kind}, proof_storage_key = ${key}, proof_mime_type = ${type.mime},
               proof_filename = ${filename}, proof_size_bytes = ${file.bytes.byteLength}, proof_uploaded_at = now(), review_note = NULL, updated_at = now()
         WHERE id = ${String(l.id)} AND status IN ('awaiting_proof', 'under_review', 'rejected') RETURNING id`);
      if (!updated.rows[0]) throw conflict("Your ownership is already approved.");
      await notifyPermissionHolders(tx, "rent.manage", { type: "rent_review", title: `${actor.name} uploaded proof of ownership for ${ref}`, link: "/rent-collection?tab=proofs" });
      await audit(tx, actor, { event: "OWNERSHIP_PROOF_UPLOADED", target: { type: "property", referenceId: ref }, metadata: { kind, sizeBytes: file.bytes.byteLength } }, ctx);
    });
  } catch (e) {
    await storage().remove([key]).catch(() => {});
    throw e;
  }
  if (l.proof_storage_key) await storage().remove([String(l.proof_storage_key)]).catch((e) => log.warn("rent.proof_cleanup_failed", { error: String(e) }));
}

/** A proof document, for its landlord or a Trustbrick admin who checks proofs. Null for anyone else. */
export async function ownershipProofForServing(viewer: { userId: string; actor: Actor | null }, linkId: string): Promise<{ key: string; mimeType: string; filename: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) return null;
  const { rows } = await db.execute(sql`SELECT landlord_user_id, proof_storage_key, proof_mime_type, proof_filename FROM rent.property_landlords WHERE id = ${linkId}`);
  const r = rows[0] as Row | undefined;
  if (!r?.proof_storage_key) return null;
  const own = String(r.landlord_user_id) === viewer.userId;
  const staff = viewer.actor ? can(viewer.actor, "rent.view", "platform") : false;
  if (!own && !staff) return null;
  return { key: String(r.proof_storage_key), mimeType: String(r.proof_mime_type), filename: String(r.proof_filename ?? "proof") };
}

/** Reads a sealed bank account in full, for the back office. Every read is audited by the caller. */
export function revealBankDetails(row: { account_sealed?: unknown; upi_sealed?: unknown }): { accountNumber: string | null; vpa: string | null } {
  try {
    return {
      accountNumber: row.account_sealed ? unseal(String(row.account_sealed)) : null,
      vpa: row.upi_sealed ? unseal(String(row.upi_sealed)) : null,
    };
  } catch (e) {
    log.error("rent.unseal_failed", { error: String(e) });
    throw new AppError("CONFLICT", "These bank details can't be read on this server (the encryption key doesn't match).");
  }
}

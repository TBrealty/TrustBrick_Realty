import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { noticeMessage } from "@/lib/email/templates";
import { conflict, invalid, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import type { TenancyStatus } from "@/lib/vocab";
import { type PersonActor, type RequestContext, audit } from "../audit";
import { type AcceptInput, INVITATION_TTL_HOURS, guardAcceptance, hashToken, isTokenShape, newInvitationToken, resolveInvitedAccount } from "../invitation-core";
import { notify } from "../notifications";
import { type Row, TODAY_IST, absoluteUrl, day, iso, num, phoneSchema, rentListing } from "./common";

/**
 * Tenancies (lib/db/schema/rent.ts). The agent sets one up for a property with a landlord: the
 * tenant, the monthly rent, the day it's due, the deposit and the dates. The tenant accepts with a
 * one-time link (for that email only) and the landlord confirms the terms in their dashboard, or
 * disputes them and the agent corrects them. Once both have, it's active: rent falls due each month
 * from the first due day on or after both the start date and the day it became active (rent before
 * that was settled between them).
 */

export const TENANCY_STATUS_LABELS: Record<TenancyStatus, string> = {
  pending: "Waiting for the tenant and landlord",
  disputed: "Landlord disagrees with the terms",
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const tenancyFields = z.object({
    tenantName: z.string().trim().min(1, "Enter the tenant's name").max(120),
    tenantEmail: z.email("Enter a valid email").transform((v) => v.trim().toLowerCase()),
    tenantPhone: phoneSchema,
    monthlyRent: z.coerce.number({ message: "Enter the monthly rent" }).int("Whole rupees, please").min(500, "At least ₹500").max(10_000_000, "That's more than ₹1 crore a month"),
    dueDay: z.coerce.number({ message: "Choose the day rent is due" }).int().min(1, "Between the 1st and the 28th").max(28, "Between the 1st and the 28th"),
    deposit: z.preprocess((v) => (v === "" || v === undefined ? 0 : v), z.coerce.number().int("Whole rupees, please").min(0).max(100_000_000)),
    startDate: dateString,
    endDate: z.preprocess((v) => (v === "" ? undefined : v), dateString.optional()),
});

export const tenancySchema = tenancyFields.refine((v) => !v.endDate || v.endDate > v.startDate, { path: ["endDate"], message: "The end date must be after the start" });

const correctionSchema = tenancyFields.omit({ tenantName: true, tenantEmail: true, tenantPhone: true }).refine((v) => !v.endDate || v.endDate > v.startDate, {
  path: ["endDate"],
  message: "The end date must be after the start",
});

export type TenancyView = {
  referenceId: string;
  status: TenancyStatus;
  statusLabel: string;
  propertyReferenceId: string;
  listingReferenceId: string | null;
  title: string;
  address: string;
  landlordName: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  tenantAccepted: boolean;
  landlordConfirmed: boolean;
  monthlyRent: number;
  dueDay: number;
  deposit: number;
  startDate: string;
  endDate: string | null;
  firstDueDate: string | null;
  disputeNote: string | null;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
  agentName: string;
  createdAt: string;
};

const TENANCY_COLUMNS = sql`
  t.reference_id, t.status, t.tenant_name, t.tenant_email, t.tenant_phone, t.tenant_user_id, t.tenant_accepted_at, t.landlord_confirmed_at, t.monthly_rent, t.due_day,
  t.deposit, t.start_date, t.end_date, t.first_due_date, t.dispute_note, t.tenant_invite_expires_at, t.created_at, t.landlord_user_id, t.created_by,
  (t.tenant_invite_expires_at < now()) AS invite_expired,
  p.reference_id AS property_ref, l.reference_id AS listing_ref, lu.name AS landlord_name, au.name AS agent_name,
  coalesce(l.title, 'A property') AS title, concat_ws(', ', nullif(a.line1, ''), pc.name) AS address`;
const TENANCY_JOINS = sql`
  JOIN real_estate.properties p ON p.id = t.property_id
  JOIN geography.addresses a ON a.id = p.address_id JOIN geography.places pc ON pc.id = a.place_id
  LEFT JOIN marketplace.listings l ON l.id = t.listing_id
  JOIN identity.users lu ON lu.id = t.landlord_user_id
  JOIN identity.users au ON au.id = t.created_by`;

export const toTenancyView = (r: Row): TenancyView => ({
  referenceId: String(r.reference_id),
  status: r.status as TenancyStatus,
  statusLabel:
    r.status === "pending"
      ? !r.tenant_accepted_at && !r.landlord_confirmed_at
        ? "Waiting for the tenant and landlord"
        : !r.tenant_accepted_at
          ? "Waiting for the tenant to accept"
          : "Waiting for the landlord to confirm"
      : TENANCY_STATUS_LABELS[r.status as TenancyStatus],
  propertyReferenceId: String(r.property_ref),
  listingReferenceId: (r.listing_ref as string) ?? null,
  title: String(r.title),
  address: String(r.address),
  landlordName: String(r.landlord_name),
  tenantName: String(r.tenant_name),
  tenantEmail: String(r.tenant_email),
  tenantPhone: (r.tenant_phone as string) ?? null,
  tenantAccepted: Boolean(r.tenant_accepted_at),
  landlordConfirmed: Boolean(r.landlord_confirmed_at),
  monthlyRent: num(r.monthly_rent),
  dueDay: Number(r.due_day),
  deposit: num(r.deposit),
  startDate: day(r.start_date)!,
  endDate: day(r.end_date),
  firstDueDate: day(r.first_due_date),
  disputeNote: (r.dispute_note as string) ?? null,
  inviteExpiresAt: r.tenant_accepted_at ? null : iso(r.tenant_invite_expires_at),
  inviteExpired: !r.tenant_accepted_at && Boolean(r.invite_expired),
  agentName: String(r.agent_name),
  createdAt: iso(r.created_at)!,
});

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** The tenancy running on a property, if any (agent's panel). Call only for a listing in the agent's scope. */
export async function currentTenancy(propertyId: string): Promise<TenancyView | null> {
  const { rows } = await db.execute(sql`
    SELECT ${TENANCY_COLUMNS} FROM rent.tenancies t ${TENANCY_JOINS}
     WHERE t.property_id = ${propertyId} AND t.status IN ('pending', 'disputed', 'active') LIMIT 1`);
  return rows[0] ? toTenancyView(rows[0] as Row) : null;
}

/** A landlord's tenancies, current first (optionally for one property). */
export async function landlordTenancies(landlordUserId: string, propertyReferenceId?: string): Promise<TenancyView[]> {
  const { rows } = await db.execute(sql`
    SELECT ${TENANCY_COLUMNS} FROM rent.tenancies t ${TENANCY_JOINS}
     WHERE t.landlord_user_id = ${landlordUserId} AND t.status <> 'cancelled' ${propertyReferenceId ? sql`AND p.reference_id = ${propertyReferenceId}` : sql``}
     ORDER BY (t.status IN ('pending', 'disputed', 'active')) DESC, t.created_at DESC`);
  return (rows as Row[]).map(toTenancyView);
}

/** A tenant's tenancies, current first. */
export async function tenantTenancies(tenantUserId: string): Promise<TenancyView[]> {
  const { rows } = await db.execute(sql`
    SELECT ${TENANCY_COLUMNS} FROM rent.tenancies t ${TENANCY_JOINS}
     WHERE t.tenant_user_id = ${tenantUserId} AND t.status IN ('pending', 'disputed', 'active', 'ended')
     ORDER BY (t.status = 'active') DESC, t.created_at DESC`);
  return (rows as Row[]).map(toTenancyView);
}

/**
 * Starts a tenancy once the tenant has accepted and the landlord confirmed: rent falls due from the
 * first due day on or after both its start date and today.
 */
async function activateIfReady(tx: Tx, tenancyId: string): Promise<boolean> {
  const { rows } = await tx.execute(sql`
    WITH b AS (SELECT id, due_day, greatest(start_date, ${TODAY_IST}) AS base FROM rent.tenancies WHERE id = ${tenancyId}
                AND status = 'pending' AND tenant_user_id IS NOT NULL AND landlord_confirmed_at IS NOT NULL)
    UPDATE rent.tenancies t SET status = 'active', activated_at = now(), updated_at = now(),
           first_due_date = CASE WHEN make_date(extract(year FROM b.base)::int, extract(month FROM b.base)::int, b.due_day) >= b.base
                                 THEN make_date(extract(year FROM b.base)::int, extract(month FROM b.base)::int, b.due_day)
                                 ELSE (make_date(extract(year FROM b.base)::int, extract(month FROM b.base)::int, b.due_day) + interval '1 month')::date END
      FROM b WHERE t.id = b.id
    RETURNING t.reference_id, t.first_due_date, t.tenant_user_id, t.landlord_user_id, t.created_by, t.monthly_rent, t.due_day,
              (SELECT l.title FROM marketplace.listings l WHERE l.id = t.listing_id) AS title`);
  const r = rows[0] as Row | undefined;
  if (!r) return false;
  const first = day(r.first_due_date)!;
  await notify(tx, [String(r.tenant_user_id), String(r.landlord_user_id), String(r.created_by)], {
    type: "rent_tenancy",
    title: `The tenancy of ${r.title ?? "the property"} is active`,
    body: `${formatMoney(num(r.monthly_rent))} falls due on the ${ordinal(Number(r.due_day))} of each month, starting ${first}.`,
  });
  return true;
}

// ── The agent ────────────────────────────────────────────────────────────────

async function emailTenant(email: string, name: string, agentName: string, title: string, rentText: string, url: string) {
  try {
    await sendEmail(
      noticeMessage(email, {
        subject: `Pay your rent for ${title} online`,
        heading: "Your tenancy on Trustbrick",
        lines: [
          `Hi ${name.split(" ")[0]},`,
          `${agentName} set up your tenancy of ${title} on Trustbrick: ${rentText}. You'll pay the rent online each month and get a receipt.`,
          `Accept it to create your account (or log in). The link works only for this email, once, for ${INVITATION_TTL_HOURS} hours.`,
        ],
        action: { label: "Accept your tenancy", url },
      }),
    );
  } catch (e) {
    log.warn("rent.tenant_email_failed", { error: String(e) });
  }
}

/** The agent sets up a tenancy: the tenant gets a link, the landlord is asked to confirm. */
export async function createTenancy(actor: Actor, listingReferenceId: string, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string; url: string; email: string }> {
  assertCan(actor, "tenancies.manage");
  const parsed = tenancySchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const token = newInvitationToken();
  const result = await db.transaction(async (tx) => {
    const listing = await rentListing(actor, listingReferenceId, "tenancies.manage", tx);
    const link = await tx.execute(sql`
      SELECT pl.id, pl.landlord_user_id, u.email FROM rent.property_landlords pl JOIN identity.users u ON u.id = pl.landlord_user_id
       WHERE pl.property_id = ${listing.propertyId} AND pl.status <> 'ended' FOR UPDATE OF pl`);
    const l = link.rows[0] as Row | undefined;
    if (!l) throw conflict("Add the property's landlord first: rent is paid to them.");
    if (v.tenantEmail === String(l.email)) throw invalid("The tenant can't be the landlord.", { tenantEmail: "That's the landlord's email" });
    if (v.tenantEmail === actor.email.toLowerCase()) throw invalid("You can't be the tenant of a property you manage.", { tenantEmail: "That's your own email" });
    const running = await tx.execute(sql`SELECT 1 FROM rent.tenancies WHERE property_id = ${listing.propertyId} AND status IN ('pending', 'disputed', 'active')`);
    if (running.rows.length) throw conflict("This property already has a tenancy. End it before setting up another.");
    const inserted = await tx.execute(sql`
      INSERT INTO rent.tenancies (id, property_id, listing_id, property_landlord_id, landlord_user_id, tenant_name, tenant_email, tenant_phone, monthly_rent, due_day,
                                  deposit, start_date, end_date, status, tenant_token_hash, tenant_invite_expires_at, organization_id, created_by)
      VALUES (gen_random_uuid(), ${listing.propertyId}, ${listing.id}, ${String(l.id)}, ${String(l.landlord_user_id)}, ${v.tenantName}, ${v.tenantEmail}, ${v.tenantPhone},
              ${v.monthlyRent}, ${v.dueDay}, ${v.deposit}, ${v.startDate}, ${v.endDate ?? null}, 'pending', ${hashToken(token)},
              now() + ${`${INVITATION_TTL_HOURS} hours`}::interval, ${actor.organization.id}, ${actor.userId})
      RETURNING reference_id`);
    const referenceId = String((inserted.rows[0] as Row).reference_id);
    await notify(tx, [String(l.landlord_user_id)], {
      type: "rent_tenancy",
      title: `Confirm the tenancy of ${listing.title}`,
      body: `${v.tenantName}, ${formatMoney(v.monthlyRent)} a month, due on the ${ordinal(v.dueDay)}, from ${v.startDate}. Confirm it, or tell the agent what's wrong.`,
      link: `/my-properties/${listing.propertyReferenceId}`,
    });
    await audit(tx, actor, { event: "TENANCY_CREATED", target: { type: "tenancy", referenceId }, organizationId: actor.organization.id, metadata: { listing: listing.referenceId, monthlyRent: v.monthlyRent, dueDay: v.dueDay } }, ctx);
    return { referenceId, title: listing.title };
  });
  const url = absoluteUrl(`/invite/tenant/${token}`);
  await emailTenant(v.tenantEmail, v.tenantName, actor.name, result.title, `${formatMoney(v.monthlyRent)} a month, due on the ${ordinal(v.dueDay)}`, url);
  return { referenceId: result.referenceId, url, email: v.tenantEmail };
}

/** A tenancy the agent may change: one on a listing in their scope. */
async function lockTenancyForAgent(tx: Tx, actor: Actor, tenancyReferenceId: string) {
  const ref = normalizeReferenceId(tenancyReferenceId);
  if (!isReferenceId(ref, "TEN")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT t.*, l.reference_id AS listing_ref FROM rent.tenancies t JOIN marketplace.listings l ON l.id = t.listing_id WHERE t.reference_id = ${ref} FOR UPDATE OF t`);
  const t = rows[0] as Row | undefined;
  if (!t) throw notFound();
  const listing = await rentListing(actor, String(t.listing_ref), "tenancies.manage", tx);
  return { t, listing, ref };
}

/** A new link for the tenant (the old one stops working), for another 72 hours. */
export async function resendTenantInvite(actor: Actor, tenancyReferenceId: string, ctx: RequestContext): Promise<{ url: string; email: string }> {
  assertCan(actor, "tenancies.manage");
  const token = newInvitationToken();
  const r = await db.transaction(async (tx) => {
    const { t, listing, ref } = await lockTenancyForAgent(tx, actor, tenancyReferenceId);
    if (!["pending", "disputed"].includes(String(t.status)) || t.tenant_user_id) throw conflict("The tenant has already accepted.");
    await tx.execute(sql`
      UPDATE rent.tenancies SET tenant_token_hash = ${hashToken(token)}, tenant_invite_expires_at = now() + ${`${INVITATION_TTL_HOURS} hours`}::interval, updated_at = now() WHERE id = ${String(t.id)}`);
    await audit(tx, actor, { event: "TENANCY_INVITE_RESENT", target: { type: "tenancy", referenceId: ref }, organizationId: actor.organization.id }, ctx);
    return { t, listing };
  });
  const url = absoluteUrl(`/invite/tenant/${token}`);
  await emailTenant(String(r.t.tenant_email), String(r.t.tenant_name), actor.name, r.listing.title, `${formatMoney(num(r.t.monthly_rent))} a month, due on the ${ordinal(Number(r.t.due_day))}`, url);
  return { url, email: String(r.t.tenant_email) };
}

/** The agent corrects the terms (after the landlord disputed them, or a mistake): the landlord confirms again. */
export async function correctTenancy(actor: Actor, tenancyReferenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "tenancies.manage");
  const parsed = correctionSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  await db.transaction(async (tx) => {
    const { t, listing, ref } = await lockTenancyForAgent(tx, actor, tenancyReferenceId);
    if (!["pending", "disputed"].includes(String(t.status))) throw conflict("Only a tenancy that hasn't started can be corrected. End it and set up a new one.");
    await tx.execute(sql`
      UPDATE rent.tenancies SET monthly_rent = ${v.monthlyRent}, due_day = ${v.dueDay}, deposit = ${v.deposit}, start_date = ${v.startDate}, end_date = ${v.endDate ?? null},
             status = 'pending', landlord_confirmed_at = NULL, dispute_note = NULL, updated_at = now()
       WHERE id = ${String(t.id)}`);
    await notify(tx, [String(t.landlord_user_id)], {
      type: "rent_tenancy",
      title: `The terms for ${listing.title} were corrected: please confirm`,
      body: `${formatMoney(v.monthlyRent)} a month, due on the ${ordinal(v.dueDay)}, from ${v.startDate}.`,
      link: `/my-properties/${listing.propertyReferenceId}`,
    });
    await audit(
      tx,
      actor,
      { event: "TENANCY_CORRECTED", target: { type: "tenancy", referenceId: ref }, organizationId: actor.organization.id, before: { monthlyRent: num(t.monthly_rent), dueDay: t.due_day, deposit: num(t.deposit), startDate: day(t.start_date) }, after: v },
      ctx,
    );
  });
}

/** A tenancy that never started is called off. */
export async function cancelTenancy(actor: Actor, tenancyReferenceId: string, ctx: RequestContext) {
  assertCan(actor, "tenancies.manage");
  await db.transaction(async (tx) => {
    const { t, listing, ref } = await lockTenancyForAgent(tx, actor, tenancyReferenceId);
    if (!["pending", "disputed"].includes(String(t.status))) throw conflict("Only a tenancy that hasn't started can be cancelled. End it instead.");
    await tx.execute(sql`UPDATE rent.tenancies SET status = 'cancelled', tenant_token_hash = NULL, ended_at = now(), ended_by = ${actor.userId}, updated_at = now() WHERE id = ${String(t.id)}`);
    await notify(tx, [String(t.landlord_user_id), (t.tenant_user_id as string) ?? null], { type: "rent_tenancy", title: `The tenancy of ${listing.title} was cancelled` });
    await audit(tx, actor, { event: "TENANCY_CANCELLED", target: { type: "tenancy", referenceId: ref }, organizationId: actor.organization.id }, ctx);
  });
}

const endSchema = z.object({
  endDate: dateString,
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
});

/**
 * Ends an active tenancy on a date (today or later): rent stops falling due from then. Until the
 * date it carries on; any rent due after it is cancelled. The agent or the landlord can end it.
 */
async function endTenancyLocked(tx: Tx, t: Row, by: { userId: string; name: string }, v: z.infer<typeof endSchema>) {
  if (t.status !== "active") throw conflict("Only an active tenancy can be ended.");
  const today = String(((await tx.execute(sql`SELECT ${TODAY_IST}::text AS d`)).rows[0] as Row).d);
  if (v.endDate < today) throw invalid("The end date can't be in the past.", { endDate: "Today or later" });
  if (v.endDate <= day(t.start_date)!) throw invalid("The end date must be after the start.", { endDate: "After the start date" });
  const now = v.endDate === today;
  await tx.execute(sql`
    UPDATE rent.tenancies SET end_date = ${v.endDate}, end_reason = ${v.reason}, ended_by = ${by.userId},
           ${now ? sql`status = 'ended', ended_at = now(), ` : sql``} updated_at = now() WHERE id = ${String(t.id)}`);
  await tx.execute(sql`UPDATE rent.charges SET status = 'cancelled', updated_at = now() WHERE tenancy_id = ${String(t.id)} AND status = 'due' AND due_date >= ${v.endDate}`);
  const title = ((await tx.execute(sql`SELECT title FROM marketplace.listings WHERE id = ${(t.listing_id as string) ?? null}`)).rows[0] as Row | undefined)?.title ?? "the property";
  await notify(tx, [String(t.landlord_user_id), (t.tenant_user_id as string) ?? null, String(t.created_by)].filter((id) => id !== by.userId), {
    type: "rent_tenancy",
    title: `${by.name} ended the tenancy of ${title}${now ? "" : ` from ${v.endDate}`}`,
    body: v.reason,
  });
}

export async function endTenancyByAgent(actor: Actor, tenancyReferenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "tenancies.manage");
  const parsed = endSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const { t, ref } = await lockTenancyForAgent(tx, actor, tenancyReferenceId);
    await endTenancyLocked(tx, t, { userId: actor.userId, name: actor.name }, parsed.data);
    await audit(tx, actor, { event: "TENANCY_ENDED", target: { type: "tenancy", referenceId: ref }, organizationId: actor.organization.id, metadata: parsed.data }, ctx);
  });
}

// ── The landlord ─────────────────────────────────────────────────────────────

async function lockTenancyForLandlord(tx: Tx, actor: Actor, tenancyReferenceId: string) {
  assertCan(actor, "rent.receive");
  const ref = normalizeReferenceId(tenancyReferenceId);
  if (!isReferenceId(ref, "TEN")) throw notFound();
  const { rows } = await tx.execute(sql`SELECT * FROM rent.tenancies WHERE reference_id = ${ref} AND landlord_user_id = ${actor.userId} FOR UPDATE`);
  const t = rows[0] as Row | undefined;
  if (!t) throw notFound();
  return { t, ref };
}

/** The landlord agrees the terms are right. With the tenant's acceptance, the tenancy starts. */
export async function confirmTenancy(actor: Actor, tenancyReferenceId: string, ctx: RequestContext) {
  await db.transaction(async (tx) => {
    const { t, ref } = await lockTenancyForLandlord(tx, actor, tenancyReferenceId);
    if (t.status !== "pending" || t.landlord_confirmed_at) throw conflict("There's nothing to confirm.");
    await tx.execute(sql`UPDATE rent.tenancies SET landlord_confirmed_at = now(), dispute_note = NULL, updated_at = now() WHERE id = ${String(t.id)}`);
    const started = await activateIfReady(tx, String(t.id));
    if (!started) await notify(tx, [String(t.created_by)], { type: "rent_tenancy", title: `${actor.name} confirmed the tenancy ${ref}`, body: "It starts once the tenant accepts." });
    await audit(tx, actor, { event: "TENANCY_CONFIRMED", target: { type: "tenancy", referenceId: ref } }, ctx);
  });
}

const disputeSchema = z.object({ note: z.string().trim().min(10, "Say what's wrong, in at least 10 characters").max(500) });

/** The landlord says what's wrong with the terms; the agent corrects them. */
export async function disputeTenancy(actor: Actor, tenancyReferenceId: string, raw: unknown, ctx: RequestContext) {
  const parsed = disputeSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const { t, ref } = await lockTenancyForLandlord(tx, actor, tenancyReferenceId);
    if (t.status !== "pending") throw conflict("Only a tenancy that hasn't started can be disputed.");
    await tx.execute(sql`UPDATE rent.tenancies SET status = 'disputed', landlord_confirmed_at = NULL, dispute_note = ${parsed.data.note}, updated_at = now() WHERE id = ${String(t.id)}`);
    await notify(tx, [String(t.created_by)], { type: "rent_tenancy", title: `${actor.name} disagrees with the terms of ${ref}`, body: parsed.data.note });
    await audit(tx, actor, { event: "TENANCY_DISPUTED", target: { type: "tenancy", referenceId: ref }, metadata: { note: parsed.data.note } }, ctx);
  });
}

export async function endTenancyByLandlord(actor: Actor, tenancyReferenceId: string, raw: unknown, ctx: RequestContext) {
  const parsed = endSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const { t, ref } = await lockTenancyForLandlord(tx, actor, tenancyReferenceId);
    await endTenancyLocked(tx, t, { userId: actor.userId, name: actor.name }, parsed.data);
    await audit(tx, actor, { event: "TENANCY_ENDED", target: { type: "tenancy", referenceId: ref }, metadata: parsed.data }, ctx);
  });
}

// ── The tenant ───────────────────────────────────────────────────────────────

export type TenancyInvitePreview = {
  email: string;
  name: string;
  phone: string | null;
  title: string;
  address: string;
  landlordName: string;
  agentName: string;
  monthlyRent: number;
  dueDay: number;
  deposit: number;
  startDate: string;
  expiresAt: Date;
  accountExists: boolean;
};

export async function previewTenancyInvitation(token: string): Promise<TenancyInvitePreview | null> {
  if (!isTokenShape(token)) return null;
  const { rows } = await db.execute(sql`
    SELECT ${TENANCY_COLUMNS}, EXISTS (SELECT 1 FROM identity.users u WHERE u.email = t.tenant_email) AS account_exists
      FROM rent.tenancies t ${TENANCY_JOINS}
     WHERE t.tenant_token_hash = ${hashToken(token)} AND t.status IN ('pending', 'disputed') AND t.tenant_user_id IS NULL AND t.tenant_invite_expires_at > now()`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const v = toTenancyView(r);
  return {
    email: v.tenantEmail,
    name: v.tenantName,
    phone: v.tenantPhone,
    title: v.title,
    address: v.address,
    landlordName: v.landlordName,
    agentName: v.agentName,
    monthlyRent: v.monthlyRent,
    dueDay: v.dueDay,
    deposit: v.deposit,
    startDate: v.startDate,
    expiresAt: new Date(r.tenant_invite_expires_at as string),
    accountExists: Boolean(r.account_exists),
  };
}

/** The tenant accepts with their link: an account is created for that email, or they log in as it. */
export async function acceptTenancyInvitation(token: string, input: AcceptInput & { phone?: unknown; confirm?: unknown }, ctx: RequestContext): Promise<{ createdAccount: boolean }> {
  await guardAcceptance(token, input.ipKey);
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT id, reference_id, tenant_email, tenant_phone, status, tenant_user_id, landlord_user_id, created_by, tenant_invite_expires_at < now() AS expired
        FROM rent.tenancies WHERE tenant_token_hash = ${hashToken(token)} FOR UPDATE`);
    const t = rows[0] as Row | undefined;
    if (!t || !["pending", "disputed"].includes(String(t.status)) || t.tenant_user_id || t.expired) throw notFound("This link isn't valid any more. Ask your agent to send a new one.");
    const email = String(t.tenant_email);
    const hasAccount = (await tx.execute(sql`SELECT 1 FROM identity.users WHERE email = ${email}`)).rows.length > 0;
    if (!hasAccount) {
      const errors: Record<string, string> = {};
      const p = phoneSchema.safeParse(input.phone ?? t.tenant_phone ?? "");
      if (!p.success) errors.phone = p.error.issues[0].message;
      if (typeof input.password !== "string" || input.password !== input.confirm) errors.confirm = "The passwords don't match";
      if (Object.keys(errors).length) throw invalid("Please check the highlighted fields.", errors);
    }
    const account = await resolveInvitedAccount(tx, email, input);
    if (account.userId === String(t.landlord_user_id)) throw conflict("The landlord can't be the tenant.");
    if (!hasAccount) {
      const p = phoneSchema.safeParse(input.phone ?? t.tenant_phone ?? "");
      if (p.success) await tx.execute(sql`UPDATE identity.users SET phone = coalesce(phone, ${p.data}) WHERE id = ${account.userId}`);
    }
    await tx.execute(sql`
      UPDATE rent.tenancies SET tenant_user_id = ${account.userId}, tenant_accepted_at = now(), tenant_token_hash = NULL, updated_at = now() WHERE id = ${String(t.id)}`);
    const started = await activateIfReady(tx, String(t.id));
    if (!started) await notify(tx, [String(t.created_by)], { type: "rent_tenancy", title: `${email} accepted the tenancy ${t.reference_id}`, body: "It starts once the landlord confirms the terms." });
    const who: PersonActor = { kind: "person", userId: account.userId, referenceId: account.referenceId, role: "tenant" };
    await audit(tx, who, { event: "TENANCY_ACCEPTED", target: { type: "tenancy", referenceId: String(t.reference_id) }, metadata: { createdAccount: account.createdAccount } }, ctx);
    return { createdAccount: account.createdAccount };
  });
}

/** The job: tenancies whose end date has come are ended. */
export async function endDueTenancies(tx: DbOrTx = db): Promise<number> {
  const { rows } = await tx.execute(sql`
    UPDATE rent.tenancies SET status = 'ended', ended_at = now(), updated_at = now()
     WHERE status = 'active' AND end_date IS NOT NULL AND end_date <= ${TODAY_IST} RETURNING id`);
  return rows.length;
}

/** Whether this person has any tenancy as a tenant (for showing Rent in their account). */
export async function hasTenancies(userId: string): Promise<boolean> {
  const { rows } = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM rent.tenancies WHERE tenant_user_id = ${userId} AND status IN ('pending', 'disputed', 'active', 'ended')) AS yes`);
  return Boolean((rows[0] as Row).yes);
}


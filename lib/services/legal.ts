import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { LEGAL_SERVICE_INFO, LEGAL_STATUS_LABELS, LEGAL_TRANSITIONS } from "@/lib/legal/services";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { LEGAL_DOCUMENTS, LEGAL_PROPERTY_TYPES, LEGAL_PURPOSES, LEGAL_REQUEST_STATUSES, LEGAL_SERVICES, LEGAL_STATES, type LegalRequestStatus } from "@/lib/vocab";
import { type RequestContext, audit } from "./audit";
import { notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";

/**
 * Legal verification requests. Anyone may apply, signed in or not. The team (support.view /
 * support.manage) calls them back, agrees the scope and the fee, and passes the work to an
 * advocate; each status change carries a note and is audited. A signed-in applicant can
 * follow their own requests on the Legal Verification page.
 *
 * No documents are uploaded here: title papers carry names, addresses and ID numbers, and
 * they go to the advocate handling the request once the applicant has agreed the fee.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
const asArray = (v: unknown) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

export const legalRequestSchema = z.object({
  service: z.enum(LEGAL_SERVICES, { message: "Choose what you need" }),
  purpose: z.enum(LEGAL_PURPOSES, { message: "Choose why you need it" }),
  propertyType: z.enum(LEGAL_PROPERTY_TYPES, { message: "Choose the kind of property" }),
  state: z.enum(LEGAL_STATES, { message: "Choose the state" }),
  location: z.string().trim().min(3, "Enter the locality and city").max(200, "Keep it under 200 characters"),
  listing: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? normalizeReferenceId(v) : undefined),
    z.string().refine((v) => isReferenceId(v, "LST"), "That doesn't look like a Trustbrick listing reference (LST-…)").optional(),
  ),
  documents: z.preprocess(asArray, z.array(z.enum(LEGAL_DOCUMENTS)).max(LEGAL_DOCUMENTS.length)).transform((d) => [...new Set(d)]),
  details: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(2000, "Keep it under 2,000 characters").optional()),
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  phone: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s()-]/g, "") : v),
    z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits: the team calls you to agree the scope"),
  ),
  consent: z.literal("yes", { message: "Tick this so we can pass your request to an advocate" }),
  // A field people never see. Bots fill it in.
  website: z.string().max(0).optional().catch("filled"),
});

export type LegalListing = { referenceId: string; title: string; locality: string | null; city: string | null; state: string | null };

/** A published listing, to say which property a request is about. Anything else reads as "not found". */
export async function listingForLegal(referenceId: string | undefined): Promise<(LegalListing & { id: string }) | null> {
  if (!referenceId || !isReferenceId(referenceId, "LST")) return null;
  const { rows } = await db.execute(sql`
    SELECT l.id, l.reference_id, l.title, loc.name AS locality, city.name AS city,
           CASE WHEN nlevel(loc.path) > 1 THEN subpath(loc.path, 1, 1)::text END AS state
      FROM marketplace.listings l
      JOIN real_estate.properties p ON p.id = l.property_id
      LEFT JOIN geography.addresses a ON a.id = p.address_id
      LEFT JOIN geography.places loc ON loc.id = a.place_id
      LEFT JOIN geography.places city ON city.id = loc.parent_id
     WHERE l.reference_id = ${referenceId} AND l.status = 'published' AND l.deleted_at IS NULL`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  const state = (LEGAL_STATES as readonly string[]).includes(String(r.state)) ? String(r.state) : null;
  return { id: String(r.id), referenceId: String(r.reference_id), title: String(r.title), locality: (r.locality as string) ?? null, city: (r.city as string) ?? null, state };
}

export async function applyForLegalVerification(raw: unknown, sender: { userId: string | null; ipKey: string }): Promise<{ referenceId: string }> {
  const parsed = legalRequestSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const limited = await limit([
    { key: `legal:ip:${sender.ipKey}`, rule: RULES.legalByIp },
    { key: `legal:email:${input.email}`, rule: RULES.legalByEmail },
  ]);
  if (limited.limited) throw new AppError("RATE_LIMITED");
  // Pretend success to bots, store nothing.
  if (input.website) return { referenceId: "LGL-00000000" };

  const listing = input.listing ? await listingForLegal(input.listing) : null;
  if (input.listing && !listing) throw invalid("Please check the highlighted fields.", { listing: "No live Trustbrick listing has that reference. Check it, or leave it blank." });

  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      INSERT INTO platform.legal_requests
        (id, user_id, name, email, phone, service, purpose, property_type, state, location, listing_id, documents, details, consent_at)
      VALUES (gen_random_uuid(), ${sender.userId}, ${input.name}, ${input.email}, ${input.phone}, ${input.service}, ${input.purpose}, ${input.propertyType},
              ${input.state}, ${input.location}, ${listing?.id ?? null}, ${sql.param(input.documents)}::text[], ${input.details ?? null}, now())
      RETURNING reference_id`);
    const referenceId = String((rows[0] as Row).reference_id);
    await notifyPermissionHolders(tx, "support.view", {
      type: "legal_request",
      title: `${LEGAL_SERVICE_INFO[input.service].label}: request from ${input.name}`,
      link: `/legal-requests?q=${referenceId}`,
    });
    return { referenceId };
  });
}

// ── The applicant's own requests ─────────────────────────────────────────────

export type OwnLegalRequest = {
  referenceId: string;
  service: string;
  location: string;
  status: LegalRequestStatus;
  createdAt: string;
  statusChangedAt: string | null;
};

export async function listOwnLegalRequests(userId: string): Promise<OwnLegalRequest[]> {
  const { rows } = await db.execute(sql`
    SELECT reference_id, service, location, status, created_at, status_changed_at
      FROM platform.legal_requests WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    service: String(r.service),
    location: String(r.location),
    status: r.status as LegalRequestStatus,
    createdAt: iso(r.created_at)!,
    statusChangedAt: iso(r.status_changed_at),
  }));
}

// ── Admin queue ──────────────────────────────────────────────────────────────

const OPEN: LegalRequestStatus[] = ["new", "contacted", "in_progress"];

export const legalFilters = z.object({
  status: z.enum(["open", ...LEGAL_REQUEST_STATUSES, "all"]).catch("open"),
  service: z.enum(LEGAL_SERVICES).optional().catch(undefined),
  state: z.enum(LEGAL_STATES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type LegalFilters = z.infer<typeof legalFilters>;

export type LegalRequestRow = {
  referenceId: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  purpose: string;
  propertyType: string;
  state: string;
  location: string;
  listing: { referenceId: string; title: string } | null;
  documents: string[];
  details: string | null;
  status: LegalRequestStatus;
  statusNote: string | null;
  statusChangedBy: string | null;
  statusChangedAt: string | null;
  userReferenceId: string | null;
  createdAt: string;
};

export async function listLegalRequests(actor: Actor, filters: LegalFilters, page: number): Promise<Page<LegalRequestRow> & { counts: Record<string, number> }> {
  assertCan(actor, "support.view", "platform");
  const where = [sql`TRUE`];
  if (filters.status === "open") where.push(sql`r.status = ANY(${sql.param(OPEN)}::text[])`);
  else if (filters.status !== "all") where.push(sql`r.status = ${filters.status}`);
  if (filters.service) where.push(sql`r.service = ${filters.service}`);
  if (filters.state) where.push(sql`r.state = ${filters.state}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(r.reference_id = ${ref} OR l.reference_id = ${ref} OR r.name ILIKE ${like} OR r.email ILIKE ${like} OR r.phone ILIKE ${like} OR r.location ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const from = sql`FROM platform.legal_requests r LEFT JOIN marketplace.listings l ON l.id = r.listing_id`;
  const [rows, count, counts] = await Promise.all([
    db.execute(sql`
      SELECT r.*, l.reference_id AS listing_reference_id, l.title AS listing_title, u.reference_id AS user_reference_id, c.name AS changed_by_name
        ${from}
        LEFT JOIN identity.users u ON u.id = r.user_id
        LEFT JOIN identity.users c ON c.id = r.status_changed_by
       WHERE ${whereSql}
       ORDER BY array_position(ARRAY['new', 'contacted', 'in_progress', 'completed', 'closed'], r.status), r.created_at DESC
       LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${whereSql}`),
    db.execute(sql`SELECT status, count(*)::int AS n FROM platform.legal_requests GROUP BY status`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      name: String(r.name),
      email: String(r.email),
      phone: String(r.phone),
      service: String(r.service),
      purpose: String(r.purpose),
      propertyType: String(r.property_type),
      state: String(r.state),
      location: String(r.location),
      listing: r.listing_reference_id ? { referenceId: String(r.listing_reference_id), title: String(r.listing_title) } : null,
      documents: (r.documents as string[]) ?? [],
      details: (r.details as string) ?? null,
      status: r.status as LegalRequestStatus,
      statusNote: (r.status_note as string) ?? null,
      statusChangedBy: (r.changed_by_name as string) ?? null,
      statusChangedAt: iso(r.status_changed_at),
      userReferenceId: (r.user_reference_id as string) ?? null,
      createdAt: iso(r.created_at)!,
    })),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: take,
    counts: Object.fromEntries((counts.rows as Row[]).map((r) => [String(r.status), Number(r.n)])),
  };
}

const updateSchema = z.object({
  status: z.enum(LEGAL_REQUEST_STATUSES),
  note: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(1000, "Keep the note under 1,000 characters").optional()),
});

/** Moves a request along. Closing it needs a reason, as the applicant is owed one. */
export async function updateLegalRequest(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "support.manage", "platform");
  if (!isReferenceId(referenceId, "LGL")) throw notFound();
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the note.", fieldErrorsFrom(parsed.error));
  const { status, note } = parsed.data;
  if (status === "closed" && (!note || note.length < 10)) throw invalid("Say why it's being closed (at least 10 characters).", { reason: "Say why it's being closed (at least 10 characters)." });

  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT id, status FROM platform.legal_requests WHERE reference_id = ${referenceId} FOR UPDATE`);
    const r = rows[0] as Row | undefined;
    if (!r) throw notFound();
    const from = r.status as LegalRequestStatus;
    if (!LEGAL_TRANSITIONS[from].includes(status)) {
      throw conflict(`This request is ${LEGAL_STATUS_LABELS[from].label.toLowerCase()}; it can't be marked ${LEGAL_STATUS_LABELS[status].label.toLowerCase()}.`);
    }
    await tx.execute(sql`
      UPDATE platform.legal_requests SET status = ${status}, status_note = ${note ?? null}, status_changed_by = ${actor.userId}, status_changed_at = now()
       WHERE id = ${String(r.id)}`);
    await audit(
      tx,
      actor,
      { event: "LEGAL_REQUEST_UPDATED", target: { type: "legal_request", id: String(r.id), referenceId }, before: { status: from }, after: { status }, metadata: note ? { note } : undefined },
      ctx,
    );
  });
}

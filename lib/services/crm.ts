import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { contactScope, leadScope, visitScope } from "@/lib/authz/scope";
import { type Tx, db } from "@/lib/db";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_TRANSITIONS, type LeadStatus, VISIT_ACTIONS, VISIT_STATUSES, type VisitStatus } from "@/lib/crm/terms";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { notify } from "./notifications";

export { LEAD_STATUS_LABELS, LEAD_TRANSITIONS, VISIT_STATUS_LABELS, type LeadStatus, type VisitStatus } from "@/lib/crm/terms";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── From the public listing page ─────────────────────────────────────────────

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits"));

export const enquirySchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120),
    phone,
    message: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000, "Keep it under 1,000 characters").optional()),
    wantsVisit: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    visitDate: z.preprocess((v) => (v === "" ? undefined : v), z.iso.date("Choose a date").optional()),
    visitTime: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["morning", "afternoon", "evening"]).optional()),
  })
  .superRefine((v, ctx) => {
    if (!v.wantsVisit) return;
    if (!v.visitDate) ctx.addIssue({ code: "custom", path: ["visitDate"], message: "Choose a date for the visit" });
    else {
      const day = new Date(`${v.visitDate}T00:00:00+05:30`).getTime();
      const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) + "T00:00:00+05:30").getTime();
      if (day < today + 86_400_000) ctx.addIssue({ code: "custom", path: ["visitDate"], message: "Choose a date from tomorrow onwards" });
      if (day > today + 60 * 86_400_000) ctx.addIssue({ code: "custom", path: ["visitDate"], message: "Choose a date within the next two months" });
    }
  });

const SLOT_HOUR = { morning: 10, afternoon: 14, evening: 17 } as const;

/**
 * A logged-in customer contacts the agent behind a published listing. Creates (or reuses)
 * the organization's contact, one lead per contact and listing, and optionally a visit
 * request. The customer's phone is shared with the agent because they typed it for this purpose.
 */
export async function createEnquiry(
  customer: { userId: string; email: string },
  listingReference: string,
  raw: unknown,
): Promise<{ leadReferenceId: string; visitReferenceId: string | null }> {
  if (!isReferenceId(listingReference, "LST")) throw notFound();
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const limited = await limit([{ key: `enquiry:user:${customer.userId}`, rule: RULES.enquiryByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  return db.transaction(async (tx) => {
    const found = await tx.execute(sql`
      SELECT l.id, l.reference_id, l.title, l.property_id, l.organization_id, l.is_sample, la.agent_user_id, la.membership_id
        FROM marketplace.listings l
        JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
       WHERE l.reference_id = ${listingReference} AND l.status = 'published' AND l.deleted_at IS NULL`);
    const listing = found.rows[0] as Row | undefined;
    if (!listing) throw notFound("This listing isn't taking enquiries.");
    if (String(listing.agent_user_id) === customer.userId) throw invalid("This is your own listing.");

    const contact = await tx.execute(sql`
      INSERT INTO crm.contacts (id, organization_id, user_id, name, email, phone)
      VALUES (gen_random_uuid(), ${String(listing.organization_id)}, ${customer.userId}, ${input.name}, ${customer.email}, ${input.phone})
      ON CONFLICT ON CONSTRAINT contacts_org_user_unique
      DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = now(), deleted_at = NULL
      RETURNING id`);
    const contactId = String((contact.rows[0] as Row).id);

    const open = await tx.execute(sql`
      SELECT id, reference_id FROM crm.leads
       WHERE contact_id = ${contactId} AND listing_id = ${String(listing.id)} AND status NOT IN ('converted', 'lost') AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`);
    let lead = open.rows[0] as Row | undefined;
    const source = input.wantsVisit ? "visit_request" : "listing_enquiry";
    if (lead) {
      await tx.execute(sql`UPDATE crm.leads SET last_activity_at = now(), updated_at = now() WHERE id = ${String(lead.id)}`);
      await tx.execute(sql`
        INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
        VALUES (gen_random_uuid(), ${String(lead.id)}, 'note', ${input.message ?? "Enquired again"}, ${customer.userId})`);
    } else {
      const created = await tx.execute(sql`
        INSERT INTO crm.leads (id, organization_id, contact_id, listing_id, property_id, agent_user_id, agent_membership_id, source, message)
        VALUES (gen_random_uuid(), ${String(listing.organization_id)}, ${contactId}, ${String(listing.id)}, ${String(listing.property_id)},
                ${String(listing.agent_user_id)}, ${String(listing.membership_id)}, ${source}, ${input.message ?? null})
        RETURNING id, reference_id`);
      lead = created.rows[0] as Row;
      await tx.execute(sql`
        INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, to_status, actor_user_id)
        VALUES (gen_random_uuid(), ${String(lead.id)}, 'created', ${input.message ?? null}, 'new', ${customer.userId})`);
    }

    let visitReferenceId: string | null = null;
    if (input.wantsVisit && input.visitDate) {
      const hour = SLOT_HOUR[input.visitTime ?? "morning"];
      const requestedFor = `${input.visitDate}T${String(hour).padStart(2, "0")}:00:00+05:30`;
      const visit = await tx.execute(sql`
        INSERT INTO crm.visits (id, organization_id, lead_id, listing_id, property_id, agent_user_id, customer_user_id, requested_for, status, created_by)
        VALUES (gen_random_uuid(), ${String(listing.organization_id)}, ${String(lead.id)}, ${String(listing.id)}, ${String(listing.property_id)},
                ${String(listing.agent_user_id)}, ${customer.userId}, ${requestedFor}::timestamptz, 'requested', ${customer.userId})
        RETURNING reference_id`);
      visitReferenceId = String((visit.rows[0] as Row).reference_id);
      await tx.execute(sql`
        INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
        VALUES (gen_random_uuid(), ${String(lead.id)}, 'visit_requested', ${`Visit requested for ${input.visitDate} (${input.visitTime ?? "morning"})`}, ${customer.userId})`);
    }

    await notify(tx, [String(listing.agent_user_id)], {
      type: visitReferenceId ? "visit_requested" : "new_lead",
      title: visitReferenceId ? `${input.name} wants to visit ${listing.reference_id}` : `New enquiry on ${listing.reference_id}`,
      body: String(listing.title),
      link: `/leads/${lead.reference_id}`,
    });
    return { leadReferenceId: String(lead.reference_id), visitReferenceId };
  });
}

// ── Leads ────────────────────────────────────────────────────────────────────

export const leadFilters = z.object({
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  open: z.preprocess((v) => v === "1", z.boolean()).catch(false),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type LeadFilters = z.infer<typeof leadFilters>;

export type LeadRow = {
  referenceId: string;
  status: LeadStatus;
  source: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  listingReferenceId: string | null;
  listingTitle: string | null;
  agentName: string | null;
  organization: string;
  createdAt: string;
  lastActivityAt: string;
};

const LEAD_FROM = sql`
  FROM crm.leads ld
  JOIN crm.contacts c ON c.id = ld.contact_id
  JOIN orgs.organizations o ON o.id = ld.organization_id
  LEFT JOIN marketplace.listings l ON l.id = ld.listing_id
  LEFT JOIN identity.users ag ON ag.id = ld.agent_user_id`;

export async function listLeads(actor: Actor, filters: LeadFilters, page: number): Promise<Page<LeadRow>> {
  const where: SQL[] = [sql`ld.deleted_at IS NULL`, leadScope(actor, "leads.view")];
  if (filters.status) where.push(sql`ld.status = ${filters.status}`);
  if (filters.open) where.push(sql`ld.status NOT IN ('converted', 'lost')`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(ld.reference_id = ${ref} OR l.reference_id = ${ref} OR c.name ILIKE ${like} OR c.phone LIKE ${like} OR c.email ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT ld.reference_id, ld.status, ld.source, ld.created_at, ld.last_activity_at, c.name AS contact_name, c.phone, c.email,
             l.reference_id AS listing_reference_id, l.title AS listing_title, ag.name AS agent_name, o.name AS organization
      ${LEAD_FROM} WHERE ${whereSql}
      ORDER BY (ld.status = 'new') DESC, ld.last_activity_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${LEAD_FROM} WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      status: r.status as LeadStatus,
      source: String(r.source),
      contactName: String(r.contact_name),
      contactPhone: (r.phone as string) ?? null,
      contactEmail: (r.email as string) ?? null,
      listingReferenceId: (r.listing_reference_id as string) ?? null,
      listingTitle: (r.listing_title as string) ?? null,
      agentName: (r.agent_name as string) ?? null,
      organization: String(r.organization),
      createdAt: iso(r.created_at)!,
      lastActivityAt: iso(r.last_activity_at)!,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: take,
  };
}

export type LeadDetail = LeadRow & {
  message: string | null;
  lostReason: string | null;
  contactReferenceId: string;
  activities: { type: string; body: string | null; fromStatus: string | null; toStatus: string | null; actorName: string | null; createdAt: string }[];
  visits: VisitRow[];
};

export async function getLead(actor: Actor, referenceId: string): Promise<LeadDetail> {
  if (!isReferenceId(referenceId, "LEAD")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT ld.id, ld.reference_id, ld.status, ld.source, ld.created_at, ld.last_activity_at, ld.message, ld.lost_reason,
           c.reference_id AS contact_reference_id, c.name AS contact_name, c.phone, c.email,
           l.reference_id AS listing_reference_id, l.title AS listing_title, ag.name AS agent_name, o.name AS organization
    ${LEAD_FROM} WHERE ld.reference_id = ${referenceId} AND ld.deleted_at IS NULL AND ${leadScope(actor, "leads.view")}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const [activities, visits] = await Promise.all([
    db.execute(sql`
      SELECT a.activity_type, a.body, a.from_status, a.to_status, a.created_at, u.name AS actor_name
        FROM crm.lead_activities a LEFT JOIN identity.users u ON u.id = a.actor_user_id
       WHERE a.lead_id = ${String(r.id)} ORDER BY a.created_at DESC LIMIT 100`),
    listVisits(actor, { leadReference: referenceId }, 1),
  ]);
  return {
    referenceId: String(r.reference_id),
    status: r.status as LeadStatus,
    source: String(r.source),
    contactName: String(r.contact_name),
    contactPhone: (r.phone as string) ?? null,
    contactEmail: (r.email as string) ?? null,
    listingReferenceId: (r.listing_reference_id as string) ?? null,
    listingTitle: (r.listing_title as string) ?? null,
    agentName: (r.agent_name as string) ?? null,
    organization: String(r.organization),
    createdAt: iso(r.created_at)!,
    lastActivityAt: iso(r.last_activity_at)!,
    message: (r.message as string) ?? null,
    lostReason: (r.lost_reason as string) ?? null,
    contactReferenceId: String(r.contact_reference_id),
    activities: (activities.rows as Row[]).map((a) => ({
      type: String(a.activity_type),
      body: (a.body as string) ?? null,
      fromStatus: (a.from_status as string) ?? null,
      toStatus: (a.to_status as string) ?? null,
      actorName: (a.actor_name as string) ?? null,
      createdAt: iso(a.created_at)!,
    })),
    visits: visits.rows,
  };
}

async function lockLead(tx: Tx, actor: Actor, referenceId: string) {
  if (!isReferenceId(referenceId, "LEAD")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ld.id, ld.status FROM crm.leads ld
     WHERE ld.reference_id = ${referenceId} AND ld.deleted_at IS NULL AND ${leadScope(actor, "leads.manage")} FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { id: String(r.id), status: r.status as LeadStatus };
}

export async function updateLeadStatus(actor: Actor, referenceId: string, raw: { status?: unknown; note?: unknown; lostReason?: unknown }) {
  const status = raw.status;
  if (typeof status !== "string" || !(LEAD_STATUSES as readonly string[]).includes(status)) throw invalid("Choose a status.");
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 2000) : "";
  const lostReason = typeof raw.lostReason === "string" ? raw.lostReason.trim().slice(0, 500) : "";
  if (status === "lost" && lostReason.length < 3) throw invalid("Say why the lead was lost.", { lostReason: "Say why the lead was lost" });

  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, actor, referenceId);
    if (!LEAD_TRANSITIONS[lead.status].includes(status as LeadStatus)) {
      throw conflict(`A ${LEAD_STATUS_LABELS[lead.status].toLowerCase()} lead can't move to ${LEAD_STATUS_LABELS[status as LeadStatus].toLowerCase()}.`);
    }
    await tx.execute(sql`
      UPDATE crm.leads SET status = ${status}, lost_reason = ${status === "lost" ? lostReason : null}, last_activity_at = now(), updated_at = now()
       WHERE id = ${lead.id}`);
    await tx.execute(sql`
      INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, from_status, to_status, actor_user_id)
      VALUES (gen_random_uuid(), ${lead.id}, 'status_changed', ${note || (status === "lost" ? lostReason : null)}, ${lead.status}, ${status}, ${actor.userId})`);
  });
}

export async function addLeadNote(actor: Actor, referenceId: string, rawNote: unknown) {
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length < 1 || note.length > 2000) throw invalid("Write a note of up to 2,000 characters.", { note: "Write a note of up to 2,000 characters" });
  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, actor, referenceId);
    await tx.execute(sql`UPDATE crm.leads SET last_activity_at = now(), updated_at = now() WHERE id = ${lead.id}`);
    await tx.execute(sql`
      INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id) VALUES (gen_random_uuid(), ${lead.id}, 'note', ${note}, ${actor.userId})`);
  });
}

// ── Visits ───────────────────────────────────────────────────────────────────

export type VisitRow = {
  referenceId: string;
  status: VisitStatus;
  requestedFor: string | null;
  scheduledAt: string | null;
  notes: string | null;
  listingReferenceId: string | null;
  listingTitle: string | null;
  leadReferenceId: string | null;
  contactName: string | null;
  agentName: string | null;
  createdAt: string;
};

export const visitFilters = z.object({
  status: z.enum(VISIT_STATUSES).optional().catch(undefined),
  upcoming: z.preprocess((v) => v === "1", z.boolean()).catch(false),
});

export async function listVisits(
  actor: Actor,
  filters: { status?: VisitStatus; upcoming?: boolean; leadReference?: string },
  page: number,
): Promise<Page<VisitRow>> {
  const where: SQL[] = [visitScope(actor, "visits.view")];
  if (filters.status) where.push(sql`v.status = ${filters.status}`);
  if (filters.upcoming) where.push(sql`v.status IN ('requested', 'scheduled') AND coalesce(v.scheduled_at, v.requested_for) >= now() - interval '1 day'`);
  if (filters.leadReference) where.push(sql`ld.reference_id = ${filters.leadReference}`);
  const whereSql = sql.join(where, sql` AND `);
  const from = sql`
    FROM crm.visits v
    LEFT JOIN crm.leads ld ON ld.id = v.lead_id
    LEFT JOIN crm.contacts c ON c.id = ld.contact_id
    LEFT JOIN marketplace.listings l ON l.id = v.listing_id
    LEFT JOIN identity.users ag ON ag.id = v.agent_user_id`;
  const { limit: take, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT v.reference_id, v.status, v.requested_for, v.scheduled_at, v.notes, v.created_at, l.reference_id AS listing_reference_id,
             l.title AS listing_title, ld.reference_id AS lead_reference_id, c.name AS contact_name, ag.name AS agent_name
      ${from} WHERE ${whereSql}
      ORDER BY (v.status = 'requested') DESC, coalesce(v.scheduled_at, v.requested_for) ASC NULLS LAST LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${from} WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      status: r.status as VisitStatus,
      requestedFor: iso(r.requested_for),
      scheduledAt: iso(r.scheduled_at),
      notes: (r.notes as string) ?? null,
      listingReferenceId: (r.listing_reference_id as string) ?? null,
      listingTitle: (r.listing_title as string) ?? null,
      leadReferenceId: (r.lead_reference_id as string) ?? null,
      contactName: (r.contact_name as string) ?? null,
      agentName: (r.agent_name as string) ?? null,
      createdAt: iso(r.created_at)!,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: take,
  };
}

const VISIT_TRANSITIONS: Record<string, { from: readonly VisitStatus[]; to: VisitStatus }> = VISIT_ACTIONS;

export async function updateVisit(actor: Actor, referenceId: string, raw: { action?: unknown; scheduledAt?: unknown; notes?: unknown }) {
  const def = typeof raw.action === "string" ? VISIT_TRANSITIONS[raw.action] : undefined;
  if (!def) throw invalid("Choose an action.");
  if (!isReferenceId(referenceId, "VIS")) throw notFound();
  let scheduledAt: Date | null = null;
  if (raw.action === "schedule") {
    const parsed = typeof raw.scheduledAt === "string" ? new Date(raw.scheduledAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) throw invalid("Choose a date and time.", { scheduledAt: "Choose a date and time" });
    if (parsed.getTime() < Date.now() - 60_000) throw invalid("Choose a time in the future.", { scheduledAt: "Choose a time in the future" });
    scheduledAt = parsed;
  }
  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 1000) || null : null;

  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT v.id, v.status, v.lead_id, v.customer_user_id, l.reference_id AS listing_reference_id
        FROM crm.visits v LEFT JOIN marketplace.listings l ON l.id = v.listing_id
       WHERE v.reference_id = ${referenceId} AND ${visitScope(actor, "visits.manage")} FOR UPDATE OF v`);
    const visit = rows[0] as Row | undefined;
    if (!visit) throw notFound();
    if (!def.from.includes(visit.status as VisitStatus)) throw conflict(`A ${String(visit.status)} visit can't be changed that way.`);

    await tx.execute(sql`
      UPDATE crm.visits SET status = ${def.to}, scheduled_at = coalesce(${scheduledAt}, scheduled_at), notes = coalesce(${notes}, notes), updated_at = now()
       WHERE id = ${String(visit.id)}`);
    if (visit.lead_id) {
      const leadId = String(visit.lead_id);
      await tx.execute(sql`
        INSERT INTO crm.lead_activities (id, lead_id, activity_type, body, actor_user_id)
        VALUES (gen_random_uuid(), ${leadId}, 'visit_updated', ${`Visit ${def.to.replace("_", " ")}${scheduledAt ? ` for ${scheduledAt.toISOString()}` : ""}`}, ${actor.userId})`);
      // Scheduling moves an early-stage lead forward; later stages are left alone.
      if (def.to === "scheduled") {
        await tx.execute(sql`
          UPDATE crm.leads SET status = 'visit_scheduled', last_activity_at = now(), updated_at = now()
           WHERE id = ${leadId} AND status IN ('new', 'contacted', 'qualified')`);
      }
    }
    if (visit.customer_user_id && (def.to === "scheduled" || def.to === "cancelled")) {
      await notify(tx, [String(visit.customer_user_id)], {
        type: "visit_updated",
        title: def.to === "scheduled" ? `Your visit is confirmed for ${scheduledAt!.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` : "Your visit was cancelled",
        body: notes ?? undefined,
        link: visit.listing_reference_id ? `/listings/${visit.listing_reference_id}` : undefined,
      });
    }
  });
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export type ContactRow = { referenceId: string; name: string; email: string | null; phone: string | null; leads: number; lastActivityAt: string | null; createdAt: string };

export async function listContacts(actor: Actor, q: string | undefined, page: number): Promise<Page<ContactRow>> {
  assertCan(actor, "contacts.view");
  const where: SQL[] = [sql`c.deleted_at IS NULL`, contactScope(actor, "contacts.view")];
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push(sql`(c.reference_id = ${normalizeReferenceId(q)} OR c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.phone LIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT c.reference_id, c.name, c.email, c.phone, c.created_at,
             (SELECT count(*) FROM crm.leads ld WHERE ld.contact_id = c.id AND ld.deleted_at IS NULL)::int AS leads,
             (SELECT max(ld.last_activity_at) FROM crm.leads ld WHERE ld.contact_id = c.id) AS last_activity_at
        FROM crm.contacts c WHERE ${whereSql}
       ORDER BY last_activity_at DESC NULLS LAST LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM crm.contacts c WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      name: String(r.name),
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      leads: Number(r.leads),
      lastActivityAt: iso(r.last_activity_at),
      createdAt: iso(r.created_at)!,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: take,
  };
}

/** For the public listing page: who a customer would be contacting, and whether they already have. */
export async function enquiryContext(listingReference: string, userId: string | null) {
  const { rows } = await db.execute(sql`
    SELECT u.name AS agent_name, o.name AS organization, o.org_type, ap.verification_status,
           ${userId ? sql`EXISTS (SELECT 1 FROM crm.leads ld JOIN crm.contacts c ON c.id = ld.contact_id
                                   WHERE ld.listing_id = l.id AND c.user_id = ${userId} AND ld.status NOT IN ('converted', 'lost'))` : sql`false`} AS has_open_enquiry,
           ${userId ? sql`la.agent_user_id = ${userId}` : sql`false`} AS is_own
      FROM marketplace.listings l
      JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
      JOIN identity.users u ON u.id = la.agent_user_id
      JOIN orgs.organizations o ON o.id = l.organization_id
      LEFT JOIN orgs.agent_profiles ap ON ap.user_id = u.id
     WHERE l.reference_id = ${listingReference} AND l.status = 'published'`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    agentName: String(r.agent_name),
    organization: r.org_type === "personal" ? null : String(r.organization),
    agentVerified: r.verification_status === "verified",
    hasOpenEnquiry: Boolean(r.has_open_enquiry),
    isOwn: Boolean(r.is_own),
  };
}


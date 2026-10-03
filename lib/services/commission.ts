import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type RoleCode, purposesForRoles } from "@/lib/authz/catalog";
import { listingScope } from "@/lib/authz/scope";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema/platform";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { COMMISSION_SERVICE_LABELS, DEFAULT_GST_PERCENT, type Rate, computeCommission, describeRate } from "@/lib/commission/terms";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { COMMISSION_BASES, COMMISSION_SERVICES, type CommissionBasis, type CommissionService, type CommissionStatus } from "@/lib/vocab";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { notify } from "./notifications";
import { type Page, pageParams } from "./pagination";

/**
 * Trustbrick's commission (lib/db/schema/finance.ts). Rates: a platform default per service,
 * which a partner organization's own rate overrides. Partners accept the rates in force before
 * they submit listings. Charges are written when a deal closes or a stay begins, at the rate in
 * force that day; amounts never change afterwards, only the status (due → paid or waived).
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const GST_KEY = "commission.gst_percent";

export type RatesView = Record<CommissionService, Rate & { custom: boolean; defaultPercent: number }>;

// ── Rates ────────────────────────────────────────────────────────────────────

/** The rates in force for an organization (or the defaults, without one). */
export async function ratesFor(organizationId: string | null, tx: DbOrTx = db): Promise<RatesView> {
  const { rows } = await tx.execute(sql`
    SELECT DISTINCT ON (organization_id, service) organization_id, service, basis, percent
      FROM finance.commission_rates
     WHERE organization_id IS NULL ${organizationId ? sql`OR organization_id = ${organizationId}` : sql``}
     ORDER BY organization_id, service, created_at DESC, id DESC`);
  const defaults = new Map<string, Row>();
  const own = new Map<string, Row>();
  for (const r of rows as Row[]) (r.organization_id ? own : defaults).set(String(r.service), r);
  const out = {} as RatesView;
  for (const service of COMMISSION_SERVICES) {
    const d = defaults.get(service);
    const basis = (d?.basis as CommissionBasis) ?? "deal_value";
    const defaultPercent = num(d?.percent) ?? 0;
    const o = own.get(service);
    const custom = o !== undefined && o.percent !== null;
    out[service] = { basis, percent: custom ? Number(o!.percent) : defaultPercent, custom, defaultPercent };
  }
  return out;
}

export async function getGstPercent(tx: DbOrTx = db): Promise<number> {
  const { rows } = await tx.execute(sql`SELECT value FROM platform.system_settings WHERE key = ${GST_KEY}`);
  const v = (rows[0] as Row | undefined)?.value;
  return typeof v === "number" ? v : DEFAULT_GST_PERCENT;
}

const reasonText = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500, "Keep it under 500 characters");
const percentField = z.coerce.number({ message: "Enter a percentage" }).min(0, "From 0 to 50%").max(50, "From 0 to 50%");

const defaultRateSchema = z.object({
  service: z.enum(COMMISSION_SERVICES),
  basis: z.enum(COMMISSION_BASES, { message: "Choose what it's a percentage of" }),
  percent: percentField,
  reason: reasonText,
});

/** A platform default. SuperAdmin only; partners on the default will be asked to accept it again. */
export async function setDefaultRate(actor: Actor, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "settings.manage", "platform");
  const parsed = defaultRateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const { service, basis, percent, reason } = parsed.data;
  if (service === "stay" && basis === "brokerage") throw invalid("Hosts don't earn brokerage: Home Stay commission is a share of each booking.", { basis: "Use the deal value for Home Stay" });
  await db.transaction(async (tx) => {
    const before = (await ratesFor(null, tx))[service];
    await tx.execute(sql`INSERT INTO finance.commission_rates (id, organization_id, service, basis, percent, reason, set_by)
                         VALUES (gen_random_uuid(), NULL, ${service}, ${basis}, ${percent}, ${reason}, ${actor.userId})`);
    await audit(tx, actor, { event: "COMMISSION_RATE_SET", target: { type: "commission_default", referenceId: service }, before: { basis: before.basis, percent: before.defaultPercent }, after: { basis, percent }, metadata: { reason } }, ctx);
  });
}

const gstSchema = z.object({ percent: z.coerce.number({ message: "Enter a percentage" }).min(0, "From 0 to 28%").max(28, "From 0 to 28%"), reason: reasonText });

export async function setGstPercent(actor: Actor, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "settings.manage", "platform");
  const parsed = gstSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const before = await getGstPercent(tx);
    await tx
      .insert(systemSettings)
      .values({ key: GST_KEY, value: parsed.data.percent, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: parsed.data.percent, updatedBy: actor.userId, updatedAt: new Date() } });
    await audit(tx, actor, { event: "SYSTEM_SETTING_CHANGED", target: { type: "setting", referenceId: GST_KEY }, before: { value: before }, after: { value: parsed.data.percent }, metadata: { reason: parsed.data.reason } }, ctx);
  });
}

const partnerRateSchema = z.object({
  service: z.enum(COMMISSION_SERVICES),
  /** Blank means "back to the default". */
  percent: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), percentField.nullable()),
  reason: reasonText,
});

/** Partner organizations by reference, for the admin pages. */
async function organizationByRef(tx: DbOrTx, referenceId: string): Promise<{ id: string; name: string }> {
  if (!isReferenceId(referenceId, "ORG")) throw notFound();
  const { rows } = await tx.execute(sql`SELECT id, name FROM orgs.organizations WHERE reference_id = ${referenceId} AND deleted_at IS NULL AND org_type <> 'internal'`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { id: String(r.id), name: String(r.name) };
}

/** A partner's own rate for one service, set when they're onboarded or later. Applies to future charges. */
export async function setPartnerRate(actor: Actor, organizationRef: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "commission.manage", "platform");
  const parsed = partnerRateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const { service, percent, reason } = parsed.data;
  await db.transaction(async (tx) => {
    const org = await organizationByRef(tx, organizationRef);
    const before = (await ratesFor(org.id, tx))[service];
    if ((percent === null && !before.custom) || (percent !== null && before.custom && percent === before.percent)) throw conflict("That's already the rate.");
    await tx.execute(sql`INSERT INTO finance.commission_rates (id, organization_id, service, basis, percent, reason, set_by)
                         VALUES (gen_random_uuid(), ${org.id}, ${service}, NULL, ${percent}, ${reason}, ${actor.userId})`);
    await audit(
      tx,
      actor,
      {
        event: "COMMISSION_RATE_SET",
        target: { type: "organization", id: org.id, referenceId: organizationRef },
        organizationId: org.id,
        before: { service, percent: before.percent, custom: before.custom },
        after: { service, percent: percent ?? before.defaultPercent, custom: percent !== null },
        metadata: { reason },
      },
      ctx,
    );
    const members = await tx.execute(sql`SELECT user_id FROM orgs.memberships WHERE organization_id = ${org.id} AND status = 'active'`);
    const after = { basis: before.basis, percent: percent ?? before.defaultPercent };
    await notify(
      tx,
      (members.rows as Row[]).map((m) => String(m.user_id)),
      { type: "commission_rates_changed", title: `Your commission on ${COMMISSION_SERVICE_LABELS[service].toLowerCase()} is now ${describeRate(service, after)}`, body: "Review and accept your rates to keep submitting listings.", link: "/commission" },
    );
  });
}

/** Every rate change for an organization, newest first, for its admin page. */
export async function rateHistory(actor: Actor, organizationId: string) {
  assertCan(actor, "commission.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT r.service, r.percent, r.reason, r.created_at, u.name AS set_by
      FROM finance.commission_rates r LEFT JOIN identity.users u ON u.id = r.set_by
     WHERE r.organization_id = ${organizationId} ORDER BY r.created_at DESC LIMIT 20`);
  return (rows as Row[]).map((r) => ({ service: String(r.service) as CommissionService, percent: num(r.percent), reason: String(r.reason), setBy: (r.set_by as string) ?? null, at: iso(r.created_at)! }));
}

// ── Acceptance ───────────────────────────────────────────────────────────────

const snapshot = (rates: RatesView) => Object.fromEntries(COMMISSION_SERVICES.map((s) => [s, { basis: rates[s].basis, percent: rates[s].percent }]));
const same = (a: Record<string, Rate>, b: Record<string, Rate>, services: readonly CommissionService[]) =>
  services.every((s) => a[s]?.basis === b[s]?.basis && Number(a[s]?.percent) === Number(b[s]?.percent));

/**
 * The services an organization can be charged for: what its members' roles may list. A host's
 * own organization offers stays alone, so a change to the PG rate doesn't ask them to accept again.
 */
export async function servicesFor(organizationId: string, tx: DbOrTx = db): Promise<CommissionService[]> {
  const { rows } = await tx.execute(sql`
    SELECT DISTINCT r.code FROM orgs.memberships m
      JOIN orgs.membership_roles mr ON mr.membership_id = m.id JOIN orgs.roles r ON r.id = mr.role_id
     WHERE m.organization_id = ${organizationId} AND m.status = 'active'`);
  const purposes = purposesForRoles((rows as Row[]).map((r) => String(r.code)) as RoleCode[]);
  const services = COMMISSION_SERVICES.filter((s) => purposes.includes(s));
  return services.length ? services : [...COMMISSION_SERVICES];
}

export type AcceptanceView = { accepted: boolean; outdated: boolean; acceptedAt: string | null; acceptedBy: string | null };

export async function acceptanceFor(organizationId: string, tx: DbOrTx = db, rates?: RatesView): Promise<AcceptanceView> {
  const current = rates ?? (await ratesFor(organizationId, tx));
  const { rows } = await tx.execute(sql`
    SELECT a.rates, a.accepted_at, u.name FROM finance.commission_acceptances a LEFT JOIN identity.users u ON u.id = a.accepted_by
     WHERE a.organization_id = ${organizationId} ORDER BY a.accepted_at DESC, a.id DESC LIMIT 1`);
  const r = rows[0] as Row | undefined;
  if (!r) return { accepted: false, outdated: false, acceptedAt: null, acceptedBy: null };
  const fresh = same(r.rates as Record<string, Rate>, snapshot(current), await servicesFor(organizationId, tx));
  return { accepted: fresh, outdated: !fresh, acceptedAt: iso(r.accepted_at), acceptedBy: (r.name as string) ?? null };
}

/** Who may accept for the organization: its broker admin, or the person whose own organization it is. */
export function canAcceptTerms(actor: Actor): boolean {
  if (actor.workspace !== "professional" || !can(actor, "commission.view")) return false;
  return actor.organization.orgType === "personal" || actor.permissions["commission.view"] === "org";
}

export async function acceptCommissionTerms(actor: Actor, ctx: RequestContext) {
  if (!canAcceptTerms(actor)) throw new AppError("FORBIDDEN", "Only your organization's admin can accept commission terms.");
  await db.transaction(async (tx) => {
    const rates = await ratesFor(actor.organization.id, tx);
    if ((await acceptanceFor(actor.organization.id, tx, rates)).accepted) return;
    await tx.execute(sql`INSERT INTO finance.commission_acceptances (id, organization_id, rates, accepted_by)
                         VALUES (gen_random_uuid(), ${actor.organization.id}, ${JSON.stringify(snapshot(rates))}::jsonb, ${actor.userId})`);
    await audit(tx, actor, { event: "COMMISSION_TERMS_ACCEPTED", target: { type: "organization", id: actor.organization.id }, organizationId: actor.organization.id, after: snapshot(rates) }, ctx);
  });
}

/** Submitting a listing needs the organization to have accepted the rates in force. */
export async function termsGap(tx: DbOrTx, organizationId: string): Promise<string | null> {
  const a = await acceptanceFor(organizationId, tx);
  if (a.accepted) return null;
  return a.outdated ? "Accept Trustbrick's updated commission rates" : "Accept Trustbrick's commission rates";
}

// ── Charges ──────────────────────────────────────────────────────────────────

type ChargeInput = {
  organizationId: string;
  listingId: string;
  bookingId?: string | null;
  service: CommissionService;
  dealValue: number;
  brokerage?: number | null;
  description: string;
  createdBy: string | null;
  notifyUserId?: string | null;
};

async function writeCharge(tx: Tx, who: Actor | PersonActor | null, c: ChargeInput, ctx: RequestContext) {
  const rate = (await ratesFor(c.organizationId, tx))[c.service];
  const gstPercent = await getGstPercent(tx);
  const calc = computeCommission({ basis: rate.basis, percent: rate.percent, dealValue: c.dealValue, brokerage: c.brokerage, gstPercent });
  const { rows } = await tx.execute(sql`
    INSERT INTO finance.commission_entries
      (id, organization_id, listing_id, booking_id, kind, service, deal_value, brokerage_amount, basis, rate_percent, amount, gst_percent, gst_amount, total, description, created_by)
    VALUES (gen_random_uuid(), ${c.organizationId}, ${c.listingId}, ${c.bookingId ?? null}, 'charge', ${c.service}, ${c.dealValue}, ${c.brokerage ?? null}, ${rate.basis}, ${rate.percent},
            ${calc.amount}, ${gstPercent}, ${calc.gst}, ${calc.total}, ${c.description}, ${c.createdBy})
    ON CONFLICT DO NOTHING
    RETURNING id, reference_id`);
  const r = rows[0] as Row | undefined;
  if (!r) return null; // A booking already charged.
  await audit(
    tx,
    who,
    { event: "COMMISSION_CHARGED", target: { type: "commission", id: String(r.id), referenceId: String(r.reference_id) }, organizationId: c.organizationId, after: { service: c.service, dealValue: c.dealValue, brokerage: c.brokerage ?? null, rate: rate.percent, basis: rate.basis, total: calc.total } },
    ctx,
  );
  if (c.notifyUserId && calc.total > 0) {
    await notify(tx, [c.notifyUserId], {
      type: "commission_charged",
      title: `Commission of ₹${calc.total.toLocaleString("en-IN")} added: ${c.description}`,
      body: `${describeRate(c.service, rate)}${gstPercent ? `, plus ${gstPercent}% GST` : ""}.`,
      link: "/commission",
    });
  }
  return { referenceId: String(r.reference_id), ...calc };
}

const dealSchema = z.object({
  dealValue: z.coerce.number({ message: "Enter the final price" }).positive("Enter the final price").max(100_000_000_000),
  brokerage: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number({ message: "Enter the brokerage you earned" }).min(0).max(10_000_000_000).optional()),
});

/** A closed sale, rental or lease. Called inside the listing's "mark as sold" transaction. */
export async function chargeClosedDeal(
  tx: Tx,
  actor: Actor,
  listing: { id: string; referenceId: string; organizationId: string; transactionType: string; primaryAgentUserId: string | null },
  raw: unknown,
  ctx: RequestContext,
) {
  const service = listing.transactionType as CommissionService;
  const parsed = dealSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the deal details.", fieldErrorsFrom(parsed.error));
  const rate = (await ratesFor(listing.organizationId, tx))[service];
  if (rate.basis === "brokerage" && parsed.data.brokerage === undefined) throw invalid("Enter the brokerage you earned.", { brokerage: "Enter the brokerage you earned, in rupees (0 if none)" });
  const what = service === "sale" ? "Sale" : service === "lease" ? "Lease" : "Rental";
  return writeCharge(
    tx,
    actor,
    {
      organizationId: listing.organizationId,
      listingId: listing.id,
      service,
      dealValue: parsed.data.dealValue,
      brokerage: parsed.data.brokerage ?? null,
      description: `${what} of ${listing.referenceId}`,
      createdBy: actor.userId,
      notifyUserId: listing.primaryAgentUserId !== actor.userId ? listing.primaryAgentUserId : null,
    },
    ctx,
  );
}

/** A stay's commission, when the guest checks in. Once per booking, whatever happens later. */
export async function chargeBooking(tx: Tx, who: Actor | PersonActor | null, bookingId: string, ctx: RequestContext) {
  const { rows } = await tx.execute(sql`SELECT b.id, b.reference_id, b.listing_id, b.organization_id, b.total, b.host_user_id FROM stays.bookings b WHERE b.id = ${bookingId}`);
  const b = rows[0] as Row;
  return writeCharge(
    tx,
    who,
    {
      organizationId: String(b.organization_id),
      listingId: String(b.listing_id),
      bookingId: String(b.id),
      service: "stay",
      dealValue: Number(b.total),
      description: `Stay ${String(b.reference_id)}`,
      createdBy: who?.userId ?? null,
      notifyUserId: String(b.host_user_id),
    },
    ctx,
  );
}

// ── The ledger ───────────────────────────────────────────────────────────────

export const ledgerFilters = z.object({
  status: z.enum(["due", "paid", "waived", "all"]).catch("due"),
  service: z.enum(COMMISSION_SERVICES).optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type LedgerFilters = z.infer<typeof ledgerFilters>;

export type LedgerRow = {
  referenceId: string;
  kind: "charge" | "adjustment";
  service: CommissionService;
  description: string;
  organization: { name: string; referenceId: string };
  listing: { referenceId: string; title: string } | null;
  bookingReferenceId: string | null;
  dealValue: number | null;
  brokerage: number | null;
  basis: CommissionBasis | null;
  ratePercent: number | null;
  amount: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  status: CommissionStatus;
  collection: "invoice" | "gateway";
  paymentReference: string | null;
  statusNote: string | null;
  statusChangedBy: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  overdue: boolean;
};

export const OVERDUE_DAYS = 30;

/** Whose charges the actor sees: everything for admins, their organization's for its admin or a sole trader, their own deals otherwise. */
function ledgerScope(actor: Actor): ReturnType<typeof sql> {
  const scope = assertCan(actor, "commission.view");
  if (scope === "platform") return sql`TRUE`;
  if (scope === "org" || actor.organization.orgType === "personal") return sql`e.organization_id = ${actor.organization.id}`;
  return sql`(e.organization_id = ${actor.organization.id} AND e.listing_id IS NOT NULL AND EXISTS (SELECT 1 FROM marketplace.listings l WHERE l.id = e.listing_id AND ${listingScope(actor, "commission.view")}))`;
}

export async function listLedger(actor: Actor, filters: LedgerFilters, page: number, only: { listingId?: string } = {}): Promise<Page<LedgerRow> & { totals: { due: number; overdue: number; paidThisMonth: number; chargedThisMonth: number; dueCount: number } }> {
  const scope = ledgerScope(actor);
  const where = [scope];
  if (only.listingId) where.push(sql`e.listing_id = ${only.listingId}`);
  if (filters.status !== "all") where.push(sql`e.status = ${filters.status}`);
  if (filters.service) where.push(sql`e.service = ${filters.service}`);
  if (filters.month) where.push(sql`to_char(e.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ${filters.month}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(e.reference_id = ${ref} OR l.reference_id = ${ref} OR o.reference_id = ${ref} OR o.name ILIKE ${like} OR e.description ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const from = sql`FROM finance.commission_entries e
                   JOIN orgs.organizations o ON o.id = e.organization_id
                   LEFT JOIN marketplace.listings l ON l.id = e.listing_id
                   LEFT JOIN stays.bookings b ON b.id = e.booking_id`;
  const { limit, offset } = pageParams(page);
  const overdue = sql`e.status = 'due' AND e.created_at < now() - ${`${OVERDUE_DAYS} days`}::interval`;
  // The start of this month in India, as a timestamp.
  const monthStart = sql`(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;
  const [rows, count, totals] = await Promise.all([
    db.execute(sql`
      SELECT e.*, o.name AS org_name, o.reference_id AS org_reference_id, l.reference_id AS listing_reference_id, l.title AS listing_title,
             b.reference_id AS booking_reference_id, u.name AS changed_by_name, (${overdue}) AS is_overdue
        ${from} LEFT JOIN identity.users u ON u.id = e.status_changed_by
       WHERE ${whereSql} ORDER BY e.created_at DESC, e.id DESC LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${whereSql}`),
    db.execute(sql`
      SELECT coalesce(sum(e.total) FILTER (WHERE e.status = 'due'), 0) AS due,
             count(*) FILTER (WHERE e.status = 'due')::int AS due_count,
             coalesce(sum(e.total) FILTER (WHERE ${overdue}), 0) AS overdue,
             coalesce(sum(e.total) FILTER (WHERE e.status = 'paid' AND e.status_changed_at >= ${monthStart}), 0) AS paid_month,
             coalesce(sum(e.total) FILTER (WHERE e.status <> 'waived' AND e.created_at >= ${monthStart}), 0) AS charged_month
        FROM finance.commission_entries e WHERE ${scope}`),
  ]);
  const t = totals.rows[0] as Row;
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      kind: r.kind as LedgerRow["kind"],
      service: r.service as CommissionService,
      description: String(r.description),
      organization: { name: String(r.org_name), referenceId: String(r.org_reference_id) },
      listing: r.listing_reference_id ? { referenceId: String(r.listing_reference_id), title: String(r.listing_title) } : null,
      bookingReferenceId: (r.booking_reference_id as string) ?? null,
      dealValue: num(r.deal_value),
      brokerage: num(r.brokerage_amount),
      basis: (r.basis as CommissionBasis) ?? null,
      ratePercent: num(r.rate_percent),
      amount: Number(r.amount),
      gstPercent: Number(r.gst_percent),
      gstAmount: Number(r.gst_amount),
      total: Number(r.total),
      status: r.status as CommissionStatus,
      collection: r.collection as LedgerRow["collection"],
      paymentReference: (r.payment_reference as string) ?? null,
      statusNote: (r.status_note as string) ?? null,
      statusChangedBy: (r.changed_by_name as string) ?? null,
      statusChangedAt: iso(r.status_changed_at),
      createdAt: iso(r.created_at)!,
      overdue: Boolean(r.is_overdue),
    })),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: limit,
    totals: { due: Number(t.due), overdue: Number(t.overdue), paidThisMonth: Number(t.paid_month), chargedThisMonth: Number(t.charged_month), dueCount: Number(t.due_count) },
  };
}

const statusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("paid"), paymentReference: z.string().trim().min(3, "Enter the bank, UPI or cheque reference").max(120), note: z.string().trim().max(500).optional() }),
  z.object({ status: z.literal("waived"), note: z.string().trim().min(10, "Say why it's being waived (at least 10 characters)").max(500) }),
]);

/** Records a payment, or waives a charge. Only a due charge moves, and only once. */
export async function updateEntryStatus(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "commission.manage", "platform");
  if (!isReferenceId(referenceId, "COM")) throw notFound();
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = fieldErrorsFrom(parsed.error);
    throw invalid(Object.values(errors)[0] ?? "Please check the details.", {
      ...(errors.note ? { reason: errors.note } : {}),
      ...(errors.paymentReference ? { paymentReference: errors.paymentReference } : {}),
    });
  }
  const input = parsed.data;
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT id, status, organization_id, total FROM finance.commission_entries WHERE reference_id = ${referenceId} FOR UPDATE`);
    const r = rows[0] as Row | undefined;
    if (!r) throw notFound();
    if (r.status !== "due") throw conflict(`This charge is already ${String(r.status)}.`);
    await tx.execute(sql`
      UPDATE finance.commission_entries
         SET status = ${input.status}, payment_reference = ${input.status === "paid" ? input.paymentReference : null},
             status_note = ${input.note ?? null}, status_changed_by = ${actor.userId}, status_changed_at = now()
       WHERE id = ${String(r.id)}`);
    await audit(
      tx,
      actor,
      { event: "COMMISSION_STATUS_CHANGED", target: { type: "commission", id: String(r.id), referenceId }, organizationId: String(r.organization_id), before: { status: "due" }, after: { status: input.status }, metadata: { total: Number(r.total), reference: input.status === "paid" ? input.paymentReference : undefined, note: input.note } },
      ctx,
    );
  });
}

const adjustmentSchema = z.object({
  organization: z.string().trim().transform(normalizeReferenceId).refine((v) => isReferenceId(v, "ORG"), "Enter the partner's ORG- reference"),
  service: z.enum(COMMISSION_SERVICES, { message: "Choose the service" }),
  listing: z.preprocess((v) => (typeof v === "string" && v.trim() ? normalizeReferenceId(v) : undefined), z.string().refine((v) => isReferenceId(v, "LST"), "Enter an LST- reference, or leave it blank").optional()),
  amount: z.coerce.number({ message: "Enter an amount" }).refine((v) => v !== 0, "Enter an amount other than 0").refine((v) => Math.abs(v) <= 100_000_000, "That's too large"),
  description: z.string().trim().min(10, "Describe it in at least 10 characters").max(200),
});

/**
 * A charge the team adds (a PG tenant's move-in, say) or a credit (a negative amount) to correct
 * one. GST is applied the same way as on charges.
 */
export async function addAdjustment(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "commission.manage", "platform");
  const parsed = adjustmentSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const org = await organizationByRef(tx, input.organization);
    let listingId: string | null = null;
    if (input.listing) {
      const { rows } = await tx.execute(sql`SELECT id FROM marketplace.listings WHERE reference_id = ${input.listing} AND organization_id = ${org.id}`);
      if (!rows[0]) throw invalid("Please check the highlighted fields.", { listing: "That listing doesn't belong to this partner" });
      listingId = String((rows[0] as Row).id);
    }
    const gstPercent = await getGstPercent(tx);
    const amount = Math.round(input.amount * 100) / 100;
    const gst = Math.round(amount * gstPercent) / 100;
    const { rows } = await tx.execute(sql`
      INSERT INTO finance.commission_entries (id, organization_id, listing_id, kind, service, amount, gst_percent, gst_amount, total, description, created_by)
      VALUES (gen_random_uuid(), ${org.id}, ${listingId}, 'adjustment', ${input.service}, ${amount}, ${gstPercent}, ${gst}, ${Math.round((amount + gst) * 100) / 100}, ${input.description}, ${actor.userId})
      RETURNING id, reference_id`);
    const r = rows[0] as Row;
    await audit(tx, actor, { event: "COMMISSION_ADJUSTED", target: { type: "commission", id: String(r.id), referenceId: String(r.reference_id) }, organizationId: org.id, after: { amount, gst, service: input.service, description: input.description } }, ctx);
    return { referenceId: String(r.reference_id) };
  });
}

/**
 * Sales and rentals marked closed without a commission in the last 90 days: "someone else
 * closed it" or "taken off the market". Worth a look; most are genuine.
 */
export async function closedWithoutCommission(actor: Actor) {
  assertCan(actor, "commission.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT DISTINCT ON (l.id) l.reference_id, l.title, l.transaction_type, h.reason, h.created_at, o.name AS org_name, o.reference_id AS org_reference_id
      FROM marketplace.listing_status_history h
      JOIN marketplace.listings l ON l.id = h.listing_id
      JOIN orgs.organizations o ON o.id = l.organization_id
     WHERE h.action = 'mark_closed' AND h.created_at > now() - interval '90 days' AND l.transaction_type IN ('sale', 'rent', 'lease')
       AND NOT EXISTS (SELECT 1 FROM finance.commission_entries e WHERE e.listing_id = l.id AND e.created_at >= h.created_at - interval '1 minute')
     ORDER BY l.id, h.created_at DESC`);
  return (rows as Row[])
    .map((r) => ({
      listingReferenceId: String(r.reference_id),
      title: String(r.title),
      purpose: String(r.transaction_type),
      reason: (r.reason as string) ?? null,
      at: iso(r.created_at)!,
      organization: { name: String(r.org_name), referenceId: String(r.org_reference_id) },
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The partner organization behind an agent or host, for their admin pages. */
export async function organizationForPerson(userId: string): Promise<{ id: string; referenceId: string; name: string; personal: boolean } | null> {
  const { rows } = await db.execute(sql`
    SELECT o.id, o.reference_id, o.name, o.org_type FROM orgs.memberships m JOIN orgs.organizations o ON o.id = m.organization_id
     WHERE m.user_id = ${userId} AND m.status = 'active' AND o.org_type <> 'internal' AND o.deleted_at IS NULL
     ORDER BY (o.org_type = 'personal'), m.created_at LIMIT 1`);
  const r = rows[0] as Row | undefined;
  return r ? { id: String(r.id), referenceId: String(r.reference_id), name: String(r.name), personal: r.org_type === "personal" } : null;
}

export type DealContext = {
  purpose: "sale" | "rent" | "lease";
  price: number | null;
  /** What the listing's brokerage terms come to at its price, as a starting point. */
  suggestedBrokerage: number | null;
  rate: Rate;
  gstPercent: number;
};

/** What the "how did it close?" form needs: the partner's rate, GST and a brokerage to start from. */
export async function dealContextFor(listing: {
  purpose: string;
  organization: { id: string };
  pricing: { price: number | null; brokerageType: string | null; brokerageValue: number | null };
}): Promise<DealContext | null> {
  if (!["sale", "rent", "lease"].includes(listing.purpose)) return null;
  const purpose = listing.purpose as DealContext["purpose"];
  const [rates, gstPercent] = await Promise.all([ratesFor(listing.organization.id), getGstPercent()]);
  const { price, brokerageType: type, brokerageValue: value } = listing.pricing;
  const suggestedBrokerage =
    price === null
      ? null
      : type === "percent" && value !== null
        ? Math.round((price * value) / 100)
        : type === "months_rent" && value !== null
          ? Math.round(price * value)
          : type === "half_month"
            ? Math.round(price / 2)
            : type === "fixed"
              ? value
              : type === "none"
                ? 0
                : null;
  return { purpose, price, suggestedBrokerage, rate: { basis: rates[purpose].basis, percent: rates[purpose].percent }, gstPercent };
}

/** The team's view on the admin dashboard: totals, who owes the most, the latest charges, and what needs a look. */
export async function commissionOverview(actor: Actor) {
  assertCan(actor, "commission.view", "platform");
  const [ledger, owing, unaccepted, closures] = await Promise.all([
    listLedger(actor, { status: "all" }, 1),
    db.execute(sql`
      SELECT o.name, o.reference_id, sum(e.total) AS due, count(*)::int AS charges,
             bool_or(e.created_at < now() - ${`${OVERDUE_DAYS} days`}::interval) AS overdue
        FROM finance.commission_entries e JOIN orgs.organizations o ON o.id = e.organization_id
       WHERE e.status = 'due' GROUP BY o.id HAVING sum(e.total) > 0 ORDER BY sum(e.total) DESC LIMIT 5`),
    // Partners with live listings who have never accepted a rate card.
    db.execute(sql`
      SELECT count(DISTINCT l.organization_id)::int AS n FROM marketplace.listings l
       WHERE l.status = 'published' AND l.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM finance.commission_acceptances a WHERE a.organization_id = l.organization_id)`),
    closedWithoutCommission(actor),
  ]);
  return {
    totals: ledger.totals,
    recent: ledger.rows.slice(0, 5),
    owing: (owing.rows as Row[]).map((r) => ({ name: String(r.name), referenceId: String(r.reference_id), due: Number(r.due), charges: Number(r.charges), overdue: Boolean(r.overdue) })),
    unacceptedPartners: Number((unaccepted.rows[0] as Row).n),
    closedWithoutCommission: closures.length,
  };
}

export type ListingCommission = {
  service: CommissionService;
  rate: Rate & { custom: boolean };
  gstPercent: number;
  /** What Trustbrick's commission would be at the listed price and brokerage terms, when that can be worked out. */
  estimate: { total: number; amount: number; gst: number; on: string } | null;
  accepted: boolean;
  charges: LedgerRow[];
  totals: { charged: number; due: number; paid: number };
};

/** Commission on one listing, for its page: the rate, an estimate, and the charges made against it. */
export async function listingCommission(
  actor: Actor,
  listing: { id: string; purpose: string; organization: { id: string }; pricing: { price: number | null; brokerageType: string | null; brokerageValue: number | null } },
): Promise<ListingCommission | null> {
  if (!can(actor, "commission.view")) return null;
  const service = listing.purpose as CommissionService;
  const [rates, gstPercent, acceptance, ledger, deal] = await Promise.all([
    ratesFor(listing.organization.id),
    getGstPercent(),
    acceptanceFor(listing.organization.id),
    listLedger(actor, { status: "all" }, 1, { listingId: listing.id }),
    dealContextFor(listing),
  ]);
  const rate = rates[service];
  const price = listing.pricing.price;
  let estimate: ListingCommission["estimate"] = null;
  if (price !== null) {
    if (deal && (rate.basis === "deal_value" || deal.suggestedBrokerage !== null)) {
      const c = computeCommission({ basis: rate.basis, percent: rate.percent, dealValue: price, brokerage: deal.suggestedBrokerage, gstPercent });
      estimate = { ...c, on: rate.basis === "brokerage" ? `your listed brokerage of ₹${Math.round(deal.suggestedBrokerage ?? 0).toLocaleString("en-IN")}` : `the listed price` };
    } else if (service === "stay" || service === "pg") {
      const c = computeCommission({ basis: "deal_value", percent: rate.percent, dealValue: price, gstPercent });
      estimate = { ...c, on: service === "stay" ? "each night at the listed price" : "each tenant at the lowest rent per bed" };
    }
  }
  const sum = (f: (r: LedgerRow) => boolean) => ledger.rows.filter(f).reduce((a, r) => a + r.total, 0);
  return {
    service,
    rate,
    gstPercent,
    estimate,
    accepted: acceptance.accepted,
    charges: ledger.rows,
    totals: { charged: sum((r) => r.status !== "waived"), due: sum((r) => r.status === "due"), paid: sum((r) => r.status === "paid") },
  };
}

export type BookingCommission =
  | { state: "charged"; referenceId: string; percent: number; amount: number; gst: number; total: number; status: CommissionStatus; overdue: boolean; paymentReference: string | null }
  | { state: "upcoming"; percent: number; amount: number; gst: number; total: number }
  | { state: "none" }
  /** A stay that began before commission was recorded, so it carries none. */
  | { state: "unrecorded" };

/**
 * Commission on one booking, for the host's booking page: the charge once the guest has checked in,
 * an estimate at today's rate before then, and nothing for a stay that didn't happen. Call it only
 * after the booking itself was found in the actor's scope.
 */
export async function bookingCommission(actor: Actor, bookingReference: string): Promise<BookingCommission | null> {
  if (!can(actor, "commission.view")) return null;
  const { rows } = await db.execute(sql`SELECT id FROM stays.bookings WHERE reference_id = ${bookingReference}`);
  const id = (rows[0] as Row | undefined)?.id;
  return id ? ((await commissionForBookings(actor, [String(id)])).get(String(id)) ?? null) : null;
}

/**
 * Commission for a page of bookings at once, for the bookings list: the charge where the guest
 * has checked in, an estimate at today's rate where they haven't yet, nothing otherwise. Pass
 * only bookings already found in the actor's scope.
 */
export async function commissionForBookings(actor: Actor, bookingIds: string[]): Promise<Map<string, BookingCommission>> {
  const out = new Map<string, BookingCommission>();
  if (!can(actor, "commission.view") || bookingIds.length === 0) return out;
  const { rows } = await db.execute(sql`
    SELECT b.id, b.total AS booking_total, b.status AS booking_status, b.organization_id,
           e.reference_id, e.rate_percent, e.amount, e.gst_amount, e.total, e.status, e.payment_reference,
           (e.status = 'due' AND e.created_at < now() - ${`${OVERDUE_DAYS} days`}::interval) AS overdue
      FROM stays.bookings b LEFT JOIN finance.commission_entries e ON e.booking_id = b.id AND e.kind = 'charge'
     WHERE b.id = ANY(${sql.param(bookingIds)}::uuid[])`);
  const gstPercent = await getGstPercent();
  const rates = new Map<string, number>();
  for (const orgId of new Set((rows as Row[]).filter((r) => !r.reference_id).map((r) => String(r.organization_id)))) rates.set(orgId, (await ratesFor(orgId)).stay.percent);
  for (const r of rows as Row[]) {
    const id = String(r.id);
    const status = String(r.booking_status);
    if (r.reference_id) {
      out.set(id, {
        state: "charged",
        referenceId: String(r.reference_id),
        percent: Number(r.rate_percent),
        amount: Number(r.amount),
        gst: Number(r.gst_amount),
        total: Number(r.total),
        status: r.status as CommissionStatus,
        overdue: Boolean(r.overdue),
        paymentReference: (r.payment_reference as string) ?? null,
      });
    } else if (["checked_in", "completed"].includes(status)) {
      out.set(id, { state: "unrecorded" });
    } else if (["requested", "confirmed"].includes(status)) {
      const percent = rates.get(String(r.organization_id)) ?? 0;
      const c = computeCommission({ basis: "deal_value", percent, dealValue: Number(r.booking_total), gstPercent });
      out.set(id, { state: "upcoming", percent, amount: c.amount, gst: c.gst, total: c.total });
    } else {
      out.set(id, { state: "none" });
    }
  }
  return out;
}

export type ListingCommissionSummary = {
  /** The rate that applies to this listing's purpose, for the partner who listed it. */
  rate: Rate & { custom: boolean };
  service: CommissionService;
  /** Charges on it, waived ones left out. */
  charged: number;
  due: number;
  overdue: boolean;
  charges: number;
};

/**
 * Commission for a page of listings at once, for the properties list: what's been charged on
 * each, and otherwise the rate that will apply. Pass only listings already found in scope.
 */
export async function commissionForListings(actor: Actor, listingIds: string[]): Promise<Map<string, ListingCommissionSummary>> {
  const out = new Map<string, ListingCommissionSummary>();
  if (!can(actor, "commission.view") || listingIds.length === 0) return out;
  const { rows } = await db.execute(sql`
    SELECT l.id, l.organization_id, l.transaction_type,
           coalesce(sum(e.total) FILTER (WHERE e.status <> 'waived'), 0) AS charged,
           coalesce(sum(e.total) FILTER (WHERE e.status = 'due'), 0) AS due,
           coalesce(bool_or(e.status = 'due' AND e.created_at < now() - ${`${OVERDUE_DAYS} days`}::interval), false) AS overdue,
           count(e.id) FILTER (WHERE e.status <> 'waived')::int AS charges
      FROM marketplace.listings l LEFT JOIN finance.commission_entries e ON e.listing_id = l.id
     WHERE l.id = ANY(${sql.param(listingIds)}::uuid[])
     GROUP BY l.id`);
  const rates = new Map<string, RatesView>();
  for (const orgId of new Set((rows as Row[]).map((r) => String(r.organization_id)))) rates.set(orgId, await ratesFor(orgId));
  for (const r of rows as Row[]) {
    const service = String(r.transaction_type) as CommissionService;
    const rate = rates.get(String(r.organization_id))![service];
    out.set(String(r.id), { rate, service, charged: Number(r.charged), due: Number(r.due), overdue: Boolean(r.overdue), charges: Number(r.charges) });
  }
  return out;
}

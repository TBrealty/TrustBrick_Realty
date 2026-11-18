import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { noticeMessage } from "@/lib/email/templates";
import { conflict, invalid, notFound } from "@/lib/errors";
import { formatDay, formatMoney } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import type { BankAccountStatus, OwnershipProofKind, PropertyLandlordStatus, RentPaymentStatus, SettlementStatus } from "@/lib/vocab";
import { type RequestContext, audit } from "../audit";
import { notify } from "../notifications";
import { type Row, absoluteUrl, day, iso, num } from "./common";
import { OWNERSHIP_PROOF_LABELS, PROPERTY_LANDLORD_LABELS, revealBankDetails } from "./landlords";
import { SETTLEMENT_COLUMNS, SETTLEMENT_JOINS, type SettlementView, sendRentRefunds, toSettlementView } from "./payments";
import { refreshSettlements } from "./settlement-holds";
import { TENANCY_STATUS_LABELS } from "./tenancies";

/**
 * Trustbrick's side of rent (the Rent page): checking proofs of ownership and bank accounts, and
 * settling rent to landlords from the back office: export what's ready, pay it from the bank, then
 * record each payment with the bank's reference (UTR). Reading a landlord's full bank details is
 * audited every time.
 */

const reasonSchema = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

export type RentCounts = { proofs: number; banks: number; ready: number; onHold: number; failed: number; attention: number };

export async function rentCounts(actor: Actor): Promise<RentCounts> {
  assertCan(actor, "rent.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT (SELECT count(*) FROM rent.property_landlords WHERE status = 'under_review')::int AS proofs,
           (SELECT count(*) FROM rent.landlord_bank_accounts WHERE status = 'pending')::int AS banks,
           (SELECT count(*) FROM rent.settlements WHERE status = 'ready')::int AS ready,
           (SELECT count(*) FROM rent.settlements WHERE status = 'on_hold')::int AS on_hold,
           (SELECT count(*) FROM rent.settlements WHERE status = 'failed')::int AS failed,
           (SELECT count(*) FROM rent.payments WHERE needs_attention)::int AS attention`);
  const r = rows[0] as Row;
  return { proofs: Number(r.proofs), banks: Number(r.banks), ready: Number(r.ready), onHold: Number(r.on_hold), failed: Number(r.failed), attention: Number(r.attention) };
}

export async function rentTotals(actor: Actor) {
  assertCan(actor, "rent.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT coalesce(sum(amount) FILTER (WHERE status = 'ready'), 0) AS ready, coalesce(sum(amount) FILTER (WHERE status = 'on_hold'), 0) AS on_hold,
           coalesce(sum(amount) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', now())), 0) AS paid_this_month,
           (SELECT coalesce(sum(amount), 0) FROM rent.payments WHERE status = 'paid' AND NOT unwanted AND paid_at >= date_trunc('month', now())) AS collected_this_month
      FROM rent.settlements`);
  const r = rows[0] as Row;
  return { ready: num(r.ready), onHold: num(r.on_hold), paidThisMonth: num(r.paid_this_month), collectedThisMonth: num(r.collected_this_month) };
}

// ── Proofs of ownership ──────────────────────────────────────────────────────

export type ProofRow = {
  linkId: string;
  status: PropertyLandlordStatus;
  statusLabel: string;
  landlordName: string;
  landlordReferenceId: string;
  propertyReferenceId: string;
  title: string;
  address: string;
  proofKind: string | null;
  proofFilename: string | null;
  uploadedAt: string | null;
  reviewNote: string | null;
};

const PROOF_SELECT = sql`
  SELECT pl.id, pl.status, pl.proof_kind, pl.proof_filename, pl.proof_uploaded_at, pl.review_note, u.name, lp.reference_id AS landlord_ref, p.reference_id AS property_ref,
         coalesce((SELECT l.title FROM marketplace.listings l WHERE l.property_id = p.id AND l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT 1), 'A property') AS title,
         concat_ws(', ', nullif(a.line1, ''), pc.name) AS address
    FROM rent.property_landlords pl JOIN identity.users u ON u.id = pl.landlord_user_id JOIN rent.landlord_profiles lp ON lp.user_id = pl.landlord_user_id
    JOIN real_estate.properties p ON p.id = pl.property_id JOIN geography.addresses a ON a.id = p.address_id JOIN geography.places pc ON pc.id = a.place_id`;

const toProofRow = (r: Row): ProofRow => ({
  linkId: String(r.id),
  status: r.status as PropertyLandlordStatus,
  statusLabel: PROPERTY_LANDLORD_LABELS[r.status as PropertyLandlordStatus],
  landlordName: String(r.name),
  landlordReferenceId: String(r.landlord_ref),
  propertyReferenceId: String(r.property_ref),
  title: String(r.title),
  address: String(r.address),
  proofKind: r.proof_kind ? OWNERSHIP_PROOF_LABELS[r.proof_kind as OwnershipProofKind] : null,
  proofFilename: (r.proof_filename as string) ?? null,
  uploadedAt: iso(r.proof_uploaded_at),
  reviewNote: (r.review_note as string) ?? null,
});

export async function proofsToReview(actor: Actor): Promise<ProofRow[]> {
  assertCan(actor, "rent.view", "platform");
  const { rows } = await db.execute(sql`${PROOF_SELECT} WHERE pl.status = 'under_review' ORDER BY pl.proof_uploaded_at`);
  return (rows as Row[]).map(toProofRow);
}

/** Approve or reject a landlord's proof that they own a property. Approval lets their rent be settled. */
export async function reviewOwnershipProof(actor: Actor, linkId: string, decision: "approve" | "reject", rawNote: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) throw notFound();
  const note = decision === "reject" ? reasonSchema.safeParse(rawNote) : z.string().trim().max(500).optional().safeParse(rawNote || undefined);
  if (!note.success) throw invalid(note.error.issues[0].message, { reason: note.error.issues[0].message });
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT pl.id, pl.status, pl.landlord_user_id, pl.property_id, p.reference_id AS property_ref, i.invited_by
        FROM rent.property_landlords pl JOIN real_estate.properties p ON p.id = pl.property_id LEFT JOIN rent.landlord_invitations i ON i.id = pl.invitation_id
       WHERE pl.id = ${linkId} FOR UPDATE OF pl`);
    const l = rows[0] as Row | undefined;
    if (!l) throw notFound();
    if (l.status !== "under_review") throw conflict("This proof isn't waiting for a decision.");
    if (String(l.landlord_user_id) === actor.userId) throw conflict("You can't review your own proof.");
    const approved = decision === "approve";
    await tx.execute(sql`
      UPDATE rent.property_landlords SET status = ${approved ? "approved" : "rejected"}, reviewed_by = ${actor.userId}, reviewed_at = now(), review_note = ${note.data ?? null},
             ${approved ? sql`approved_at = now(),` : sql``} updated_at = now()
       WHERE id = ${linkId}`);
    if (approved) {
      // The property's owner, on record, now that it's proven.
      await tx.execute(sql`UPDATE real_estate.properties SET owner_user_id = ${String(l.landlord_user_id)}, updated_at = now() WHERE id = ${String(l.property_id)} AND owner_user_id IS NULL`);
      await refreshSettlements(tx, { landlordUserId: String(l.landlord_user_id) });
    }
    await notify(tx, [String(l.landlord_user_id)], {
      type: "rent_landlord",
      title: approved ? `Your ownership of ${l.property_ref} is approved` : `Your proof of ownership for ${l.property_ref} wasn't accepted`,
      body: note.data ?? (approved ? "Rent for it can now be paid to you." : undefined),
      link: `/my-properties/${l.property_ref}`,
    });
    if (l.invited_by) await notify(tx, [String(l.invited_by)], { type: "rent_landlord", title: `The landlord's proof for ${l.property_ref} was ${approved ? "approved" : "not accepted"}` });
    await audit(tx, actor, { event: approved ? "OWNERSHIP_PROOF_APPROVED" : "OWNERSHIP_PROOF_REJECTED", target: { type: "property", referenceId: String(l.property_ref) }, metadata: { note: note.data ?? null } }, ctx);
  });
}

// ── Bank accounts ────────────────────────────────────────────────────────────

export type BankRow = {
  landlordReferenceId: string;
  landlordName: string;
  method: "bank" | "upi";
  holderName: string;
  bankName: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  upiMasked: string | null;
  status: BankAccountStatus;
  statusReason: string | null;
  nameAtBank: string | null;
  updatedAt: string;
};

const toBankRow = (r: Row): BankRow => ({
  landlordReferenceId: String(r.landlord_ref),
  landlordName: String(r.name),
  method: r.method as "bank" | "upi",
  holderName: String(r.holder_name),
  bankName: (r.bank_name as string) ?? null,
  accountLast4: (r.account_last4 as string) ?? null,
  ifsc: (r.ifsc as string) ?? null,
  upiMasked: (r.upi_masked as string) ?? null,
  status: r.status as BankAccountStatus,
  statusReason: (r.status_reason as string) ?? null,
  nameAtBank: (r.name_at_bank as string) ?? null,
  updatedAt: iso(r.updated_at)!,
});

export async function bankAccountsToVerify(actor: Actor): Promise<BankRow[]> {
  assertCan(actor, "rent.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT ba.*, u.name, lp.reference_id AS landlord_ref FROM rent.landlord_bank_accounts ba JOIN identity.users u ON u.id = ba.landlord_user_id
      JOIN rent.landlord_profiles lp ON lp.user_id = ba.landlord_user_id
     WHERE ba.status = 'pending' ORDER BY ba.updated_at`);
  return (rows as Row[]).map(toBankRow);
}

async function lockBankByLandlord(tx: Tx, landlordReferenceId: string) {
  const ref = normalizeReferenceId(landlordReferenceId);
  if (!isReferenceId(ref, "LND")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT ba.*, lp.user_id, lp.reference_id AS landlord_ref FROM rent.landlord_profiles lp JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = lp.user_id
     WHERE lp.reference_id = ${ref} FOR UPDATE OF ba`);
  const b = rows[0] as Row | undefined;
  if (!b) throw notFound();
  return b;
}

/**
 * A person verifies a bank account the provider couldn't (no provider connected, or it was down):
 * they've confirmed it's real and in the landlord's name (a ₹1 transfer from the back office, a
 * cancelled cheque). Or they reject it, and the landlord adds another.
 */
export async function decideBankAccount(actor: Actor, landlordReferenceId: string, decision: "verify" | "reject", rawNote: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const note = reasonSchema.safeParse(rawNote);
  if (!note.success) throw invalid(note.error.issues[0].message, { reason: note.error.issues[0].message });
  await db.transaction(async (tx) => {
    const b = await lockBankByLandlord(tx, landlordReferenceId);
    if (String(b.user_id) === actor.userId) throw conflict("You can't verify your own bank account.");
    if (decision === "verify" && b.status === "verified") throw conflict("Already verified.");
    await tx.execute(sql`
      UPDATE rent.landlord_bank_accounts SET status = ${decision === "verify" ? "verified" : "failed"}, status_reason = ${decision === "verify" ? null : note.data},
             verified_at = ${decision === "verify" ? sql`now()` : sql`NULL`}, verified_by = ${decision === "verify" ? actor.userId : null}, updated_at = now()
       WHERE id = ${String(b.id)}`);
    await refreshSettlements(tx, { landlordUserId: String(b.user_id) });
    await notify(tx, [String(b.user_id)], {
      type: "rent_landlord",
      title: decision === "verify" ? "Your bank account for rent is verified" : "Your bank account for rent couldn't be verified",
      body: decision === "verify" ? undefined : note.data,
      link: "/bank-account",
    });
    await audit(tx, actor, { event: decision === "verify" ? "LANDLORD_BANK_ACCOUNT_VERIFIED" : "LANDLORD_BANK_ACCOUNT_REJECTED", target: { type: "landlord", referenceId: String(b.landlord_ref) }, metadata: { note: note.data } }, ctx);
  });
}

/** A landlord's full bank details, for paying them. Audited every time, with the reason. */
export async function revealLandlordBank(actor: Actor, landlordReferenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const reason = reasonSchema.safeParse(rawReason);
  if (!reason.success) throw invalid(reason.error.issues[0].message, { reason: reason.error.issues[0].message });
  return db.transaction(async (tx) => {
    const b = await lockBankByLandlord(tx, landlordReferenceId);
    const details = revealBankDetails(b);
    await audit(tx, actor, { event: "LANDLORD_BANK_DETAILS_VIEWED", target: { type: "landlord", referenceId: String(b.landlord_ref) }, metadata: { reason: reason.data } }, ctx);
    return { holderName: String(b.holder_name), bankName: (b.bank_name as string) ?? null, ifsc: (b.ifsc as string) ?? null, ...details };
  });
}

// ── Settlements ──────────────────────────────────────────────────────────────

export type AdminSettlementRow = SettlementView & { landlordName: string; landlordReferenceId: string; bank: string; heldByAdmin: boolean };

const ADMIN_SETTLEMENT_SQL = sql`
  SELECT ${SETTLEMENT_COLUMNS}, lu.name AS landlord_name, lp.reference_id AS landlord_ref, ba.method AS bank_method, ba.bank_name, ba.account_last4, ba.ifsc, ba.upi_masked
    FROM rent.settlements s ${SETTLEMENT_JOINS}
    JOIN identity.users lu ON lu.id = s.landlord_user_id JOIN rent.landlord_profiles lp ON lp.user_id = s.landlord_user_id
    LEFT JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = s.landlord_user_id`;

const toAdminSettlement = (r: Row): AdminSettlementRow => ({
  ...toSettlementView(r),
  landlordName: String(r.landlord_name),
  landlordReferenceId: String(r.landlord_ref),
  heldByAdmin: Boolean(r.held_by_admin),
  bank: r.bank_method === "upi" ? `UPI ${r.upi_masked}` : r.account_last4 ? `${r.bank_name ?? "Bank"} ••${r.account_last4} · ${r.ifsc}` : "No bank account",
});

export async function listSettlements(actor: Actor, status: SettlementStatus | "all", limit = 200): Promise<AdminSettlementRow[]> {
  assertCan(actor, "rent.view", "platform");
  const where: SQL = status === "all" ? sql`TRUE` : sql`s.status = ${status}`;
  const order = status === "ready" ? sql`s.due_by, s.created_at` : sql`s.created_at DESC`;
  const { rows } = await db.execute(sql`${ADMIN_SETTLEMENT_SQL} WHERE ${where} ORDER BY ${order} LIMIT ${limit}`);
  return (rows as Row[]).map(toAdminSettlement);
}

async function lockSettlement(tx: Tx, settlementReferenceId: string) {
  const ref = normalizeReferenceId(settlementReferenceId);
  if (!isReferenceId(ref, "STL")) throw notFound();
  const { rows } = await tx.execute(sql`
    SELECT s.*, ba.method AS bank_method, ba.holder_name, ba.account_last4, ba.ifsc, ba.status AS bank_status, u.email AS landlord_email, u.name AS landlord_name
      FROM rent.settlements s JOIN identity.users u ON u.id = s.landlord_user_id LEFT JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = s.landlord_user_id
     WHERE s.reference_id = ${ref} FOR UPDATE OF s`);
  const s = rows[0] as Row | undefined;
  if (!s) throw notFound();
  return { s, ref };
}

const paidSchema = z.object({
  utr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,30}$/, "The bank's reference: 6 to 30 letters and numbers"),
  paidOn: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

/** Records that the back office paid a settlement into the landlord's bank, with the bank's reference. */
export async function markSettlementPaid(actor: Actor, settlementReferenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const parsed = paidSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const done = await db.transaction(async (tx) => {
    const { s, ref } = await lockSettlement(tx, settlementReferenceId);
    if (!["ready", "failed"].includes(String(s.status))) throw conflict(s.status === "paid" ? "Already recorded as paid." : "This settlement isn't ready to pay.");
    if (s.bank_status !== "verified") throw conflict("The landlord's bank account isn't verified.");
    const paidAt = v.paidOn ? sql`(${v.paidOn}::date + time '12:00') AT TIME ZONE 'Asia/Kolkata'` : sql`now()`;
    await tx.execute(sql`
      UPDATE rent.settlements SET status = 'paid', paid_at = ${paidAt}, paid_by = ${actor.userId}, utr = ${v.utr}, paid_to_method = ${String(s.bank_method)},
             paid_to_holder = ${String(s.holder_name)}, paid_to_last4 = ${(s.account_last4 as string) ?? null}, paid_to_ifsc = ${(s.ifsc as string) ?? null},
             failure_reason = NULL, hold_reason = NULL, updated_at = now()
       WHERE id = ${String(s.id)}`);
    await notify(tx, [String(s.landlord_user_id)], {
      type: "rent_paid",
      title: `${formatMoney(num(s.amount))} rent paid into your bank account`,
      body: `Bank reference (UTR) ${v.utr}.`,
      link: "/rent-received",
    });
    await audit(tx, actor, { event: "RENT_SETTLED", target: { type: "settlement", referenceId: ref }, after: { utr: v.utr, amount: num(s.amount), paidOn: v.paidOn ?? null } }, ctx);
    return { email: String(s.landlord_email), name: String(s.landlord_name), amount: num(s.amount), last4: (s.account_last4 as string) ?? null };
  });
  try {
    await sendEmail(
      noticeMessage(done.email, {
        subject: `${formatMoney(done.amount)} rent paid into your bank account`,
        heading: "Your rent is in your bank",
        lines: [`Hi ${done.name.split(" ")[0]},`, `Trustbrick paid ${formatMoney(done.amount)} of rent into ${done.last4 ? `your account ending ${done.last4}` : "your UPI ID"}. The bank's reference is ${v.utr}.`],
        action: { label: "See rent received", url: absoluteUrl("/rent-received") },
      }),
    );
  } catch (e) {
    log.warn("rent.settled_email_failed", { error: String(e) });
  }
}

/** The bank returned a transfer (wrong account, closed): it's owed again once the landlord fixes it. */
export async function markSettlementFailed(actor: Actor, settlementReferenceId: string, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const reason = reasonSchema.safeParse(rawReason);
  if (!reason.success) throw invalid(reason.error.issues[0].message, { reason: reason.error.issues[0].message });
  await db.transaction(async (tx) => {
    const { s, ref } = await lockSettlement(tx, settlementReferenceId);
    if (!["ready", "paid"].includes(String(s.status))) throw conflict("Only a settlement that's ready or paid can be marked as returned.");
    await tx.execute(sql`UPDATE rent.settlements SET status = 'failed', failure_reason = ${reason.data}, updated_at = now() WHERE id = ${String(s.id)}`);
    await notify(tx, [String(s.landlord_user_id)], { type: "rent_paid", title: `A rent payment of ${formatMoney(num(s.amount))} couldn't reach your bank`, body: reason.data, link: "/bank-account" });
    await audit(tx, actor, { event: "RENT_SETTLEMENT_FAILED", target: { type: "settlement", referenceId: ref }, metadata: { reason: reason.data, wasPaid: s.status === "paid", utr: s.utr ?? null } }, ctx);
  });
}

/** Holds a settlement (a dispute, a doubt) until a person releases it; or releases it. */
export async function holdSettlement(actor: Actor, settlementReferenceId: string, hold: boolean, rawReason: unknown, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const reason = hold ? reasonSchema.safeParse(rawReason) : { success: true as const, data: null };
  if (!reason.success) throw invalid(reason.error.issues[0].message, { reason: reason.error.issues[0].message });
  await db.transaction(async (tx) => {
    const { s, ref } = await lockSettlement(tx, settlementReferenceId);
    if (hold) {
      if (!["ready", "on_hold", "failed"].includes(String(s.status))) throw conflict("Only an unpaid settlement can be held.");
      await tx.execute(sql`UPDATE rent.settlements SET status = 'on_hold', held_by_admin = true, hold_reason = ${`Held by Trustbrick: ${reason.data}`}, ready_at = NULL, due_by = NULL, updated_at = now() WHERE id = ${String(s.id)}`);
    } else {
      if (!s.held_by_admin) throw conflict("This settlement isn't held by a person.");
      await tx.execute(sql`UPDATE rent.settlements SET held_by_admin = false, hold_reason = NULL, updated_at = now() WHERE id = ${String(s.id)}`);
      await refreshSettlements(tx, { settlementId: String(s.id) });
    }
    await audit(tx, actor, { event: hold ? "RENT_SETTLEMENT_HELD" : "RENT_SETTLEMENT_RELEASED", target: { type: "settlement", referenceId: ref }, metadata: { reason: reason.data } }, ctx);
  });
}

/**
 * The back office's file for paying rent: every settlement ready (or returned and owed again), with
 * the landlord's full bank details. Audited, with how many rows.
 */
export async function exportSettlementsCsv(actor: Actor, ctx: RequestContext): Promise<{ csv: string; count: number }> {
  assertCan(actor, "rent.manage", "platform");
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT s.reference_id, s.amount, s.due_by, s.status, u.name, lp.reference_id AS landlord_ref, ba.method, ba.holder_name, ba.bank_name, ba.ifsc, ba.account_sealed, ba.upi_sealed,
             p.reference_id AS payment_ref, c.due_date
        FROM rent.settlements s JOIN identity.users u ON u.id = s.landlord_user_id JOIN rent.landlord_profiles lp ON lp.user_id = s.landlord_user_id
        JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = s.landlord_user_id AND ba.status = 'verified'
        JOIN rent.payments p ON p.id = s.payment_id JOIN rent.charges c ON c.id = p.charge_id
       WHERE s.status IN ('ready', 'failed') ORDER BY s.due_by NULLS LAST, s.created_at`);
    const cell = (v: unknown) => {
      const t = v === null || v === undefined ? "" : String(v);
      // Quote everything; neutralise spreadsheet formulas.
      return `"${(/^[=+\-@]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
    };
    const header = ["Settlement", "Landlord", "Landlord ID", "Pay by", "Account holder", "Account number", "IFSC", "Bank", "UPI ID", "Amount", "Narration"];
    const lines = (rows as Row[]).map((r) => {
      const d = revealBankDetails(r);
      return [r.reference_id, r.name, r.landlord_ref, day(r.due_by) ?? "", r.holder_name, d.accountNumber, r.ifsc, r.bank_name, d.vpa, num(r.amount).toFixed(2), `Rent ${formatDay(day(r.due_date)!)} ${r.payment_ref}`]
        .map(cell)
        .join(",");
    });
    await audit(tx, actor, { event: "RENT_SETTLEMENTS_EXPORTED", target: { type: "settlements" }, metadata: { count: lines.length } }, ctx);
    return { csv: [header.map(cell).join(","), ...lines].join("\r\n"), count: lines.length };
  });
}

// ── Payments and refunds ─────────────────────────────────────────────────────

export type AdminRentPayment = {
  referenceId: string;
  status: RentPaymentStatus;
  amount: number;
  method: string | null;
  createdAt: string;
  paidAt: string | null;
  unwanted: boolean;
  refundStatus: string | null;
  needsAttention: boolean;
  attentionNote: string | null;
  failureReason: string | null;
  tenantName: string;
  landlordName: string;
  title: string;
  dueDate: string;
  settlementStatus: SettlementStatus | null;
};

export async function listRentPayments(actor: Actor, filter: "all" | "attention" = "all", limit = 200): Promise<AdminRentPayment[]> {
  assertCan(actor, "rent.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT p.reference_id, p.status, p.amount, p.method, p.created_at, p.paid_at, p.unwanted, p.refund_status, p.needs_attention, p.attention_note, p.failure_reason,
           t.tenant_name, lu.name AS landlord_name, coalesce(l.title, 'A property') AS title, c.due_date, s.status AS settlement_status
      FROM rent.payments p JOIN rent.tenancies t ON t.id = p.tenancy_id JOIN rent.charges c ON c.id = p.charge_id JOIN identity.users lu ON lu.id = p.landlord_user_id
      LEFT JOIN marketplace.listings l ON l.id = t.listing_id LEFT JOIN rent.settlements s ON s.payment_id = p.id
     WHERE ${filter === "attention" ? sql`p.needs_attention` : sql`p.status <> 'created' OR p.created_at > now() - interval '1 hour'`}
     ORDER BY p.created_at DESC LIMIT ${limit}`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    status: r.status as RentPaymentStatus,
    amount: num(r.amount),
    method: (r.method as string) ?? null,
    createdAt: iso(r.created_at)!,
    paidAt: iso(r.paid_at),
    unwanted: Boolean(r.unwanted),
    refundStatus: (r.refund_status as string) ?? null,
    needsAttention: Boolean(r.needs_attention),
    attentionNote: (r.attention_note as string) ?? null,
    failureReason: (r.failure_reason as string) ?? null,
    tenantName: String(r.tenant_name),
    landlordName: String(r.landlord_name),
    title: String(r.title),
    dueDate: day(r.due_date)!,
    settlementStatus: (r.settlement_status as SettlementStatus) ?? null,
  }));
}

/**
 * Trustbrick refunds a rent payment in full (a mistake, a dispute), only before it's been settled to
 * the landlord. The month's rent is either due again or written off.
 */
export async function refundRentPayment(actor: Actor, paymentReferenceId: string, raw: { reason: unknown; reopen: unknown }, ctx: RequestContext) {
  assertCan(actor, "rent.manage", "platform");
  const reason = reasonSchema.safeParse(raw.reason);
  if (!reason.success) throw invalid(reason.error.issues[0].message, { reason: reason.error.issues[0].message });
  const reopen = raw.reopen === "on" || raw.reopen === true;
  const ref = normalizeReferenceId(paymentReferenceId);
  if (!isReferenceId(ref, "RPY")) throw notFound();
  const paymentId = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT id, status, unwanted, refund_status, charge_id, tenant_user_id, amount FROM rent.payments WHERE reference_id = ${ref} FOR UPDATE`);
    const p = rows[0] as Row | undefined;
    if (!p) throw notFound();
    if (p.status !== "paid" || p.refund_status) throw conflict("Only a paid rent payment that isn't already being refunded can be refunded.");
    const s = (await tx.execute(sql`SELECT id, status FROM rent.settlements WHERE payment_id = ${String(p.id)} FOR UPDATE`)).rows[0] as Row | undefined;
    if (s && s.status === "paid") throw conflict("This rent was already paid to the landlord. Recover it from them first.");
    if (s) await tx.execute(sql`UPDATE rent.settlements SET status = 'cancelled', hold_reason = NULL, failure_reason = ${`Refunded to the tenant: ${reason.data}`}, updated_at = now() WHERE id = ${String(s.id)}`);
    await tx.execute(sql`UPDATE rent.payments SET refund_status = 'pending', refund_reason = ${reason.data}, updated_at = now() WHERE id = ${String(p.id)}`);
    if (!p.unwanted) {
      await tx.execute(sql`UPDATE rent.charges SET status = ${reopen ? "due" : "cancelled"}, paid_at = NULL, updated_at = now() WHERE id = ${String(p.charge_id)}`);
    }
    await notify(tx, [String(p.tenant_user_id)], { type: "rent_paid", title: `Your rent payment ${ref} is being refunded`, body: reason.data, link: "/account/rent" });
    await audit(tx, actor, { event: "RENT_REFUNDED", target: { type: "rent_payment", referenceId: ref }, metadata: { reason: reason.data, reopen, amount: num(p.amount) } }, ctx);
    return String(p.id);
  });
  await sendRentRefunds({ paymentId });
}

// ── Landlords and tenancies ──────────────────────────────────────────────────

export type AdminLandlordRow = { referenceId: string; name: string; email: string; properties: number; approved: number; bank: BankAccountStatus | "missing"; createdAt: string };

export async function listLandlords(actor: Actor, q?: string): Promise<AdminLandlordRow[]> {
  assertCan(actor, "rent.view", "platform");
  const search = q?.trim() ? sql`AND (u.name ILIKE ${`%${q.trim()}%`} OR u.email ILIKE ${`%${q.trim()}%`} OR lp.reference_id = ${normalizeReferenceId(q)})` : sql``;
  const { rows } = await db.execute(sql`
    SELECT lp.reference_id, u.name, u.email, lp.created_at, ba.status AS bank_status,
           (SELECT count(*) FROM rent.property_landlords pl WHERE pl.landlord_user_id = lp.user_id AND pl.status <> 'ended')::int AS properties,
           (SELECT count(*) FROM rent.property_landlords pl WHERE pl.landlord_user_id = lp.user_id AND pl.status = 'approved')::int AS approved
      FROM rent.landlord_profiles lp JOIN identity.users u ON u.id = lp.user_id LEFT JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = lp.user_id
     WHERE TRUE ${search} ORDER BY lp.created_at DESC LIMIT 200`);
  return (rows as Row[]).map((r) => ({
    referenceId: String(r.reference_id),
    name: String(r.name),
    email: String(r.email),
    properties: Number(r.properties),
    approved: Number(r.approved),
    bank: (r.bank_status as BankAccountStatus) ?? "missing",
    createdAt: iso(r.created_at)!,
  }));
}

export async function landlordForAdmin(actor: Actor, landlordReferenceId: string) {
  assertCan(actor, "rent.view", "platform");
  const ref = normalizeReferenceId(landlordReferenceId);
  if (!isReferenceId(ref, "LND")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT lp.user_id, lp.reference_id, lp.pan_masked, lp.phone, lp.created_at, u.name, u.email, u.reference_id AS user_ref
      FROM rent.landlord_profiles lp JOIN identity.users u ON u.id = lp.user_id WHERE lp.reference_id = ${ref}`);
  const p = rows[0] as Row | undefined;
  if (!p) throw notFound();
  const userId = String(p.user_id);
  const [bank, links, tenancies, settlements] = await Promise.all([
    db.execute(sql`SELECT ba.*, u.name, ${ref} AS landlord_ref FROM rent.landlord_bank_accounts ba JOIN identity.users u ON u.id = ba.landlord_user_id WHERE ba.landlord_user_id = ${userId}`),
    db.execute(sql`${PROOF_SELECT} WHERE pl.landlord_user_id = ${userId} ORDER BY pl.created_at DESC`),
    db.execute(sql`
      SELECT t.reference_id, t.status, t.tenant_name, t.monthly_rent, t.due_day, t.start_date, coalesce(l.title, 'A property') AS title
        FROM rent.tenancies t LEFT JOIN marketplace.listings l ON l.id = t.listing_id WHERE t.landlord_user_id = ${userId} ORDER BY t.created_at DESC`),
    db.execute(sql`${ADMIN_SETTLEMENT_SQL} WHERE s.landlord_user_id = ${userId} ORDER BY s.created_at DESC LIMIT 50`),
  ]);
  return {
    referenceId: String(p.reference_id),
    userReferenceId: String(p.user_ref),
    name: String(p.name),
    email: String(p.email),
    phone: (p.phone as string) ?? null,
    panMasked: (p.pan_masked as string) ?? null,
    since: iso(p.created_at)!,
    bank: bank.rows[0] ? toBankRow(bank.rows[0] as Row) : null,
    properties: (links.rows as Row[]).map(toProofRow),
    tenancies: (tenancies.rows as Row[]).map((t) => ({
      referenceId: String(t.reference_id),
      status: String(t.status),
      statusLabel: TENANCY_STATUS_LABELS[t.status as keyof typeof TENANCY_STATUS_LABELS],
      tenantName: String(t.tenant_name),
      monthlyRent: num(t.monthly_rent),
      dueDay: Number(t.due_day),
      startDate: day(t.start_date)!,
      title: String(t.title),
    })),
    settlements: (settlements.rows as Row[]).map(toAdminSettlement),
  };
}

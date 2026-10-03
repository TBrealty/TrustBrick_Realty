import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/db/schema/trust";
import { AppError, conflict, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { isReferenceId } from "@/lib/reference";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  fraud: "Looks like a scam or fraud",
  incorrect_details: "Price, photos or details are wrong",
  duplicate: "It's a duplicate of another listing",
  unavailable: "It's no longer available",
  offensive: "Offensive or inappropriate content",
  other: "Something else",
};

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { message: "Choose a reason" }),
  details: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000, "Keep it under 1,000 characters").optional()),
});

export async function submitReport(person: PersonActor, listingReference: string, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  if (!isReferenceId(listingReference, "LST")) throw notFound();
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Choose a reason.", { reason: parsed.error.issues[0]?.message ?? "Choose a reason" });
  if (parsed.data.reason === "other" && !parsed.data.details) throw invalid("Tell us what's wrong.", { details: "Tell us what's wrong" });
  const limited = await limit([{ key: `report:user:${person.userId}`, rule: RULES.reportByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  return db
    .transaction(async (tx) => {
      const found = await tx.execute(sql`SELECT id, organization_id FROM marketplace.listings WHERE reference_id = ${listingReference} AND status = 'published'`);
      const listing = found.rows[0] as Row | undefined;
      if (!listing) throw notFound();
      const created = await tx.execute(sql`
        INSERT INTO trust.reports (id, listing_id, reporter_user_id, reason, details)
        VALUES (gen_random_uuid(), ${String(listing.id)}, ${person.userId}, ${parsed.data.reason}, ${parsed.data.details ?? null})
        RETURNING id, reference_id`);
      const report = created.rows[0] as Row;
      await audit(
        tx,
        person,
        { event: "REPORT_SUBMITTED", target: { type: "report", id: String(report.id), referenceId: String(report.reference_id) }, organizationId: String(listing.organization_id), metadata: { listing: listingReference, reason: parsed.data.reason } },
        ctx,
      );
      await notifyPermissionHolders(tx, "reports.manage", {
        type: "report_submitted",
        title: `${listingReference} was reported: ${REPORT_REASON_LABELS[parsed.data.reason].toLowerCase()}`,
        link: `/reports?status=open`,
      });
      return { referenceId: String(report.reference_id) };
    })
    .catch((error) => {
      if (isUniqueViolation(error)) throw conflict("You've already reported this listing. We're looking into it.");
      throw error;
    });
}

export const reportFilters = z.object({
  status: z.enum(["open", "actioned", "dismissed"]).catch("open"),
  reason: z.enum(REPORT_REASONS).optional().catch(undefined),
});

export type ReportRow = {
  referenceId: string;
  reason: string;
  details: string | null;
  status: string;
  listingReferenceId: string;
  listingTitle: string;
  listingStatus: string;
  reporterName: string | null;
  reporterReferenceId: string | null;
  otherOpenReports: number;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
};

export async function listReports(actor: Actor, filters: z.infer<typeof reportFilters>, page: number): Promise<Page<ReportRow>> {
  assertCan(actor, "reports.view", "platform");
  const where: SQL[] = [sql`r.status = ${filters.status}`];
  if (filters.reason) where.push(sql`r.reason = ${filters.reason}`);
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const from = sql`
    FROM trust.reports r
    JOIN marketplace.listings l ON l.id = r.listing_id
    LEFT JOIN identity.users u ON u.id = r.reporter_user_id
    LEFT JOIN identity.users rb ON rb.id = r.resolved_by`;
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT r.reference_id, r.reason, r.details, r.status, r.created_at, r.resolution_note, l.reference_id AS listing_reference_id,
             l.title AS listing_title, l.status AS listing_status, u.name AS reporter_name, u.reference_id AS reporter_reference_id, rb.name AS resolved_by,
             (SELECT count(*) FROM trust.reports r2 WHERE r2.listing_id = r.listing_id AND r2.status = 'open' AND r2.id <> r.id)::int AS other_open
      ${from} WHERE ${whereSql} ORDER BY r.created_at ${filters.status === "open" ? sql`ASC` : sql`DESC`} LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${from} WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      reason: String(r.reason),
      details: (r.details as string) ?? null,
      status: String(r.status),
      listingReferenceId: String(r.listing_reference_id),
      listingTitle: String(r.listing_title),
      listingStatus: String(r.listing_status),
      reporterName: (r.reporter_name as string) ?? null,
      reporterReferenceId: (r.reporter_reference_id as string) ?? null,
      otherOpenReports: Number(r.other_open),
      resolvedBy: (r.resolved_by as string) ?? null,
      resolutionNote: (r.resolution_note as string) ?? null,
      createdAt: iso(r.created_at)!,
    })),
    total: Number((count.rows[0] as Row).total),
    page,
    pageSize: take,
  };
}

/** Closes a report. Acting on the listing itself (unpublish, remove) is a separate, audited listing action. */
export async function resolveReport(actor: Actor, referenceId: string, outcome: unknown, rawNote: unknown, ctx: RequestContext) {
  assertCan(actor, "reports.manage", "platform");
  if (!isReferenceId(referenceId, "RPT")) throw notFound();
  if (outcome !== "actioned" && outcome !== "dismissed") throw invalid("Choose an outcome.");
  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, 1000) : "";
  if (note.length < 5) throw invalid("Add a short note about what you did.", { note: "Add a short note" });
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      UPDATE trust.reports SET status = ${outcome}, resolved_by = ${actor.userId}, resolved_at = now(), resolution_note = ${note}, updated_at = now()
       WHERE reference_id = ${referenceId} AND status = 'open' RETURNING id`);
    const r = rows[0] as Row | undefined;
    if (!r) throw conflict("This report is already resolved.");
    await audit(tx, actor, { event: "REPORT_RESOLVED", target: { type: "report", id: String(r.id), referenceId }, after: { status: outcome }, metadata: { note } }, ctx);
  });
}

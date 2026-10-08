import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import type { CaseFlags } from "@/lib/db/schema/trust";
import { notFound } from "@/lib/errors";
import { isReferenceId } from "@/lib/reference";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export const QUEUES = {
  pending: "Waiting for approval",
  in_review: "In review",
  flagged: "Flagged by checks",
  duplicates: "Duplicate suspected",
  reported: "Reported",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  recent: "Recently submitted",
} as const;
export type Queue = keyof typeof QUEUES;

export const moderationFilters = z.object({
  queue: z.enum(Object.keys(QUEUES) as [Queue, ...Queue[]]).catch("pending"),
  type: z.enum(["listing_review", "tour_review", "agent_application", "organization_verification"]).catch("listing_review"),
});

export type CaseRow = {
  referenceId: string;
  caseType: string;
  status: string;
  subject: { kind: "listing" | "agent" | "organization"; referenceId: string; title: string; status: string };
  submittedBy: string | null;
  assignedTo: string | null;
  duplicates: number;
  qualityFlags: number;
  /** Tour reviews: how many changes it covers. */
  tourChanges: number;
  /** Tour reviews: the tour is hidden now, so these changes aren't showing until approved. */
  tourHidden: boolean;
  openReports: number;
  createdAt: string;
  decidedAt: string | null;
};

function queueCondition(queue: Queue): SQL {
  switch (queue) {
    case "pending":
      // Everything not yet decided, including cases a reviewer has already opened.
      return sql`rc.status IN ('open', 'in_review')`;
    case "in_review":
      return sql`rc.status = 'in_review'`;
    case "flagged":
      return sql`rc.status IN ('open', 'in_review') AND jsonb_array_length(coalesce(rc.flags->'quality', '[]')) > 0`;
    case "duplicates":
      return sql`rc.status IN ('open', 'in_review') AND jsonb_array_length(coalesce(rc.flags->'duplicates', '[]')) > 0`;
    case "reported":
      return sql`rc.listing_id IS NOT NULL AND EXISTS (SELECT 1 FROM trust.reports rp WHERE rp.listing_id = rc.listing_id AND rp.status = 'open')`;
    case "changes_requested":
      return sql`rc.status = 'changes_requested'`;
    case "rejected":
      return sql`rc.status = 'rejected'`;
    case "recent":
      return sql`rc.created_at > now() - interval '7 days'`;
  }
}

const FROM = sql`
  FROM trust.review_cases rc
  LEFT JOIN marketplace.listings l ON l.id = rc.listing_id
  LEFT JOIN real_estate.properties prop ON prop.id = l.property_id
  LEFT JOIN orgs.agent_profiles ap ON ap.id = rc.agent_profile_id
  LEFT JOIN identity.users apu ON apu.id = ap.user_id
  LEFT JOIN orgs.organizations o ON o.id = rc.organization_id
  LEFT JOIN identity.users sb ON sb.id = rc.submitted_by
  LEFT JOIN identity.users asg ON asg.id = rc.assigned_to`;

const COLUMNS = sql`
  rc.reference_id, rc.case_type, rc.status, rc.flags, rc.created_at, rc.decided_at, sb.name AS submitted_by, asg.name AS assigned_to,
  l.reference_id AS listing_ref, l.title AS listing_title, l.status AS listing_status, prop.tour_hidden_at IS NOT NULL AS tour_hidden,
  ap.reference_id AS agent_ref, apu.name AS agent_name, ap.status AS agent_status,
  o.reference_id AS org_ref, o.name AS org_name, o.status AS org_status,
  (SELECT count(*) FROM trust.reports rp WHERE rp.listing_id = rc.listing_id AND rp.status = 'open')::int AS open_reports`;

function toCaseRow(r: Row): CaseRow {
  const flags = (r.flags as CaseFlags) ?? {};
  const subject: CaseRow["subject"] = r.listing_ref
    ? { kind: "listing", referenceId: String(r.listing_ref), title: String(r.listing_title), status: String(r.listing_status) }
    : r.agent_ref
      ? { kind: "agent", referenceId: String(r.agent_ref), title: String(r.agent_name), status: String(r.agent_status) }
      : { kind: "organization", referenceId: String(r.org_ref), title: String(r.org_name), status: String(r.org_status) };
  return {
    referenceId: String(r.reference_id),
    caseType: String(r.case_type),
    status: String(r.status),
    subject,
    submittedBy: (r.submitted_by as string) ?? null,
    assignedTo: (r.assigned_to as string) ?? null,
    duplicates: flags.duplicates?.length ?? 0,
    qualityFlags: flags.quality?.length ?? 0,
    tourChanges: flags.tour?.changes.length ?? 0,
    tourHidden: String(r.case_type) === "tour_review" && Boolean(r.tour_hidden),
    openReports: Number(r.open_reports),
    createdAt: iso(r.created_at)!,
    decidedAt: iso(r.decided_at),
  };
}

/** The permission a case type needs, so each queue is visible only to the people who can act on it. */
const CASE_PERMISSION = {
  listing_review: "listings.approve",
  tour_review: "listings.approve",
  agent_application: "agents.verify",
  organization_verification: "organizations.verify",
} as const;

export async function listCases(actor: Actor, filters: z.infer<typeof moderationFilters>, page: number): Promise<Page<CaseRow>> {
  if (!can(actor, "verification.view", "platform")) assertCan(actor, CASE_PERMISSION[filters.type], "platform");
  const where = sql`rc.case_type = ${filters.type} AND ${queueCondition(filters.queue)}`;
  const { limit, offset } = pageParams(page);
  const order = ["pending", "in_review", "flagged", "duplicates", "reported"].includes(filters.queue) ? sql`rc.created_at ASC` : sql`rc.created_at DESC`;
  const [rows, count] = await Promise.all([
    db.execute(sql`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total ${FROM} WHERE ${where}`),
  ]);
  return { rows: (rows.rows as Row[]).map(toCaseRow), total: Number((count.rows[0] as Row).total), page, pageSize: limit };
}

export async function queueCounts(actor: Actor, type: z.infer<typeof moderationFilters>["type"]): Promise<Record<Queue, number>> {
  if (!can(actor, "verification.view", "platform")) assertCan(actor, CASE_PERMISSION[type], "platform");
  const parts = (Object.keys(QUEUES) as Queue[]).map((q) => sql`count(*) FILTER (WHERE ${queueCondition(q)})::int AS ${sql.identifier(q)}`);
  const { rows } = await db.execute(sql`SELECT ${sql.join(parts, sql`, `)} FROM trust.review_cases rc WHERE rc.case_type = ${type}`);
  const r = rows[0] as Row;
  return Object.fromEntries((Object.keys(QUEUES) as Queue[]).map((q) => [q, Number(r[q])])) as Record<Queue, number>;
}

export type CaseDetail = CaseRow & { flags: CaseFlags; decisionReason: string | null; decidedBy: string | null };

export async function getCase(actor: Actor, referenceId: string): Promise<CaseDetail> {
  if (!isReferenceId(referenceId, "VER")) throw notFound();
  const { rows } = await db.execute(sql`
    SELECT ${COLUMNS}, rc.decision_reason, dcd.name AS decided_by ${FROM}
      LEFT JOIN identity.users dcd ON dcd.id = rc.decided_by
     WHERE rc.reference_id = ${referenceId}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const type = String(r.case_type) as keyof typeof CASE_PERMISSION;
  if (!can(actor, "verification.view", "platform")) assertCan(actor, CASE_PERMISSION[type], "platform");
  return { ...toCaseRow(r), flags: (r.flags as CaseFlags) ?? {}, decisionReason: (r.decision_reason as string) ?? null, decidedBy: (r.decided_by as string) ?? null };
}

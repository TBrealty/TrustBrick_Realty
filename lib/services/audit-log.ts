import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { normalizeReferenceId } from "@/lib/reference";
import { AUDIT_EVENTS } from "./audit";
import { type Page, pageParams } from "./pagination";

type Row = Record<string, unknown>;

export const auditFilters = z.object({
  event: z.enum(AUDIT_EVENTS).optional().catch(undefined),
  actor: z.string().trim().max(30).optional().catch(undefined),
  target: z.string().trim().max(30).optional().catch(undefined),
  role: z.enum(["superadmin", "admin", "agent", "customer", "system"]).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});
export type AuditFilters = z.infer<typeof auditFilters>;

export type AuditRow = {
  id: string;
  eventType: string;
  actorName: string | null;
  actorReferenceId: string | null;
  actorRole: string;
  targetType: string | null;
  targetReferenceId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

const toAuditRow = (r: Row): AuditRow => ({
  id: String(r.id),
  eventType: String(r.event_type),
  actorName: (r.actor_name as string) ?? null,
  actorReferenceId: (r.actor_reference_id as string) ?? null,
  actorRole: String(r.actor_role),
  targetType: (r.target_type as string) ?? null,
  targetReferenceId: (r.target_reference_id as string) ?? null,
  ipAddress: (r.ip_address as string) ?? null,
  metadata: (r.metadata as Record<string, unknown>) ?? null,
  before: (r.before as Record<string, unknown>) ?? null,
  after: (r.after as Record<string, unknown>) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

export async function listAudit(actor: Actor, filters: AuditFilters, page: number): Promise<Page<AuditRow>> {
  assertCan(actor, "audit.view", "platform");
  const where: SQL[] = [sql`TRUE`];
  if (filters.event) where.push(sql`e.event_type = ${filters.event}`);
  if (filters.role) where.push(sql`e.actor_role = ${filters.role}`);
  if (filters.actor) where.push(sql`e.actor_reference_id = ${normalizeReferenceId(filters.actor)}`);
  if (filters.target) where.push(sql`e.target_reference_id = ${normalizeReferenceId(filters.target)}`);
  if (filters.from) where.push(sql`e.created_at >= ${`${filters.from}T00:00:00+05:30`}::timestamptz`);
  if (filters.to) where.push(sql`e.created_at < ${`${filters.to}T00:00:00+05:30`}::timestamptz + interval '1 day'`);
  const whereSql = sql.join(where, sql` AND `);
  const { limit, offset } = pageParams(page, 50);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT e.*, u.name AS actor_name FROM platform.audit_events e LEFT JOIN identity.users u ON u.id = e.actor_user_id
       WHERE ${whereSql} ORDER BY e.created_at DESC, e.id DESC LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM platform.audit_events e WHERE ${whereSql}`),
  ]);
  return { rows: (rows.rows as Row[]).map(toAuditRow), total: Number((count.rows[0] as Row).total), page, pageSize: limit };
}

/** The history for one record, for the "Audit history" panel on detail pages. */
export async function auditTrailFor(actor: Actor, targetReferenceIds: string[], limit = 30): Promise<AuditRow[]> {
  assertCan(actor, "audit.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT e.*, u.name AS actor_name FROM platform.audit_events e LEFT JOIN identity.users u ON u.id = e.actor_user_id
     WHERE e.target_reference_id = ANY(${sql.param(targetReferenceIds)}::text[])
     ORDER BY e.created_at DESC LIMIT ${limit}`);
  return (rows as Row[]).map(toAuditRow);
}

/** Recent administrative activity for the SuperAdmin dashboard. */
export async function recentStaffActivity(actor: Actor, limit = 8): Promise<AuditRow[]> {
  assertCan(actor, "audit.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT e.*, u.name AS actor_name FROM platform.audit_events e LEFT JOIN identity.users u ON u.id = e.actor_user_id
     WHERE e.actor_role IN ('admin', 'superadmin') ORDER BY e.created_at DESC LIMIT ${limit}`);
  return (rows as Row[]).map(toAuditRow);
}

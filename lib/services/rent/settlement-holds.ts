import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";

/**
 * Whether each unpaid settlement can be paid now, worked out again whenever something it depends on
 * changes (proof of ownership decided, bank account added, changed or verified) and by the rent job.
 *
 * A settlement waits (on_hold) while the landlord's ownership isn't approved, while they have no
 * verified bank account, and for 48 hours after their bank account changes. Otherwise it's ready,
 * due from the back office by the next working day. One held by a person stays held.
 */
const NEXT_WORKING_DAY = sql`(
  (now() AT TIME ZONE 'Asia/Kolkata')::date + 1
  + CASE WHEN extract(dow FROM (now() AT TIME ZONE 'Asia/Kolkata')::date + 1) = 0 THEN 1 ELSE 0 END)`;

export async function refreshSettlements(tx: DbOrTx, filter: { landlordUserId?: string; settlementId?: string } = {}): Promise<number> {
  const where: SQL[] = [sql`s2.status IN ('on_hold', 'ready')`, sql`NOT s2.held_by_admin`];
  if (filter.landlordUserId) where.push(sql`s2.landlord_user_id = ${filter.landlordUserId}`);
  if (filter.settlementId) where.push(sql`s2.id = ${filter.settlementId}`);
  const { rows } = await tx.execute(sql`
    UPDATE rent.settlements s SET
           hold_reason = x.reason,
           status = CASE WHEN x.reason IS NULL THEN 'ready' ELSE 'on_hold' END,
           ready_at = CASE WHEN x.reason IS NULL THEN coalesce(s.ready_at, now()) ELSE NULL END,
           due_by = CASE WHEN x.reason IS NULL THEN coalesce(s.due_by, ${NEXT_WORKING_DAY}) ELSE NULL END,
           updated_at = now()
      FROM (SELECT s2.id,
                   CASE WHEN pl.approved_at IS NULL THEN 'Waiting for the landlord''s proof of ownership to be approved.'
                        WHEN ba.id IS NULL THEN 'Waiting for the landlord to add a bank account.'
                        WHEN ba.status <> 'verified' THEN 'Waiting for the landlord''s bank account to be verified.'
                        WHEN ba.hold_until > now() THEN 'The landlord changed their bank account; held until '
                             || to_char(ba.hold_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' (IST).'
                        ELSE NULL END AS reason
              FROM rent.settlements s2
              JOIN rent.payments p ON p.id = s2.payment_id
              JOIN rent.tenancies t ON t.id = p.tenancy_id
              JOIN rent.property_landlords pl ON pl.id = t.property_landlord_id
              LEFT JOIN rent.landlord_bank_accounts ba ON ba.landlord_user_id = s2.landlord_user_id
             WHERE ${sql.join(where, sql` AND `)}) x
     WHERE s.id = x.id AND (s.status <> CASE WHEN x.reason IS NULL THEN 'ready' ELSE 'on_hold' END OR s.hold_reason IS DISTINCT FROM x.reason)
     RETURNING s.id`);
  return rows.length;
}

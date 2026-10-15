import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Permission } from "@/lib/authz/catalog";
import { type DbOrTx, db } from "@/lib/db";
import { notificationMutes, notifications } from "@/lib/db/schema/platform";

/** Every notification type, with the label shown in notification preferences. */
export const NOTIFICATION_TYPES = {
  listing_approved: "A listing of yours is approved and live",
  listing_rejected: "A listing of yours is rejected",
  listing_changes_requested: "Changes are requested on a listing of yours",
  listing_paused: "A listing of yours is paused or unpublished",
  listing_updated: "Trustbrick changes the price, availability or offer on a listing of yours",
  new_lead: "A new enquiry on one of your listings",
  visit_requested: "A customer asks to visit a property",
  visit_updated: "A visit you requested is confirmed or changed",
  agent_application: "A new agent application needs review",
  agent_decision: "Your agent application is decided",
  agent_invite_accepted: "An agent you invited has accepted",
  listing_submitted: "A listing is waiting for review",
  tour_changed: "A virtual tour on a live listing is changed and waiting for review",
  tour_decision: "A virtual tour of yours is reviewed",
  tour_capture: "A 360° photo you took with the app is ready, or couldn't be made",
  report_submitted: "A listing is reported",
  organization_pending: "An organization needs verification",
  admin_invited: "An administrator is invited",
  host_application: "A new host application needs review",
  contact_message: "Someone writes in through Contact us",
  legal_request: "Someone applies for legal verification of a property",
  commission_charged: "A commission charge is added to your account",
  commission_rates_changed: "Your commission rates change",
  subscription_requested: "Someone chooses a paid plan and is waiting to pay",
  subscription_updated: "Your subscription starts, renews, changes or ends",
  host_decision: "Your host application is decided",
  booking_requested: "A guest asks to book one of your stays",
  booking_confirmed: "A booking is confirmed",
  booking_updated: "A booking is declined, cancelled or changed",
  stay_message: "A guest sends you a message about a stay",
  host_message: "A host replies to your message about a stay",
  admin_access_changed: "Your administrator access changes",
  security: "Security events on the platform",
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export type NotificationInput = { type: NotificationType; title: string; body?: string; link?: string };

/** Notify specific people, skipping anyone who muted this type. Security notices cannot be muted. */
export async function notify(tx: DbOrTx, userIds: (string | null | undefined)[], input: NotificationInput) {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (recipients.length === 0) return;

  let allowed = recipients;
  if (input.type !== "security" && input.type !== "admin_access_changed") {
    const { rows } = await tx.execute(
      sql`SELECT user_id FROM platform.notification_mutes WHERE type = ${input.type} AND user_id = ANY(${sql.param(recipients)}::uuid[])`,
    );
    const muted = new Set((rows as { user_id: string }[]).map((r) => r.user_id));
    allowed = recipients.filter((id) => !muted.has(id));
  }
  if (allowed.length === 0) return;

  await tx.insert(notifications).values(
    allowed.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null })),
  );
}

/** Notify every active staff member who holds a permission (through a role or a direct grant). */
export async function notifyPermissionHolders(tx: DbOrTx, permission: Permission, input: NotificationInput, exceptUserId?: string) {
  const { rows } = await tx.execute(sql`
    SELECT DISTINCT m.user_id
      FROM orgs.memberships m
      JOIN orgs.organizations o ON o.id = m.organization_id AND o.org_type = 'internal'
      JOIN identity.users u ON u.id = m.user_id AND u.status = 'active'
     WHERE m.status = 'active'
       AND (EXISTS (SELECT 1 FROM orgs.membership_roles mr JOIN orgs.role_permissions rp ON rp.role_id = mr.role_id
                     WHERE mr.membership_id = m.id AND rp.permission_code = ${permission})
         OR EXISTS (SELECT 1 FROM orgs.membership_permissions mp WHERE mp.membership_id = m.id AND mp.permission_code = ${permission}))`);
  const ids = (rows as { user_id: string }[]).map((r) => r.user_id).filter((id) => id !== exceptUserId);
  await notify(tx, ids, input);
}

export async function listNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 100));
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Marks one (or, without an id, every) notification read. Scoped to the owner, so an id alone is not enough. */
export async function markRead(userId: string, notificationId?: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt), notificationId ? eq(notifications.id, notificationId) : undefined),
    );
}

export async function mutedTypes(userId: string): Promise<Set<string>> {
  const rows = await db.select({ type: notificationMutes.type }).from(notificationMutes).where(eq(notificationMutes.userId, userId));
  return new Set(rows.map((r) => r.type));
}

export async function setMutedTypes(userId: string, types: NotificationType[]) {
  await db.transaction(async (tx) => {
    await tx.delete(notificationMutes).where(eq(notificationMutes.userId, userId));
    const mutable = types.filter((t) => t !== "security" && t !== "admin_access_changed");
    if (mutable.length > 0) await tx.insert(notificationMutes).values(mutable.map((type) => ({ userId, type })));
  });
}

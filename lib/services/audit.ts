import "server-only";
import { type Actor, actorReference, actorRoleLabel } from "@/lib/authz/actor";
import type { DbOrTx } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema/platform";
import { log } from "@/lib/log";

/** Client details for audit rows, gathered by the action layer and passed down. */
export type RequestContext = { ipAddress: string | null; userAgent: string | null };
export const NO_REQUEST: RequestContext = { ipAddress: null, userAgent: null };

export const AUDIT_EVENTS = [
  "ADMIN_INVITED",
  "ADMIN_INVITATION_REVOKED",
  "ADMIN_CREATED",
  "ADMIN_PERMISSION_CHANGED",
  "ADMIN_SUSPENDED",
  "ADMIN_REINSTATED",
  "SUPERADMIN_BOOTSTRAPPED",
  "USER_SUSPENDED",
  "USER_REINSTATED",
  "USER_VERIFIED",
  "USER_UPDATED",
  "AGENT_INVITED",
  "AGENT_INVITATION_REVOKED",
  "AGENT_CREATED",
  "AGENT_APPLIED",
  "AGENT_APPROVED",
  "AGENT_REJECTED",
  "AGENT_SUSPENDED",
  "AGENT_REINSTATED",
  "AGENT_UPDATED",
  "HOST_APPLIED",
  "HOST_APPROVED",
  "HOST_REJECTED",
  "HOST_VERIFIED",
  "HOST_SUSPENDED",
  "HOST_REINSTATED",
  "BOOKING_CREATED",
  "BOOKING_ACCEPTED",
  "BOOKING_DECLINED",
  "BOOKING_CANCELLED",
  "BOOKING_CHECKED_IN",
  "BOOKING_COMPLETED",
  "BOOKING_NO_SHOW",
  "CONVERSATION_STARTED",
  "CONVERSATION_ACCESSED",
  "STAY_CALENDAR_UPDATED",
  "CONTACT_MESSAGE_RESOLVED",
  "LEGAL_REQUEST_UPDATED",
  "COMMISSION_RATE_SET",
  "COMMISSION_TERMS_ACCEPTED",
  "COMMISSION_CHARGED",
  "COMMISSION_STATUS_CHANGED",
  "COMMISSION_ADJUSTED",
  "SUBSCRIPTION_CHANGED",
  "PLAN_UPDATED",
  "ORGANIZATION_CREATED",
  "ORGANIZATION_UPDATED",
  "ORGANIZATION_APPROVED",
  "ORGANIZATION_REJECTED",
  "ORGANIZATION_VERIFIED",
  "ORGANIZATION_SUSPENDED",
  "ORGANIZATION_REINSTATED",
  "ORGANIZATION_ARCHIVED",
  "PROPERTY_CREATED",
  "PROPERTY_VERIFIED",
  "PROPERTY_REMOVED",
  "LISTING_SUBMITTED",
  "LISTING_REVIEW_STARTED",
  "LISTING_APPROVED",
  "LISTING_PUBLISHED",
  "LISTING_REJECTED",
  "LISTING_CHANGES_REQUESTED",
  "LISTING_UNPUBLISHED",
  "LISTING_REPUBLISHED",
  "LISTING_REMOVED",
  "LISTING_WITHDRAWN",
  "LISTING_ARCHIVED",
  "LISTING_CLOSED",
  "LISTING_REOPENED",
  "LISTING_TERMS_UPDATED",
  "LISTINGS_PAUSED",
  "LISTINGS_RESUMED",
  "TOUR_CHANGED",
  "TOUR_APPROVED",
  "TOUR_HIDDEN",
  "REPORT_SUBMITTED",
  "REPORT_RESOLVED",
  "SYSTEM_SETTING_CHANGED",
  "AUTHORIZATION_DENIED",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/** A signed-in person acting outside any workspace (a customer applying, enquiring or reporting). */
export type PersonActor = { kind: "person"; userId: string; referenceId: string; role: string };
export type AuditActor = Actor | PersonActor | null;

const isPerson = (a: AuditActor): a is PersonActor => a !== null && "kind" in a && a.kind === "person";

export type AuditInput = {
  event: AuditEvent;
  target?: { type: string; id?: string | null; referenceId?: string | null };
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

/**
 * Writes one audit row, inside the caller's transaction so the change and its record
 * commit or fail together. Never pass secrets: tokens, passwords and hashes do not belong here.
 */
export async function audit(tx: DbOrTx, actor: AuditActor, input: AuditInput, ctx: RequestContext = NO_REQUEST) {
  const reference = actor === null ? null : isPerson(actor) ? actor.referenceId : actorReference(actor);
  await tx.insert(auditEvents).values({
    eventType: input.event,
    actorUserId: actor?.userId ?? null,
    actorReferenceId: reference,
    actorRole: isPerson(actor) ? actor.role : actorRoleLabel(actor),
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    targetReferenceId: input.target?.referenceId ?? null,
    organizationId: input.organizationId ?? null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: input.metadata ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  });
  log.info("audit", { event: input.event, actor: reference ?? "system", target: input.target?.referenceId });
}

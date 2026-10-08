import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { type EffectiveState, GRACE_DAYS, type PlanView, effectiveState, inr, isEntitled, periodEnd, priceFor } from "@/lib/subscriptions/terms";
import { BILLING_CYCLES, type BillingCycle, type PlanAudience, type SubscriptionStatus } from "@/lib/vocab";
import { type PersonActor, type RequestContext, audit } from "./audit";
import { notify, notifyPermissionHolders } from "./notifications";
import { type Page, pageParams } from "./pagination";

/**
 * Subscriptions (lib/db/schema/finance.ts). People subscribe to customer plans; partner
 * organizations to partner plans. Anyone may take one free trial per audience. A paid plan is
 * chosen online and waits for its first payment, which the team records (no gateway yet); every
 * renewal is a recorded payment too. Every change is an event on the subscription and an audit row.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export type Subject = { kind: "user"; userId: string } | { kind: "organization"; organizationId: string };
const audienceOf = (s: Subject): PlanAudience => (s.kind === "user" ? "customer" : "partner");
const subjectWhere = (s: Subject) => (s.kind === "user" ? sql`s.user_id = ${s.userId}` : sql`s.organization_id = ${s.organizationId}`);

// ── Plans ────────────────────────────────────────────────────────────────────

const toPlan = (r: Row): PlanView => ({
  id: String(r.id),
  code: String(r.code),
  audience: r.audience as PlanAudience,
  name: String(r.name),
  tagline: String(r.tagline),
  monthlyPrice: Number(r.monthly_price),
  yearlyPrice: Number(r.yearly_price),
  trialDays: Number(r.trial_days),
  features: (r.features as PlanView["features"]) ?? [],
  limits: (r.limits as Record<string, number>) ?? {},
  highlighted: Boolean(r.highlighted),
  isActive: Boolean(r.is_active),
  free: Number(r.monthly_price) === 0 && Number(r.yearly_price) === 0,
});

export async function listPlans(audience?: PlanAudience, opts: { includeInactive?: boolean } = {}, tx: DbOrTx = db): Promise<PlanView[]> {
  const { rows } = await tx.execute(sql`
    SELECT * FROM finance.plans
     WHERE ${audience ? sql`audience = ${audience}` : sql`TRUE`} ${opts.includeInactive ? sql`` : sql`AND is_active`}
     ORDER BY audience, sort_order`);
  return (rows as Row[]).map(toPlan);
}

async function planByCode(tx: DbOrTx, code: string): Promise<PlanView> {
  const { rows } = await tx.execute(sql`SELECT * FROM finance.plans WHERE code = ${code}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw invalid("Choose a plan.", { plan: "Choose a plan" });
  return toPlan(r);
}

// ── A subscriber's subscription ──────────────────────────────────────────────

export type SubscriptionView = {
  id: string;
  referenceId: string;
  plan: PlanView;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  state: EffectiveState;
  entitled: boolean;
  price: number;
  trialEndsAt: string | null;
  /** Whole days of trial left, while it's running; null otherwise. */
  trialDaysLeft: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  pauseUntil: string | null;
  /** The team's remark for a pause or revocation. */
  statusReason: string | null;
  pausedForSuspension: boolean;
  provider: string;
  createdAt: string;
  subscriber: { kind: "user" | "organization"; name: string; referenceId: string; email: string | null };
};

const SELECT = sql`
  SELECT s.*, row_to_json(p.*) AS plan_row,
         coalesce(u.name, o.name) AS subscriber_name, coalesce(u.reference_id, o.reference_id) AS subscriber_ref,
         coalesce(u.email::text, o.contact_email::text) AS subscriber_email
    FROM finance.subscriptions s
    JOIN finance.plans p ON p.id = s.plan_id
    LEFT JOIN identity.users u ON u.id = s.user_id
    LEFT JOIN orgs.organizations o ON o.id = s.organization_id`;

function toView(r: Row): SubscriptionView {
  const dates = {
    status: r.status as SubscriptionStatus,
    trialEndsAt: iso(r.trial_ends_at),
    currentPeriodEnd: iso(r.current_period_end),
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
  };
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    plan: toPlan(r.plan_row as Row),
    billingCycle: r.billing_cycle as BillingCycle,
    status: dates.status,
    state: effectiveState(dates),
    entitled: isEntitled(dates),
    price: Number(r.price),
    trialEndsAt: dates.trialEndsAt,
    trialDaysLeft: dates.trialEndsAt && Date.parse(dates.trialEndsAt) > Date.now() ? Math.ceil((Date.parse(dates.trialEndsAt) - Date.now()) / 86_400_000) : null,
    currentPeriodStart: iso(r.current_period_start),
    currentPeriodEnd: dates.currentPeriodEnd,
    cancelAtPeriodEnd: dates.cancelAtPeriodEnd,
    pausedAt: iso(r.paused_at),
    pauseUntil: iso(r.pause_until),
    statusReason: (r.status_reason as string) ?? null,
    pausedForSuspension: Boolean(r.paused_for_suspension),
    provider: String(r.provider),
    createdAt: iso(r.created_at)!,
    subscriber: { kind: r.user_id ? "user" : "organization", name: String(r.subscriber_name), referenceId: String(r.subscriber_ref), email: (r.subscriber_email as string) ?? null },
  };
}

/**
 * Brings stored statuses in line with the dates: a trial or a paid period (past its grace) that
 * has run out becomes expired, and one cancelled at period end becomes cancelled. Run before any
 * change, so the one-live-subscription rule sees the truth.
 */
async function settle(tx: DbOrTx, where = sql`TRUE`) {
  // A pause with an end date resumes itself, with the paused time added back.
  await tx.execute(sql`
    WITH resumed AS (
      UPDATE finance.subscriptions s SET
        status = s.paused_from,
        trial_ends_at = s.trial_ends_at + (s.pause_until - s.paused_at),
        current_period_end = s.current_period_end + (s.pause_until - s.paused_at),
        paused_at = NULL, pause_until = NULL, paused_from = NULL, status_reason = NULL, paused_for_suspension = false, updated_at = now()
       WHERE ${where} AND s.status = 'paused' AND s.pause_until IS NOT NULL AND s.pause_until <= now()
      RETURNING s.id, s.status)
    INSERT INTO finance.subscription_events (id, subscription_id, action, from_status, to_status, note)
    SELECT gen_random_uuid(), id, 'auto_resumed', 'paused', status, 'The pause ended' FROM resumed`);
  await tx.execute(sql`
    UPDATE finance.subscriptions s SET
      status = CASE WHEN s.status = 'active' AND s.cancel_at_period_end THEN 'cancelled' ELSE 'expired' END, updated_at = now()
     WHERE ${where} AND (
       (s.status = 'trialing' AND s.trial_ends_at <= now())
       OR (s.status = 'active' AND s.cancel_at_period_end AND s.current_period_end <= now())
       OR (s.status = 'active' AND s.current_period_end <= now() - ${`${GRACE_DAYS} days`}::interval))`);
}

/** The subscriber's live subscription, or else their most recent one, or null. */
export async function subscriptionFor(subject: Subject, tx: DbOrTx = db): Promise<SubscriptionView | null> {
  const { rows } = await tx.execute(sql`${SELECT} WHERE ${subjectWhere(subject)}
    ORDER BY (s.status IN ('trialing', 'pending_payment', 'active')) DESC, s.created_at DESC LIMIT 1`);
  const r = rows[0] as Row | undefined;
  return r ? toView(r) : null;
}

/** Whether the subscriber has ever had a free trial for their audience. One each. */
async function hadTrial(tx: DbOrTx, subject: Subject): Promise<boolean> {
  const { rows } = await tx.execute(sql`SELECT 1 FROM finance.subscriptions s WHERE ${subjectWhere(subject)} AND s.trial_ends_at IS NOT NULL LIMIT 1`);
  return rows.length > 0;
}

export type SubscriptionOverview = { subscription: SubscriptionView | null; plans: PlanView[]; trialAvailable: boolean; entitledPlan: PlanView };

/** What the subscriber's subscription page needs: their subscription, the plans, and whether a trial is open to them. */
export async function overviewFor(subject: Subject): Promise<SubscriptionOverview> {
  const audience = audienceOf(subject);
  await settle(db, subjectWhere(subject));
  const [subscription, plans, trialUsed] = await Promise.all([subscriptionFor(subject), listPlans(audience), hadTrial(db, subject)]);
  const free = plans.find((p) => p.free) ?? plans[0];
  return { subscription, plans, trialAvailable: !trialUsed, entitledPlan: subscription?.entitled ? subscription.plan : free };
}

/** The plan whose features apply right now: the subscribed plan while it works, otherwise Free. */
export async function entitlementsFor(subject: Subject): Promise<{ plan: PlanView; limits: Record<string, number>; has: (featureKey: string) => boolean }> {
  const overview = await overviewFor(subject);
  const plan = overview.entitledPlan;
  return { plan, limits: plan.limits, has: (key) => plan.features.some((f) => f.key === key && !f.comingSoon) };
}

// ── Who acts for which subscription ──────────────────────────────────────────

/** A partner's subscription is their organization's; its admin, or the sole trader, manages it. */
export function partnerSubject(actor: Actor): Subject | null {
  if (actor.workspace !== "professional") return null;
  return { kind: "organization", organizationId: actor.organization.id };
}
export function canManagePartnerSubscription(actor: Actor): boolean {
  return actor.workspace === "professional" && (actor.organization.orgType === "personal" || actor.permissions["listings.view"] === "org");
}

type Who = { userId: string; audit: Actor | PersonActor };

async function event(tx: Tx, subscriptionId: string, e: { action: string; from: string | null; to: string; amount?: number; paymentReference?: string; note?: string; actorUserId: string | null }) {
  await tx.execute(sql`
    INSERT INTO finance.subscription_events (id, subscription_id, action, from_status, to_status, amount, payment_reference, note, actor_user_id)
    VALUES (gen_random_uuid(), ${subscriptionId}, ${e.action}, ${e.from}, ${e.to}, ${e.amount ?? null}, ${e.paymentReference ?? null}, ${e.note ?? null}, ${e.actorUserId})`);
}

/** The people a subscription's news goes to: the person, or the organization's active members. */
async function recipients(tx: Tx, subscriptionId: string): Promise<string[]> {
  const { rows } = await tx.execute(sql`
    SELECT coalesce(s.user_id, m.user_id) AS user_id FROM finance.subscriptions s
      LEFT JOIN orgs.memberships m ON m.organization_id = s.organization_id AND m.status = 'active'
     WHERE s.id = ${subscriptionId}`);
  return [...new Set((rows as Row[]).map((r) => String(r.user_id)).filter((v) => v !== "null"))];
}

async function auditChange(tx: Tx, who: Actor | PersonActor | null, sub: { id: string; referenceId: string; organizationId?: string | null }, action: string, before: string | null, after: string, ctx: RequestContext, extra?: Record<string, unknown>) {
  await audit(tx, who, { event: "SUBSCRIPTION_CHANGED", target: { type: "subscription", id: sub.id, referenceId: sub.referenceId }, organizationId: sub.organizationId ?? null, before: before ? { status: before } : undefined, after: { status: after }, metadata: { action, ...extra } }, ctx);
}

const choiceSchema = z.object({ plan: z.string().regex(/^[a-z_]{2,40}$/, "Choose a plan"), cycle: z.enum(BILLING_CYCLES, { message: "Choose monthly or yearly" }) });

/** Starts the free trial of a plan: once per subscriber, and only with nothing else live. */
export async function startTrial(who: Who, subject: Subject, raw: unknown, ctx: RequestContext) {
  const parsed = choiceSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Choose a plan.", fieldErrorsFrom(parsed.error));
  return db.transaction(async (tx) => {
    await settle(tx, subjectWhere(subject));
    const plan = await planByCode(tx, parsed.data.plan);
    if (plan.audience !== audienceOf(subject) || !plan.isActive || plan.free || plan.trialDays === 0) throw invalid("That plan has no free trial.", { plan: "No free trial on this plan" });
    if (await hadTrial(tx, subject)) throw conflict("You've already had a free trial. Choose a plan to subscribe.");
    const live = await subscriptionFor(subject, tx);
    if (live && ["trialing", "pending_payment", "active", "paused"].includes(live.status)) throw conflict("You already have a subscription.");
    const { rows } = await tx.execute(sql`
      INSERT INTO finance.subscriptions (id, user_id, organization_id, plan_id, billing_cycle, status, price, trial_ends_at, created_by)
      VALUES (gen_random_uuid(), ${subject.kind === "user" ? subject.userId : null}, ${subject.kind === "organization" ? subject.organizationId : null}, ${plan.id},
              ${parsed.data.cycle}, 'trialing', ${priceFor(plan, parsed.data.cycle)}, now() + ${`${plan.trialDays} days`}::interval, ${who.userId})
      RETURNING id, reference_id`);
    const r = rows[0] as Row;
    const sub = { id: String(r.id), referenceId: String(r.reference_id), organizationId: subject.kind === "organization" ? subject.organizationId : null };
    await event(tx, sub.id, { action: "trial_started", from: null, to: "trialing", note: `${plan.name}, ${plan.trialDays}-day trial`, actorUserId: who.userId });
    await auditChange(tx, who.audit, sub, "trial_started", null, "trialing", ctx, { plan: plan.code });
    return { referenceId: sub.referenceId, trialDays: plan.trialDays, plan: plan.name };
  });
}

/**
 * Chooses a paid plan: it waits for the first payment, which the team records. During a trial
 * the trial keeps running. An active subscriber's change of plan is a request for the team.
 */
export async function choosePlan(who: Who, subject: Subject, raw: unknown, ctx: RequestContext) {
  const parsed = choiceSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Choose a plan.", fieldErrorsFrom(parsed.error));
  const { cycle } = parsed.data;
  return db.transaction(async (tx) => {
    await settle(tx, subjectWhere(subject));
    const plan = await planByCode(tx, parsed.data.plan);
    if (plan.audience !== audienceOf(subject) || !plan.isActive || plan.free) throw invalid("Choose a paid plan.", { plan: "Choose a paid plan" });
    const live = await subscriptionFor(subject, tx);
    if (live?.status === "paused") throw conflict(`Your subscription is paused by Trustbrick${live.statusReason ? `: ${live.statusReason}` : ""}. Contact us to resume it.`);
    const price = priceFor(plan, cycle);
    let sub: { id: string; referenceId: string; organizationId: string | null };
    let action: string;
    if (live && live.status === "active") {
      // A change of plan is arranged by the team, so the payment and the new period line up.
      await event(tx, live.id, { action: "change_requested", from: "active", to: "active", note: `Asked to move to ${plan.name}, ${cycle}`, actorUserId: who.userId });
      sub = { id: live.id, referenceId: live.referenceId, organizationId: subject.kind === "organization" ? subject.organizationId : null };
      action = "change_requested";
    } else if (live && (live.status === "trialing" || live.status === "pending_payment")) {
      await tx.execute(sql`UPDATE finance.subscriptions SET plan_id = ${plan.id}, billing_cycle = ${cycle}, price = ${price}, status = 'pending_payment', updated_at = now() WHERE id = ${live.id}`);
      await event(tx, live.id, { action: "plan_chosen", from: live.status, to: "pending_payment", note: `${plan.name}, ${cycle}, ${inr(price)}`, actorUserId: who.userId });
      sub = { id: live.id, referenceId: live.referenceId, organizationId: subject.kind === "organization" ? subject.organizationId : null };
      action = "plan_chosen";
    } else {
      const { rows } = await tx.execute(sql`
        INSERT INTO finance.subscriptions (id, user_id, organization_id, plan_id, billing_cycle, status, price, created_by)
        VALUES (gen_random_uuid(), ${subject.kind === "user" ? subject.userId : null}, ${subject.kind === "organization" ? subject.organizationId : null}, ${plan.id},
                ${cycle}, 'pending_payment', ${price}, ${who.userId})
        RETURNING id, reference_id`);
      const r = rows[0] as Row;
      sub = { id: String(r.id), referenceId: String(r.reference_id), organizationId: subject.kind === "organization" ? subject.organizationId : null };
      await event(tx, sub.id, { action: "plan_chosen", from: null, to: "pending_payment", note: `${plan.name}, ${cycle}, ${inr(price)}`, actorUserId: who.userId });
      action = "plan_chosen";
    }
    await auditChange(tx, who.audit, sub, action, live?.status ?? null, action === "change_requested" ? "active" : "pending_payment", ctx, { plan: plan.code, cycle, price });
    await notifyPermissionHolders(tx, "subscriptions.manage", {
      type: "subscription_requested",
      title: action === "change_requested" ? `Plan change requested: ${plan.name} (${sub.referenceId})` : `New subscription waiting for payment: ${plan.name}, ${inr(price)} ${cycle === "monthly" ? "a month" : "a year"}`,
      link: `/subscriptions?q=${sub.referenceId}`,
    });
    return { referenceId: sub.referenceId, action };
  });
}

/** Cancels: a trial or an unpaid choice ends now; a paid plan runs to the end of what's paid. */
export async function cancelOwn(who: Who, subject: Subject, ctx: RequestContext) {
  await db.transaction(async (tx) => {
    await settle(tx, subjectWhere(subject));
    const live = await subscriptionFor(subject, tx);
    if (!live || !["trialing", "pending_payment", "active", "paused"].includes(live.status)) throw conflict("There's no subscription to cancel.");
    const sub = { id: live.id, referenceId: live.referenceId, organizationId: subject.kind === "organization" ? subject.organizationId : null };
    if (live.status === "active") {
      if (live.cancelAtPeriodEnd) throw conflict("It's already set to end with the paid period.");
      await tx.execute(sql`UPDATE finance.subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = ${live.id}`);
      await event(tx, live.id, { action: "cancel_scheduled", from: "active", to: "active", note: "Ends with the paid period", actorUserId: who.userId });
      await auditChange(tx, who.audit, sub, "cancel_scheduled", "active", "active", ctx);
    } else {
      await tx.execute(sql`UPDATE finance.subscriptions SET status = 'cancelled', updated_at = now() WHERE id = ${live.id}`);
      await event(tx, live.id, { action: "cancelled", from: live.status, to: "cancelled", actorUserId: who.userId });
      await auditChange(tx, who.audit, sub, "cancelled", live.status, "cancelled", ctx);
    }
  });
}

/** Takes back a cancellation scheduled for the end of the paid period. */
export async function resumeOwn(who: Who, subject: Subject, ctx: RequestContext) {
  await db.transaction(async (tx) => {
    await settle(tx, subjectWhere(subject));
    const live = await subscriptionFor(subject, tx);
    if (!live || live.status !== "active" || !live.cancelAtPeriodEnd) throw conflict("There's nothing to resume.");
    await tx.execute(sql`UPDATE finance.subscriptions SET cancel_at_period_end = false, updated_at = now() WHERE id = ${live.id}`);
    await event(tx, live.id, { action: "resumed", from: "active", to: "active", actorUserId: who.userId });
    await auditChange(tx, who.audit, { id: live.id, referenceId: live.referenceId, organizationId: subject.kind === "organization" ? subject.organizationId : null }, "resumed", "active", "active", ctx);
  });
}

// ── The team ─────────────────────────────────────────────────────────────────

export const subscriptionFilters = z.object({
  state: z.enum(["all", "trialing", "pending_payment", "active", "past_due", "paused", "ended"]).catch("all"),
  audience: z.enum(["customer", "partner"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
});
export type SubscriptionFilters = z.infer<typeof subscriptionFilters>;

export async function listSubscriptions(actor: Actor, filters: SubscriptionFilters, page: number): Promise<Page<SubscriptionView> & { stats: SubscriptionStats }> {
  assertCan(actor, "subscriptions.view", "platform");
  await settle(db);
  const where = [sql`TRUE`];
  if (filters.audience) where.push(sql`p.audience = ${filters.audience}`);
  if (filters.state === "trialing") where.push(sql`s.status = 'trialing'`);
  if (filters.state === "pending_payment") where.push(sql`s.status = 'pending_payment'`);
  if (filters.state === "active") where.push(sql`s.status = 'active' AND s.current_period_end > now()`);
  if (filters.state === "past_due") where.push(sql`s.status = 'active' AND s.current_period_end <= now()`);
  if (filters.state === "paused") where.push(sql`s.status = 'paused'`);
  if (filters.state === "ended") where.push(sql`s.status IN ('cancelled', 'revoked', 'expired')`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(s.reference_id = ${ref} OR u.reference_id = ${ref} OR o.reference_id = ${ref} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR o.name ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit, offset } = pageParams(page);
  const [rows, count, stats] = await Promise.all([
    db.execute(sql`${SELECT} WHERE ${whereSql} ORDER BY (s.status = 'pending_payment') DESC, s.updated_at DESC LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM finance.subscriptions s JOIN finance.plans p ON p.id = s.plan_id
                     LEFT JOIN identity.users u ON u.id = s.user_id LEFT JOIN orgs.organizations o ON o.id = s.organization_id WHERE ${whereSql}`),
    subscriptionStats(),
  ]);
  return { rows: (rows.rows as Row[]).map(toView), total: Number((count.rows[0] as Row).n), page, pageSize: limit, stats };
}

export type SubscriptionStats = { trialing: number; pending: number; active: number; pastDue: number; paused: number; monthlyRevenue: number; byPlan: { name: string; audience: string; active: number }[] };

/** Live counts and the monthly value of what's active (yearly plans counted at a twelfth). */
export async function subscriptionStats(): Promise<SubscriptionStats> {
  const [totals, plans] = await Promise.all([
    db.execute(sql`
      SELECT count(*) FILTER (WHERE status = 'trialing' AND trial_ends_at > now())::int AS trialing,
             count(*) FILTER (WHERE status = 'pending_payment')::int AS pending,
             count(*) FILTER (WHERE status = 'active' AND current_period_end > now())::int AS active,
             count(*) FILTER (WHERE status = 'active' AND current_period_end <= now())::int AS past_due,
             count(*) FILTER (WHERE status = 'paused')::int AS paused,
             coalesce(sum(CASE WHEN billing_cycle = 'monthly' THEN price ELSE price / 12 END) FILTER (WHERE status = 'active' AND current_period_end > now()), 0) AS mrr
        FROM finance.subscriptions`),
    db.execute(sql`
      SELECT p.name, p.audience, count(s.id) FILTER (WHERE s.status = 'active' AND s.current_period_end > now())::int AS active
        FROM finance.plans p LEFT JOIN finance.subscriptions s ON s.plan_id = p.id
       WHERE NOT (p.monthly_price = 0 AND p.yearly_price = 0) GROUP BY p.id ORDER BY p.audience, p.sort_order`),
  ]);
  const t = totals.rows[0] as Row;
  return {
    trialing: Number(t.trialing),
    pending: Number(t.pending),
    active: Number(t.active),
    pastDue: Number(t.past_due),
    paused: Number(t.paused),
    monthlyRevenue: Math.round(Number(t.mrr)),
    byPlan: (plans.rows as Row[]).map((r) => ({ name: String(r.name), audience: String(r.audience), active: Number(r.active) })),
  };
}

export async function subscriptionEvents(actor: Actor, subscriptionId: string) {
  assertCan(actor, "subscriptions.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT e.*, u.name AS actor_name FROM finance.subscription_events e LEFT JOIN identity.users u ON u.id = e.actor_user_id
     WHERE e.subscription_id = ${subscriptionId} ORDER BY e.created_at DESC, e.id DESC LIMIT 20`);
  return (rows as Row[]).map((r) => ({
    action: String(r.action),
    toStatus: String(r.to_status),
    amount: r.amount === null ? null : Number(r.amount),
    paymentReference: (r.payment_reference as string) ?? null,
    note: (r.note as string) ?? null,
    actorName: (r.actor_name as string) ?? null,
    at: iso(r.created_at)!,
  }));
}

async function lockByRef(tx: Tx, referenceId: string): Promise<SubscriptionView & { organizationId: string | null }> {
  if (!isReferenceId(referenceId, "SUB")) throw notFound();
  await settle(tx, sql`s.reference_id = ${referenceId}`);
  const { rows } = await tx.execute(sql`${SELECT} WHERE s.reference_id = ${referenceId} FOR UPDATE OF s`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { ...toView(r), organizationId: (r.organization_id as string) ?? null };
}

const reason = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

const paymentSchema = z.object({
  amount: z.coerce.number({ message: "Enter the amount received" }).positive("Enter the amount received").max(10_000_000),
  paymentReference: z.string().trim().min(3, "Enter the bank, UPI or gateway reference").max(120),
});

/**
 * Records a payment: it starts the paid period (from now, or from the end of the current one
 * when renewing early) and makes the subscription active.
 */
export async function recordPayment(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the payment.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (sub.status === "paused") throw conflict("Resume it before recording a payment.");
    if (!["pending_payment", "active", "trialing"].includes(sub.status)) throw conflict("This subscription has ended. Ask them to choose a plan again.");
    const now = new Date();
    const start = sub.status === "active" && sub.currentPeriodEnd && Date.parse(sub.currentPeriodEnd) > now.getTime() ? new Date(sub.currentPeriodEnd) : now;
    const end = periodEnd(start, sub.billingCycle);
    await tx.execute(sql`
      UPDATE finance.subscriptions SET status = 'active', current_period_start = ${start.toISOString()}, current_period_end = ${end.toISOString()},
             cancel_at_period_end = false, updated_at = now()
       WHERE id = ${sub.id}`);
    await event(tx, sub.id, { action: sub.status === "active" ? "renewed" : "payment_received", from: sub.status, to: "active", amount: parsed.data.amount, paymentReference: parsed.data.paymentReference, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "payment_recorded", sub.status, "active", ctx, { amount: parsed.data.amount, reference: parsed.data.paymentReference });
    await notify(tx, await recipients(tx, sub.id), {
      type: "subscription_updated",
      title: `${sub.plan.name} is active until ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
      body: `Payment of ${inr(parsed.data.amount)} received. Thank you.`,
      link: sub.subscriber.kind === "user" ? "/account/subscription" : "/subscription",
    });
  });
}

export async function extendTrial(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = z.object({ days: z.coerce.number().int().min(1, "1 to 60 days").max(60, "1 to 60 days"), reason }).safeParse(raw);
  if (!parsed.success) throw invalid("Please check the details.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (sub.status !== "trialing" && !(sub.status === "pending_payment" && sub.trialEndsAt)) throw conflict("Only a running trial can be extended.");
    await tx.execute(sql`UPDATE finance.subscriptions SET trial_ends_at = greatest(trial_ends_at, now()) + ${`${parsed.data.days} days`}::interval, updated_at = now() WHERE id = ${sub.id}`);
    await event(tx, sub.id, { action: "trial_extended", from: sub.status, to: sub.status, note: `${parsed.data.days} days: ${parsed.data.reason}`, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "trial_extended", sub.status, sub.status, ctx, { days: parsed.data.days, reason: parsed.data.reason });
  });
}

const LIVE_SQL = ["trialing", "pending_payment", "active", "paused"];

/**
 * Revokes: the team ends a subscription now, with a remark the subscriber sees. It can't be
 * undone; they can choose a plan again afterwards.
 */
export async function revokeSubscription(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = z.object({ reason }).safeParse(raw);
  if (!parsed.success) throw invalid("Write a remark of at least 10 characters.", { reason: "Write a remark of at least 10 characters" });
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (!LIVE_SQL.includes(sub.status)) throw conflict("This subscription has already ended.");
    await tx.execute(sql`
      UPDATE finance.subscriptions SET status = 'revoked', status_reason = ${parsed.data.reason}, paused_at = NULL, pause_until = NULL, paused_from = NULL,
             paused_for_suspension = false, updated_at = now()
       WHERE id = ${sub.id}`);
    await event(tx, sub.id, { action: "revoked", from: sub.status, to: "revoked", note: parsed.data.reason, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "revoked", sub.status, "revoked", ctx, { reason: parsed.data.reason });
    await notify(tx, await recipients(tx, sub.id), { type: "subscription_updated", title: `Your ${sub.plan.name} subscription was revoked by Trustbrick`, body: parsed.data.reason, link: sub.subscriber.kind === "user" ? "/account/subscription" : "/subscription" });
  });
}

const pauseSchema = z.object({
  reason,
  until: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.iso.date("Enter a date").optional()),
});

async function pauseRow(tx: Tx, sub: { id: string; status: string }, reasonText: string, until: string | null, forSuspension: boolean) {
  await tx.execute(sql`
    UPDATE finance.subscriptions SET status = 'paused', paused_from = ${sub.status}, paused_at = now(), pause_until = ${until},
           status_reason = ${reasonText}, paused_for_suspension = ${forSuspension}, updated_at = now()
     WHERE id = ${sub.id}`);
}

/** Puts the paused time back on the trial and the paid period, and returns it to where it was. */
async function resumeRow(tx: Tx, subId: string) {
  const { rows } = await tx.execute(sql`
    UPDATE finance.subscriptions s SET
      status = s.paused_from,
      trial_ends_at = s.trial_ends_at + (now() - s.paused_at),
      current_period_end = s.current_period_end + (now() - s.paused_at),
      paused_at = NULL, pause_until = NULL, paused_from = NULL, status_reason = NULL, paused_for_suspension = false, updated_at = now()
     WHERE s.id = ${subId} AND s.status = 'paused'
    RETURNING s.status`);
  return String((rows[0] as Row).status);
}

/**
 * Pauses: the plan's features stop until it's resumed, or until the date given, and the time it
 * spends paused is added back to the trial or the paid period. The subscriber sees the remark.
 */
export async function pauseSubscription(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = pauseSchema.safeParse(raw);
  if (!parsed.success) {
    const e = fieldErrorsFrom(parsed.error);
    throw invalid(e.reason ? "Write a remark of at least 10 characters." : "Check the date.", e);
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (parsed.data.until && parsed.data.until <= today) throw invalid("Choose a date after today, or leave it blank.", { until: "Choose a date after today" });
  // Resumes at the start of that day in India.
  const until = parsed.data.until ? new Date(`${parsed.data.until}T00:00:00+05:30`).toISOString() : null;
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (sub.status === "paused") throw conflict("It's already paused.");
    if (!["trialing", "pending_payment", "active"].includes(sub.status)) throw conflict("Only a running subscription can be paused.");
    await pauseRow(tx, sub, parsed.data.reason, until, false);
    await event(tx, sub.id, { action: "paused", from: sub.status, to: "paused", note: `${parsed.data.reason}${parsed.data.until ? ` (until ${parsed.data.until})` : ""}`, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "paused", sub.status, "paused", ctx, { reason: parsed.data.reason, until: parsed.data.until ?? null });
    await notify(tx, await recipients(tx, sub.id), {
      type: "subscription_updated",
      title: `Your ${sub.plan.name} subscription is paused by Trustbrick`,
      body: `${parsed.data.reason}${parsed.data.until ? ` It resumes on ${parsed.data.until}.` : ""} The paused time will be added back.`,
      link: sub.subscriber.kind === "user" ? "/account/subscription" : "/subscription",
    });
  });
}

export async function resumeSubscription(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const note = typeof (raw as { reason?: unknown })?.reason === "string" ? String((raw as { reason: string }).reason).trim().slice(0, 500) || null : null;
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (sub.status !== "paused") throw conflict("It isn't paused.");
    const to = await resumeRow(tx, sub.id);
    await event(tx, sub.id, { action: "resumed_by_team", from: "paused", to, note: note ?? undefined, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "resumed", "paused", to, ctx, note ? { note } : undefined);
    await notify(tx, await recipients(tx, sub.id), {
      type: "subscription_updated",
      title: `Your ${sub.plan.name} subscription is running again`,
      body: "The time it was paused has been added back.",
      link: sub.subscriber.kind === "user" ? "/account/subscription" : "/subscription",
    });
  });
}

/** Suspending an account pauses the person's own subscription; reinstating resumes it. */
export async function pauseForSuspension(tx: Tx, userId: string, reasonText: string, actorUserId: string) {
  await settle(tx, sql`s.user_id = ${userId}`);
  const { rows } = await tx.execute(sql`
    SELECT id, status FROM finance.subscriptions s WHERE s.user_id = ${userId} AND s.status IN ('trialing', 'pending_payment', 'active') FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) return false;
  await pauseRow(tx, { id: String(r.id), status: String(r.status) }, `Account suspended: ${reasonText}`, null, true);
  await event(tx, String(r.id), { action: "paused_suspension", from: String(r.status), to: "paused", note: reasonText, actorUserId });
  return true;
}

export async function resumeAfterSuspension(tx: Tx, userId: string, actorUserId: string) {
  const { rows } = await tx.execute(sql`SELECT id FROM finance.subscriptions s WHERE s.user_id = ${userId} AND s.status = 'paused' AND s.paused_for_suspension FOR UPDATE`);
  const r = rows[0] as Row | undefined;
  if (!r) return false;
  const to = await resumeRow(tx, String(r.id));
  await event(tx, String(r.id), { action: "resumed_suspension", from: "paused", to, actorUserId });
  return true;
}

/** Moves a subscription to another plan of the same audience; the new price applies from the next payment. */
export async function changePlan(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = choiceSchema.extend({ reason }).safeParse(raw);
  if (!parsed.success) throw invalid("Please check the details.", fieldErrorsFrom(parsed.error));
  await db.transaction(async (tx) => {
    const sub = await lockByRef(tx, referenceId);
    if (!["trialing", "pending_payment", "active"].includes(sub.status)) throw conflict("This subscription has ended.");
    const plan = await planByCode(tx, parsed.data.plan);
    if (plan.audience !== sub.plan.audience || plan.free) throw invalid("Choose a paid plan for the same kind of subscriber.", { plan: "Not available for this subscriber" });
    await tx.execute(sql`UPDATE finance.subscriptions SET plan_id = ${plan.id}, billing_cycle = ${parsed.data.cycle}, price = ${priceFor(plan, parsed.data.cycle)}, updated_at = now() WHERE id = ${sub.id}`);
    await event(tx, sub.id, { action: "plan_changed", from: sub.status, to: sub.status, note: `${sub.plan.name} → ${plan.name}, ${parsed.data.cycle}: ${parsed.data.reason}`, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "plan_changed", sub.status, sub.status, ctx, { from: sub.plan.code, to: plan.code, cycle: parsed.data.cycle, reason: parsed.data.reason });
  });
}

const grantSchema = z.object({
  subscriber: z.string().trim().transform(normalizeReferenceId).refine((v) => isReferenceId(v, "USR") || isReferenceId(v, "ORG"), "Enter a USR- or ORG- reference"),
  plan: z.string().regex(/^[a-z_]{2,40}$/, "Choose a plan"),
  months: z.coerce.number().int().min(1, "1 to 24 months").max(24, "1 to 24 months"),
  reason,
});

/** A complimentary subscription, e.g. for a launch partner: active for the months given, at no charge. */
export async function grantSubscription(actor: Actor, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string }> {
  assertCan(actor, "subscriptions.manage", "platform");
  const parsed = grantSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  return db.transaction(async (tx) => {
    const isOrg = input.subscriber.startsWith("ORG-");
    const found = await tx.execute(
      isOrg
        ? sql`SELECT id FROM orgs.organizations WHERE reference_id = ${input.subscriber} AND org_type <> 'internal' AND deleted_at IS NULL`
        : sql`SELECT id FROM identity.users WHERE reference_id = ${input.subscriber}`,
    );
    const id = (found.rows[0] as Row | undefined)?.id;
    if (!id) throw invalid("Please check the highlighted fields.", { subscriber: "No subscriber has that reference" });
    const subject: Subject = isOrg ? { kind: "organization", organizationId: String(id) } : { kind: "user", userId: String(id) };
    const plan = await planByCode(tx, input.plan);
    if (plan.audience !== audienceOf(subject) || plan.free) throw invalid("Please check the highlighted fields.", { plan: isOrg ? "Choose a partner plan" : "Choose a customer plan" });
    await settle(tx, subjectWhere(subject));
    const live = await subscriptionFor(subject, tx);
    if (live && ["trialing", "pending_payment", "active", "paused"].includes(live.status)) throw conflict(`They already have a live subscription (${live.referenceId}). Change or cancel that one.`);
    const end = new Date();
    end.setMonth(end.getMonth() + input.months);
    const { rows } = await tx.execute(sql`
      INSERT INTO finance.subscriptions (id, user_id, organization_id, plan_id, billing_cycle, status, price, current_period_start, current_period_end, created_by)
      VALUES (gen_random_uuid(), ${subject.kind === "user" ? subject.userId : null}, ${subject.kind === "organization" ? subject.organizationId : null}, ${plan.id},
              'monthly', 'active', 0, now(), ${end.toISOString()}, ${actor.userId})
      RETURNING id, reference_id`);
    const r = rows[0] as Row;
    const sub = { id: String(r.id), referenceId: String(r.reference_id), organizationId: isOrg ? String(id) : null };
    await event(tx, sub.id, { action: "granted", from: null, to: "active", amount: 0, note: `${plan.name} for ${input.months} month${input.months === 1 ? "" : "s"}, complimentary: ${input.reason}`, actorUserId: actor.userId });
    await auditChange(tx, actor, sub, "granted", null, "active", ctx, { plan: plan.code, months: input.months, reason: input.reason });
    await notify(tx, await recipients(tx, sub.id), { type: "subscription_updated", title: `You've been given Trustbrick ${plan.name} for ${input.months} month${input.months === 1 ? "" : "s"}`, body: "With our compliments.", link: isOrg ? "/subscription" : "/account/subscription" });
    return { referenceId: sub.referenceId };
  });
}

const planEditSchema = z.object({
  code: z.string().regex(/^[a-z_]{2,40}$/),
  monthlyPrice: z.coerce.number({ message: "Enter a price" }).min(0).max(1_000_000),
  yearlyPrice: z.coerce.number({ message: "Enter a price" }).min(0).max(10_000_000),
  trialDays: z.coerce.number().int().min(0, "0 to 90 days").max(90, "0 to 90 days"),
  isActive: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  reason,
});

/** Prices, trial length and whether a plan is on sale. SuperAdmin only; existing subscribers keep their price. */
export async function updatePlan(actor: Actor, raw: unknown, ctx: RequestContext) {
  assertCan(actor, "settings.manage", "platform");
  const parsed = planEditSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const p = parsed.data;
  await db.transaction(async (tx) => {
    const before = await planByCode(tx, p.code);
    if (before.free && (p.monthlyPrice > 0 || p.yearlyPrice > 0)) throw invalid("The free plan stays free.", { monthlyPrice: "The free plan stays free" });
    if (!before.free && (p.monthlyPrice === 0 || p.yearlyPrice === 0)) throw invalid("A paid plan needs both prices.", { monthlyPrice: "Enter both prices" });
    if (before.free && !p.isActive) throw invalid("The free plan can't be taken off sale.");
    await tx.execute(sql`
      UPDATE finance.plans SET monthly_price = ${p.monthlyPrice}, yearly_price = ${p.yearlyPrice}, trial_days = ${p.trialDays}, is_active = ${p.isActive}, updated_at = now()
       WHERE code = ${p.code}`);
    await audit(
      tx,
      actor,
      {
        event: "PLAN_UPDATED",
        target: { type: "plan", referenceId: p.code },
        before: { monthlyPrice: before.monthlyPrice, yearlyPrice: before.yearlyPrice, trialDays: before.trialDays, isActive: before.isActive },
        after: { monthlyPrice: p.monthlyPrice, yearlyPrice: p.yearlyPrice, trialDays: p.trialDays, isActive: p.isActive },
        metadata: { reason: p.reason },
      },
      ctx,
    );
  });
}

/** For the plans pop-up after logging in: nothing for someone already paying. */
export async function promoFor(userId: string, actor: Actor | null): Promise<{ audience: PlanAudience; plan: PlanView; trialAvailable: boolean; state: EffectiveState | null } | null> {
  const subject: Subject = actor && actor.workspace === "professional" ? { kind: "organization", organizationId: actor.organization.id } : { kind: "user", userId };
  if (actor && actor.workspace === "platform") return null;
  const overview = await overviewFor(subject);
  const s = overview.subscription;
  // Nothing for someone paying, or whose plan the team has paused.
  if (s && (s.state === "active" || s.state === "past_due" || s.state === "pending_payment" || s.state === "paused")) return null;
  const plan = overview.plans.find((p) => p.highlighted && !p.free) ?? overview.plans.find((p) => !p.free);
  if (!plan) return null;
  return { audience: audienceOf(subject), plan, trialAvailable: overview.trialAvailable, state: s?.state ?? null };
}

export const canViewSubscriptions = (actor: Actor) => can(actor, "subscriptions.view", "platform");

/** The subscriber's own history (their latest subscription's events), for their subscription page. */
export async function ownHistory(subject: Subject) {
  const { rows } = await db.execute(sql`
    SELECT e.action, e.to_status, e.amount, e.payment_reference, e.note, e.created_at
      FROM finance.subscription_events e JOIN finance.subscriptions s ON s.id = e.subscription_id
     WHERE ${subjectWhere(subject)} ORDER BY e.created_at DESC, e.id DESC LIMIT 12`);
  return (rows as Row[]).map((r) => ({
    action: String(r.action),
    amount: r.amount === null ? null : Number(r.amount),
    paymentReference: (r.payment_reference as string) ?? null,
    note: (r.note as string) ?? null,
    at: iso(r.created_at)!,
  }));
}

export type PersonSubscriptions = {
  /** Their own plan (customer plans). */
  personal: SubscriptionView | null;
  /** Plans of the partner organizations they belong to, which cover the whole team. */
  organizations: { name: string; referenceId: string; personal: boolean; subscription: SubscriptionView | null }[];
};

/** Everything subscription-related about a person, for the team's user views. */
export async function subscriptionsForPerson(actor: Actor, userId: string): Promise<PersonSubscriptions> {
  assertCan(actor, "subscriptions.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT DISTINCT o.id, o.name, o.reference_id, o.org_type FROM orgs.memberships m JOIN orgs.organizations o ON o.id = m.organization_id
     WHERE m.user_id = ${userId} AND m.status = 'active' AND o.org_type <> 'internal' AND o.deleted_at IS NULL ORDER BY o.name`);
  await settle(db, sql`(s.user_id = ${userId} OR s.organization_id = ANY(${sql.param((rows as Row[]).map((r) => String(r.id)))}::uuid[]))`);
  const [personal, organizations] = await Promise.all([
    subscriptionFor({ kind: "user", userId }),
    Promise.all(
      (rows as Row[]).map(async (r) => ({
        name: String(r.name),
        referenceId: String(r.reference_id),
        personal: r.org_type === "personal",
        subscription: await subscriptionFor({ kind: "organization", organizationId: String(r.id) }),
      })),
    ),
  ]);
  return { personal, organizations };
}

/** An organization's subscription, for its admin page. */
export async function subscriptionForOrganization(actor: Actor, organizationId: string): Promise<SubscriptionView | null> {
  assertCan(actor, "subscriptions.view", "platform");
  await settle(db, sql`s.organization_id = ${organizationId}`);
  return subscriptionFor({ kind: "organization", organizationId });
}

/**
 * A person's own live subscription, for list queries: their customer plan, or the plan of their
 * own organization (an independent agent's or host's). A brokerage's team plan isn't "theirs".
 * Selects from finance.subscriptions `s` joined to finance.plans `p`; `userId` is a SQL column.
 */
export const ownLiveSubscription = (userId: SQL) => sql`
  FROM finance.subscriptions s JOIN finance.plans p ON p.id = s.plan_id
 WHERE (s.user_id = ${userId} OR s.organization_id IN (
         SELECT m.organization_id FROM orgs.memberships m JOIN orgs.organizations o ON o.id = m.organization_id AND o.org_type = 'personal'
          WHERE m.user_id = ${userId} AND m.status = 'active'))
   AND s.status IN ('trialing', 'pending_payment', 'active', 'paused')`;

/** The list filter: subscribed (and running), paused, or on Free. */
export const SUBSCRIPTION_FILTER = z.enum(["subscribed", "paused", "free"]).optional().catch(undefined);

export function subscriptionFilterSql(filter: "subscribed" | "paused" | "free" | undefined, userId: SQL): SQL | null {
  if (filter === "subscribed") return sql`EXISTS (SELECT 1 ${ownLiveSubscription(userId)} AND s.status <> 'paused')`;
  if (filter === "paused") return sql`EXISTS (SELECT 1 ${ownLiveSubscription(userId)} AND s.status = 'paused')`;
  if (filter === "free") return sql`NOT EXISTS (SELECT 1 ${ownLiveSubscription(userId)})`;
  return null;
}

/** The column for a list row: `own_plan` as { name, status } or null. */
export const ownPlanColumn = (userId: SQL) => sql`(SELECT json_build_object('name', p.name, 'status', s.status) ${ownLiveSubscription(userId)} ORDER BY s.created_at DESC LIMIT 1) AS own_plan`;

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  canManagePartnerSubscription,
  cancelOwn,
  choosePlan,
  entitlementsFor,
  grantSubscription,
  listPlans,
  overviewFor,
  pauseSubscription,
  promoFor,
  recordPayment,
  resumeOwn,
  resumeSubscription,
  revokeSubscription,
  startTrial,
  subscriptionFor,
  subscriptionsForPerson,
  updatePlan,
} from "@/lib/services/subscriptions";
import { listAgents } from "@/lib/services/agents";
import { agentSummary, hostSummary } from "@/lib/services/summaries";
import { listHosts } from "@/lib/services/stays/hosts";
import { listUsers, reinstateUser, suspendUser } from "@/lib/services/users";
import { GRACE_DAYS, effectiveState, isEntitled, yearlySaving } from "@/lib/subscriptions/terms";
import { ctx, makeAdmin, makeAgent, makeHost, makeOrg, makeSuperadmin, makeUser, person, one } from "./support/factory";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

let admin: Actor;
let customer: Awaited<ReturnType<typeof makeUser>>;
const who = (u: { id: string; referenceId: string }) => ({ userId: u.id, audit: person(u) });
const me = () => ({ kind: "user" as const, userId: customer.id });

beforeAll(async () => {
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  customer = await makeUser("Plan Customer");
});

describe("the rules", () => {
  it("works out the real state from the dates", () => {
    const base = { status: "active" as const, trialEndsAt: null, cancelAtPeriodEnd: false };
    expect(effectiveState({ ...base, status: "trialing", trialEndsAt: at(3), currentPeriodEnd: null })).toBe("trialing");
    expect(effectiveState({ ...base, status: "trialing", trialEndsAt: at(-1), currentPeriodEnd: null })).toBe("expired");
    expect(effectiveState({ ...base, currentPeriodEnd: at(10) })).toBe("active");
    expect(effectiveState({ ...base, currentPeriodEnd: at(-2) })).toBe("past_due");
    expect(effectiveState({ ...base, currentPeriodEnd: at(-(GRACE_DAYS + 1)) })).toBe("expired");
    expect(effectiveState({ ...base, cancelAtPeriodEnd: true, currentPeriodEnd: at(-1) })).toBe("cancelled");
    // Choosing a paid plan during a trial keeps the trial working.
    expect(isEntitled({ status: "pending_payment", trialEndsAt: at(5), currentPeriodEnd: null, cancelAtPeriodEnd: false })).toBe(true);
    expect(isEntitled({ status: "pending_payment", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false })).toBe(false);
  });

  it("starts with free and paid plans for people and partners", async () => {
    const plans = await listPlans();
    expect(plans.map((p) => p.code)).toEqual(["customer_free", "customer_plus", "partner_free", "partner_pro", "partner_business"]);
    const plus = plans.find((p) => p.code === "customer_plus")!;
    expect([plus.trialDays, yearlySaving(plus) > 0]).toEqual([14, true]);
  });
});

describe("a person's subscription", () => {
  it("takes one free trial, which unlocks the plan", async () => {
    await startTrial(who(customer), me(), { plan: "customer_plus", cycle: "monthly" }, ctx);
    const o = await overviewFor(me());
    expect([o.subscription?.state, o.entitledPlan.code, o.trialAvailable]).toEqual(["trialing", "customer_plus", false]);
    expect(await code(startTrial(who(customer), me(), { plan: "customer_plus", cycle: "monthly" }, ctx))).toBe("CONFLICT");
    // A feature still being built isn't counted as included.
    expect((await entitlementsFor(me())).has("ai_locality")).toBe(false);
  });

  it("chooses a paid plan during the trial without cutting it short, then the team records the payment", async () => {
    await choosePlan(who(customer), me(), { plan: "customer_plus", cycle: "yearly" }, ctx);
    let s = (await subscriptionFor(me()))!;
    expect([s.status, s.entitled, s.billingCycle, s.price]).toEqual(["pending_payment", true, "yearly", 1999]);
    const told = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${admin.userId} AND type = 'subscription_requested'`);
    expect(told.n).toBeGreaterThan(0);

    expect(await code(recordPayment(admin, s.referenceId, { amount: "2359", paymentReference: "" }, ctx))).toBe("VALIDATION_ERROR");
    await recordPayment(admin, s.referenceId, { amount: "2359", paymentReference: "UPI 4021" }, ctx);
    s = (await subscriptionFor(me()))!;
    const year = Date.parse(s.currentPeriodEnd!) - Date.parse(s.currentPeriodStart!);
    expect([s.state, Math.round(year / DAY) >= 365]).toEqual(["active", true]);

    // A renewal paid early runs on from the end of the current period.
    const end = s.currentPeriodEnd!;
    await recordPayment(admin, s.referenceId, { amount: "2359", paymentReference: "UPI 4022" }, ctx);
    expect((await subscriptionFor(me()))!.currentPeriodStart).toBe(end);
  });

  it("asks the team for a change of plan while active, and cancels at the end of what's paid", async () => {
    const r = await choosePlan(who(customer), me(), { plan: "customer_plus", cycle: "monthly" }, ctx);
    expect(r.action).toBe("change_requested");
    expect((await subscriptionFor(me()))!.status).toBe("active");

    await cancelOwn(who(customer), me(), ctx);
    let s = (await subscriptionFor(me()))!;
    expect([s.state, s.cancelAtPeriodEnd, s.entitled]).toEqual(["active", true, true]);
    await resumeOwn(who(customer), me(), ctx);
    s = (await subscriptionFor(me()))!;
    expect(s.cancelAtPeriodEnd).toBe(false);
    // Someone already paying isn't shown the pop-up.
    expect(await promoFor(customer.id, null)).toBeNull();
  });

  it("lets a lapsed trial choose a paid plan afterwards", async () => {
    const u = await makeUser("Lapsed Trial");
    const subject = { kind: "user" as const, userId: u.id };
    await startTrial(who(u), subject, { plan: "customer_plus", cycle: "monthly" }, ctx);
    await db.execute(sql`UPDATE finance.subscriptions SET trial_ends_at = now() - interval '1 day' WHERE user_id = ${u.id}`);
    expect((await overviewFor(subject)).entitledPlan.code).toBe("customer_free");
    const promo = await promoFor(u.id, null);
    expect([promo?.plan.code, promo?.trialAvailable]).toEqual(["customer_plus", false]);
    await choosePlan(who(u), subject, { plan: "customer_plus", cycle: "monthly" }, ctx);
    expect((await subscriptionFor(subject))!.status).toBe("pending_payment");
  });

  it("keeps people's plans and partners' plans apart", async () => {
    const u = await makeUser("Wrong Plan");
    expect(await code(startTrial(who(u), { kind: "user", userId: u.id }, { plan: "partner_pro", cycle: "monthly" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(choosePlan(who(u), { kind: "user", userId: u.id }, { plan: "customer_free", cycle: "monthly" }, ctx))).toBe("VALIDATION_ERROR");
  });
});

describe("a partner's subscription", () => {
  let org: Awaited<ReturnType<typeof makeOrg>>;
  let brokerAdmin: Actor;
  let agent: Actor;

  beforeAll(async () => {
    org = await makeOrg("Plans Realty");
    brokerAdmin = await (await makeAgent(org.id, "Plans Broker", "broker_admin")).actor();
    agent = await (await makeAgent(org.id, "Plans Agent")).actor();
  });

  it("belongs to the organization, managed by its admin", async () => {
    expect([canManagePartnerSubscription(brokerAdmin), canManagePartnerSubscription(agent)]).toEqual([true, false]);
    const subject = { kind: "organization" as const, organizationId: org.id };
    await startTrial({ userId: brokerAdmin.userId, audit: brokerAdmin }, subject, { plan: "partner_pro", cycle: "yearly" }, ctx);
    const s = (await subscriptionFor(subject))!;
    expect([s.plan.code, s.state, s.subscriber.kind]).toEqual(["partner_pro", "trialing", "organization"]);
    // The whole team sees the trial's offer to keep it.
    expect((await promoFor(agent.userId, agent))?.plan.code).toBe("partner_pro");
  });

  it("can be given a complimentary plan by the team, once at a time", async () => {
    const other = await makeOrg("Launch Partner Realty");
    const { referenceId } = await grantSubscription(admin, { subscriber: other.referenceId, plan: "partner_business", months: "6", reason: "Launch partner, agreed on the call" }, ctx);
    const s = (await subscriptionFor({ kind: "organization", organizationId: other.id }))!;
    expect([s.referenceId, s.state, s.price]).toEqual([referenceId, "active", 0]);
    expect(await code(grantSubscription(admin, { subscriber: other.referenceId, plan: "partner_pro", months: "1", reason: "A second grant for testing" }, ctx))).toBe("CONFLICT");
    expect(await code(grantSubscription(admin, { subscriber: other.referenceId, plan: "customer_plus", months: "1", reason: "Wrong audience for a partner" }, ctx))).toBe("VALIDATION_ERROR");
  });
});

describe("plans and prices", () => {
  it("leaves prices to the SuperAdmin, and existing subscribers keep theirs", async () => {
    const reason = "Launch pricing for the new year";
    expect(await code(updatePlan(admin, { code: "customer_plus", monthlyPrice: "249", yearlyPrice: "2499", trialDays: "14", isActive: "on", reason }, ctx))).toBe("FORBIDDEN");
    const sa = await (await makeSuperadmin()).actor();
    expect(await code(updatePlan(sa, { code: "customer_free", monthlyPrice: "10", yearlyPrice: "100", trialDays: "0", isActive: "on", reason }, ctx))).toBe("VALIDATION_ERROR");
    await updatePlan(sa, { code: "customer_plus", monthlyPrice: "249", yearlyPrice: "2499", trialDays: "14", isActive: "on", reason }, ctx);
    expect((await listPlans("customer")).find((p) => p.code === "customer_plus")!.monthlyPrice).toBe(249);
    expect((await subscriptionFor(me()))!.price).toBe(1999);
  });

  it("never rewrites a subscription's history", async () => {
    await expect(db.execute(sql`UPDATE finance.subscription_events SET note = 'rewritten'`)).rejects.toThrow();
  });
});

describe("pausing and revoking", () => {
  /** A person with an active yearly Plus, paid. */
  async function paidPerson(name: string) {
    const u = await makeUser(name);
    const subject = { kind: "user" as const, userId: u.id };
    await choosePlan(who(u), subject, { plan: "customer_plus", cycle: "yearly" }, ctx);
    await recordPayment(admin, (await subscriptionFor(subject))!.referenceId, { amount: "2359", paymentReference: "UPI 9001" }, ctx);
    return { u, subject, ref: (await subscriptionFor(subject))!.referenceId };
  }

  it("needs a remark to pause, switches the plan off, and adds the paused time back on resume", async () => {
    const { u, subject, ref } = await paidPerson("Pause Person");
    const endBefore = Date.parse((await subscriptionFor(subject))!.currentPeriodEnd!);
    expect(await code(pauseSubscription(admin, ref, { reason: "short" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(pauseSubscription(admin, ref, { reason: "Payment dispute with the bank", until: "2020-01-01" }, ctx))).toBe("VALIDATION_ERROR");
    await pauseSubscription(admin, ref, { reason: "Payment dispute with the bank" }, ctx);

    const paused = (await subscriptionFor(subject))!;
    expect([paused.state, paused.entitled, paused.statusReason]).toEqual(["paused", false, "Payment dispute with the bank"]);
    expect((await overviewFor(subject)).entitledPlan.code).toBe("customer_free");
    expect(await code(choosePlan(who(u), subject, { plan: "customer_plus", cycle: "monthly" }, ctx))).toBe("CONFLICT");
    const told = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${u.id} AND type = 'subscription_updated' AND body LIKE 'Payment dispute%'`);
    expect(told.n).toBe(1);

    // Ten days paused: ten days added back.
    await db.execute(sql`UPDATE finance.subscriptions SET paused_at = now() - interval '10 days' WHERE reference_id = ${ref}`);
    await resumeSubscription(admin, ref, { reason: "Dispute resolved" }, ctx);
    const resumed = (await subscriptionFor(subject))!;
    expect(resumed.state).toBe("active");
    expect(Math.round((Date.parse(resumed.currentPeriodEnd!) - endBefore) / DAY)).toBe(10);
  });

  it("resumes by itself when the pause-until date passes", async () => {
    const { subject, ref } = await paidPerson("Auto Resume Person");
    const endBefore = Date.parse((await subscriptionFor(subject))!.currentPeriodEnd!);
    const tomorrow = new Date(Date.now() + DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    await pauseSubscription(admin, ref, { reason: "Travelling, asked to pause", until: tomorrow }, ctx);
    await db.execute(sql`UPDATE finance.subscriptions SET paused_at = now() - interval '5 days', pause_until = now() - interval '1 day' WHERE reference_id = ${ref}`);
    const o = await overviewFor(subject);
    expect([o.subscription!.state, o.entitledPlan.code]).toEqual(["active", "customer_plus"]);
    expect(Math.round((Date.parse(o.subscription!.currentPeriodEnd!) - endBefore) / DAY)).toBe(4);
    const ev = await one<{ action: string }>(sql`SELECT e.action FROM finance.subscription_events e JOIN finance.subscriptions s ON s.id = e.subscription_id WHERE s.reference_id = ${ref} ORDER BY e.created_at DESC LIMIT 1`);
    expect(ev.action).toBe("auto_resumed");
  });

  it("revokes for good with a remark they see, and they can choose a plan again later", async () => {
    const { u, subject, ref } = await paidPerson("Revoke Person");
    expect(await code(revokeSubscription(admin, ref, { reason: "" }, ctx))).toBe("VALIDATION_ERROR");
    await revokeSubscription(admin, ref, { reason: "Account sharing against the terms" }, ctx);
    const s = (await subscriptionFor(subject))!;
    expect([s.state, s.statusReason, s.entitled]).toEqual(["revoked", "Account sharing against the terms", false]);
    expect(await code(resumeSubscription(admin, ref, {}, ctx))).toBe("CONFLICT");
    await choosePlan(who(u), subject, { plan: "customer_plus", cycle: "monthly" }, ctx);
    expect((await subscriptionFor(subject))!.status).toBe("pending_payment");
  });

  it("pauses with an account's suspension and resumes with its reinstatement", async () => {
    const { u, subject } = await paidPerson("Suspended Person");
    await suspendUser(admin, u.referenceId, "Repeated fake enquiries", ctx);
    const s = (await subscriptionFor(subject))!;
    expect([s.state, s.pausedForSuspension]).toEqual(["paused", true]);
    await reinstateUser(admin, u.referenceId, ctx);
    expect((await subscriptionFor(subject))!.state).toBe("active");
  });

  it("shows on the Users list and the user views", async () => {
    const { u, ref } = await paidPerson("Listed Person");
    const listed = await listUsers(admin, { q: u.referenceId, subscription: "subscribed" }, 1);
    expect(listed.rows[0]?.plan).toEqual({ name: "Plus", status: "active" });
    await pauseSubscription(admin, ref, { reason: "Checking a chargeback claim" }, ctx);
    expect((await listUsers(admin, { q: u.referenceId, subscription: "paused" }, 1)).rows).toHaveLength(1);
    expect((await listUsers(admin, { q: u.referenceId, subscription: "subscribed" }, 1)).rows).toHaveLength(0);
    const views = await subscriptionsForPerson(admin, u.id);
    expect(views.personal?.state).toBe("paused");
    // An admin who can see users but not manage subscriptions can't pause one.
    const support = await (await makeAdmin(["users.view"])).actor();
    expect(await code(pauseSubscription(support, ref, { reason: "Not allowed to do this" }, ctx))).toBe("FORBIDDEN");
  });
});

describe("on the Agents list", () => {
  it("shows an independent agent's plan, filters by it, and offers pause and revoke on the View card", async () => {
    const own = await makeOrg("Solo Agent (own)", { type: "personal" });
    const agent = await makeAgent(own.id, "Solo Plan Agent");
    const { referenceId } = await grantSubscription(admin, { subscriber: own.referenceId, plan: "partner_pro", months: "2", reason: "Trial partner for the agents list" }, ctx);

    const listed = await listAgents(admin, { q: agent.referenceId, sort: "newest", subscription: "subscribed" }, 1);
    expect(listed.rows[0]?.plan).toEqual({ name: "Pro", status: "active" });
    expect((await listAgents(admin, { q: agent.referenceId, sort: "newest", subscription: "free" }, 1)).rows).toHaveLength(0);

    const summary = await agentSummary(admin, agent.referenceId);
    expect(summary.canManageSubscriptions).toBe(true);
    expect(summary.subscriptions?.organizations.find((o) => o.referenceId === own.referenceId)).toMatchObject({ personal: true, subscription: { referenceId, state: "active" } });

    await pauseSubscription(admin, referenceId, { reason: "Paused from the agents list" }, ctx);
    expect((await listAgents(admin, { q: agent.referenceId, sort: "newest", subscription: "paused" }, 1)).rows[0]?.plan?.status).toBe("paused");

    // A broker admin sees their agents but not their subscriptions.
    const brokerage = await makeOrg("Plan-blind Brokerage");
    const broker = await (await makeAgent(brokerage.id, "Plan-blind Broker", "broker_admin")).actor();
    const mine = await makeAgent(brokerage.id, "Plan-blind Agent");
    expect((await agentSummary(broker, mine.referenceId)).subscriptions).toBeNull();
    expect((await listAgents(broker, { sort: "newest" }, 1)).rows.every((r) => r.plan === null)).toBe(true);
  });
});

describe("on the Hosts list", () => {
  it("shows a host's plan, filters by it, and offers pause and revoke on the View card", async () => {
    const host = await makeHost("Plan Host", { verified: true });
    const { referenceId } = await grantSubscription(admin, { subscriber: host.org.referenceId, plan: "partner_pro", months: "1", reason: "Launch host for the hosts list" }, ctx);

    const listed = await listHosts(admin, { q: host.referenceId, subscription: "subscribed" }, 1);
    expect(listed.rows[0]?.plan).toEqual({ name: "Pro", status: "active" });

    const summary = await hostSummary(admin, host.referenceId);
    expect([summary.kind, summary.canManageSubscriptions]).toEqual(["host", true]);
    expect(summary.subscriptions?.organizations.find((o) => o.referenceId === host.org.referenceId)).toMatchObject({ personal: true, subscription: { referenceId } });

    await revokeSubscription(admin, referenceId, { reason: "Revoked from the hosts list" }, ctx);
    expect((await listHosts(admin, { q: host.referenceId, subscription: "free" }, 1)).rows).toHaveLength(1);

    // Staff without subscription access see hosts, not their plans.
    const hostsOnly = await (await makeAdmin(["hosts.view"])).actor();
    expect((await listHosts(hostsOnly, { q: host.referenceId }, 1)).rows[0]?.plan).toBeNull();
    expect((await hostSummary(hostsOnly, host.referenceId)).subscriptions).toBeNull();
  });
});

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { computeCommission } from "@/lib/commission/terms";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  acceptCommissionTerms,
  acceptanceFor,
  addAdjustment,
  bookingCommission,
  canAcceptTerms,
  closedWithoutCommission,
  commissionForListings,
  commissionOverview,
  listLedger,
  listingCommission,
  ratesFor,
  setDefaultRate,
  setPartnerRate,
  updateEntryStatus,
} from "@/lib/services/commission";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { updatePricing } from "@/lib/services/listings/onboarding";
import { getListingForActor } from "@/lib/services/listings/queries";
import { createBooking, transitionBooking } from "@/lib/services/stays/bookings";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { ctx, makeAdmin, makeAgent, makeHost, makeOrg, makeSuperadmin, makeUser, one } from "./support/factory";
import { readyRentListing, readyStay } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const due = { status: "due" as const };
const day = (offset: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

let admin: Actor;
let moderator: Actor;
let brokerage: Awaited<ReturnType<typeof makeOrg>>;
let brokerAdmin: Actor;
let agent: Actor;

/** A live rental by this agent, ready to be marked rented out. */
async function liveRental(by: Actor, rent = 40_000) {
  const ref = await readyRentListing(by, { rent });
  await transitionListing(by, ref, "submit", {}, ctx);
  await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
  return ref;
}

beforeAll(async () => {
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  brokerage = await makeOrg("Commission Realty");
  brokerAdmin = await (await makeAgent(brokerage.id, "Broker Admin", "broker_admin")).actor();
  agent = await (await makeAgent(brokerage.id, "Commission Agent")).actor();
});

describe("the calculation", () => {
  it("takes a share of the brokerage, or of the deal, then adds GST", () => {
    expect(computeCommission({ basis: "brokerage", percent: 20, dealValue: 1_00_00_000, brokerage: 1_00_000, gstPercent: 18 })).toEqual({ base: 1_00_000, amount: 20_000, gst: 3_600, total: 23_600 });
    expect(computeCommission({ basis: "deal_value", percent: 10, dealValue: 12_500, gstPercent: 0 })).toEqual({ base: 12_500, amount: 1_250, gst: 0, total: 1_250 });
  });

  it("starts with Trustbrick's defaults", async () => {
    const d = await ratesFor(null);
    expect([d.sale.basis, d.sale.percent, d.stay.basis, d.stay.percent]).toEqual(["brokerage", 20, "deal_value", 10]);
  });
});

describe("rates and accepting them", () => {
  it("lets the broker admin accept for the brokerage, not its agents", async () => {
    expect(canAcceptTerms(brokerAdmin)).toBe(true);
    expect(canAcceptTerms(agent)).toBe(false);
    expect(await code(acceptCommissionTerms(agent, ctx))).toBe("FORBIDDEN");
  });

  it("blocks submitting listings until the rates are accepted", async () => {
    const org = await makeOrg("Unaccepted Realty");
    const solo = await (await makeAgent(org.id, "Unaccepted Agent", "broker_admin", { accept: false })).actor();
    const ref = await readyRentListing(solo);
    expect(await code(transitionListing(solo, ref, "submit", {}, ctx))).toBe("VALIDATION_ERROR");
    await acceptCommissionTerms(solo, ctx);
    expect((await acceptanceFor(org.id)).accepted).toBe(true);
    await transitionListing(solo, ref, "submit", {}, ctx);
  });

  it("gives a partner their own rate, which they must accept again, and keeps the history", async () => {
    const ref = brokerage.referenceId;
    expect(await code(setPartnerRate(agent, ref, { service: "rent", percent: "15", reason: "Launch partner discount" }, ctx))).toBe("FORBIDDEN");
    await setPartnerRate(admin, ref, { service: "rent", percent: "15", reason: "Launch partner discount" }, ctx);
    const rates = await ratesFor(brokerage.id);
    expect([rates.rent.percent, rates.rent.custom, rates.sale.percent, rates.sale.custom]).toEqual([15, true, 20, false]);
    expect((await acceptanceFor(brokerage.id)).outdated).toBe(true);
    const told = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${brokerAdmin.userId} AND type = 'commission_rates_changed'`);
    expect(told.n).toBe(1);
    await acceptCommissionTerms(brokerAdmin, ctx);
    expect((await acceptanceFor(brokerage.id)).accepted).toBe(true);
  });

  it("never rewrites a rate: the history only grows", async () => {
    await expect(db.execute(sql`UPDATE finance.commission_rates SET percent = 1`)).rejects.toThrow();
  });
});

describe("charges", () => {
  it("charges a rental the agent closed, at the partner's rate that day", async () => {
    const ref = await liveRental(agent, 40_000);
    expect(await code(transitionListing(agent, ref, "mark_closed", { close: { outcome: "closed_deal", dealValue: "40000" } }, ctx))).toBe("VALIDATION_ERROR"); // brokerage missing
    await transitionListing(agent, ref, "mark_closed", { close: { outcome: "closed_deal", dealValue: "38000", brokerage: "38000" } }, ctx);
    const e = await one<{ amount: string; gst_amount: string; total: string; rate_percent: string; basis: string; status: string }>(sql`
      SELECT e.amount, e.gst_amount, e.total, e.rate_percent, e.basis, e.status FROM finance.commission_entries e JOIN marketplace.listings l ON l.id = e.listing_id WHERE l.reference_id = ${ref}`);
    // 15% (their own rate) of ₹38,000 brokerage = ₹5,700, plus 18% GST.
    expect([Number(e.rate_percent), e.basis, Number(e.amount), Number(e.gst_amount), Number(e.total), e.status]).toEqual([15, "brokerage", 5_700, 1_026, 6_726, "due"]);
  });

  it("records no charge when someone else closed it, and shows it to the team", async () => {
    const ref = await liveRental(agent);
    await transitionListing(agent, ref, "mark_closed", { close: { outcome: "closed_elsewhere" }, reason: "Owner let it to a relative" }, ctx);
    const n = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM finance.commission_entries e JOIN marketplace.listings l ON l.id = e.listing_id WHERE l.reference_id = ${ref}`);
    expect(n.n).toBe(0);
    const flagged = (await closedWithoutCommission(admin)).find((c) => c.listingReferenceId === ref);
    expect(flagged?.reason).toBe("Someone else closed it: Owner let it to a relative");
  });

  it("charges a stay once, when the guest checks in", async () => {
    const host = await (await makeHost("Commission Host", { verified: true })).actor();
    const stay = await readyStay(host, { price: 5_000, cleaningFee: 1_000, instantBook: true, minNights: 1 });
    await transitionListing(host, stay, "submit", {}, ctx);
    await transitionListing(moderator, stay, "approve", { reason: "Checked the details and photos." }, ctx);
    const guest = await makeUser("Commission Guest");
    const { referenceId } = await createBooking({ userId: guest.id, email: guest.email }, stay, { checkIn: day(0), checkOut: day(2), adults: "2", children: "0", name: "Commission Guest", phone: "98765 22222", agree: "on" }, ctx);
    // Before check-in, the host sees an estimate at today's rate.
    const before = await bookingCommission(host, referenceId);
    expect(before?.state).toBe("upcoming");
    await transitionBooking(host, referenceId, "check_in", null, ctx);
    const after = await bookingCommission(host, referenceId);
    expect(after?.state === "charged" && [after.status, after.total]).toEqual(["due", before?.state === "upcoming" ? before.total : -1]);
    const e = await one<{ deal_value: string; amount: string; service: string }>(sql`
      SELECT e.deal_value, e.amount, e.service FROM finance.commission_entries e JOIN stays.bookings b ON b.id = e.booking_id WHERE b.reference_id = ${referenceId}`);
    const total = await one<{ total: string }>(sql`SELECT total FROM stays.bookings WHERE reference_id = ${referenceId}`);
    expect([e.service, Number(e.deal_value), Number(e.amount)]).toEqual(["stay", Number(total.total), Number(total.total) * 0.1]);
    // However its status moves next, the booking is charged once.
    await transitionBooking(host, referenceId, "complete", null, ctx);
    const n = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM finance.commission_entries e JOIN stays.bookings b ON b.id = e.booking_id WHERE b.reference_id = ${referenceId}`);
    expect(n.n).toBe(1);
  });
});

describe("the ledger", () => {
  it("shows each side its own charges: the agent theirs, the broker admin the brokerage's, the team everything", async () => {
    const other = await (await makeAgent(brokerage.id, "Other Agent")).actor();
    const mine = await listLedger(agent, { status: "all" }, 1);
    expect(mine.rows.length).toBeGreaterThan(0);
    expect((await listLedger(other, { status: "all" }, 1)).rows).toHaveLength(0);
    expect((await listLedger(brokerAdmin, { status: "all" }, 1)).total).toBe(mine.total);
    expect((await listLedger(admin, { status: "all" }, 1)).total).toBeGreaterThan(mine.total);
  });

  it("records a payment with its reference, or a waiver with a reason, once", async () => {
    const [charge] = (await listLedger(admin, { ...due, q: brokerage.referenceId }, 1)).rows;
    expect(await code(updateEntryStatus(agent, charge.referenceId, { status: "paid", paymentReference: "UTR123456" }, ctx))).toBe("FORBIDDEN");
    expect(await code(updateEntryStatus(admin, charge.referenceId, { status: "paid" }, ctx))).toBe("VALIDATION_ERROR");
    await updateEntryStatus(admin, charge.referenceId, { status: "paid", paymentReference: "UTR123456" }, ctx);
    expect(await code(updateEntryStatus(admin, charge.referenceId, { status: "waived", note: "Changed our minds about it" }, ctx))).toBe("CONFLICT");
    const paid = (await listLedger(agent, { status: "paid" }, 1)).rows.find((r) => r.referenceId === charge.referenceId);
    expect(paid?.paymentReference).toBe("UTR123456");
  });

  it("adds credits and charges by hand, with GST, and never lets an amount change", async () => {
    const { referenceId } = await addAdjustment(admin, { organization: brokerage.referenceId, service: "rent", amount: "-1000", description: "Goodwill credit for a late payout" }, ctx);
    const e = await one<{ amount: string; gst_amount: string; total: string }>(sql`SELECT amount, gst_amount, total FROM finance.commission_entries WHERE reference_id = ${referenceId}`);
    expect([Number(e.amount), Number(e.gst_amount), Number(e.total)]).toEqual([-1000, -180, -1180]);
    await expect(db.execute(sql`UPDATE finance.commission_entries SET amount = 1 WHERE reference_id = ${referenceId}`)).rejects.toThrow();
  });
});

describe("on a listing's page", () => {
  it("shows the rate, an estimate from the listing's own brokerage terms, and the charges on it", async () => {
    const ref = await readyRentListing(agent, { rent: 50_000 });
    await updatePricing(agent, ref, { price: "50000", brokerageType: "half_month" });
    const before = (await listingCommission(agent, await getListingForActor(agent, ref)))!;
    // Their own rate of 15% on half a month's rent (₹25,000), plus GST.
    expect([before.rate.percent, before.estimate?.amount, before.estimate?.total, before.charges]).toEqual([15, 3_750, 4_425, []]);

    await transitionListing(agent, ref, "submit", {}, ctx);
    await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
    await transitionListing(agent, ref, "mark_closed", { close: { outcome: "closed_deal", dealValue: "50000", brokerage: "25000" } }, ctx);
    const after = (await listingCommission(agent, await getListingForActor(agent, ref)))!;
    expect([after.charges.length, after.totals.due]).toEqual([1, 4_425]);
    // The properties list agrees: charged and due on it, at the partner's own rate.
    const listed = (await commissionForListings(agent, [(await getListingForActor(agent, ref)).id])).values().next().value!;
    expect([listed.charged, listed.due, listed.rate.percent, listed.rate.custom]).toEqual([4_425, 4_425, 15, true]);
    // The team sees the same charges from the admin side.
    expect((await listingCommission(admin, await getListingForActor(admin, ref)))!.charges).toHaveLength(1);
  });
});

describe("the admin dashboard", () => {
  it("sums what's owed, lists who owes most (never a credit), and stays with the team", async () => {
    const org = await makeOrg("Owing Realty");
    await addAdjustment(admin, { organization: org.referenceId, service: "pg", amount: "2000", description: "PG move-ins for October" }, ctx);
    const credit = await makeOrg("Credit Realty");
    await addAdjustment(admin, { organization: credit.referenceId, service: "rent", amount: "-500", description: "Credit for a disputed charge" }, ctx);
    const o = await commissionOverview(admin);
    expect(o.owing.find((x) => x.referenceId === org.referenceId)?.due).toBe(2360);
    expect(o.owing.some((x) => x.referenceId === credit.referenceId)).toBe(false);
    expect(o.totals.chargedThisMonth).toBeGreaterThan(0);
    expect(o.closedWithoutCommission).toBeGreaterThan(0);
    expect(await code(commissionOverview(agent))).toBe("FORBIDDEN");
  });
});

// Last, as a new default asks partners on it to accept again.
describe("platform defaults", () => {
  it("keeps defaults to the SuperAdmin, and Home Stay to a share of bookings", async () => {
    const sa = await (await makeSuperadmin()).actor();
    expect(await code(setDefaultRate(admin, { service: "pg", basis: "deal_value", percent: "12", reason: "New PG pricing for 2027" }, ctx))).toBe("FORBIDDEN");
    expect(await code(setDefaultRate(sa, { service: "stay", basis: "brokerage", percent: "10", reason: "Trying a brokerage basis" }, ctx))).toBe("VALIDATION_ERROR");
    await setDefaultRate(sa, { service: "pg", basis: "deal_value", percent: "12", reason: "New PG pricing for 2027" }, ctx);
    expect((await ratesFor(null)).pg.percent).toBe(12);
  });

  it("asks partners who offer that service to accept again, and no one else", async () => {
    const host = await makeHost("Stay-only Host");
    const before = (await acceptanceFor(host.org.id)).accepted;
    const sa = await (await makeSuperadmin()).actor();
    await setDefaultRate(sa, { service: "pg", basis: "deal_value", percent: "11", reason: "Adjusting the PG rate again" }, ctx);
    expect([before, (await acceptanceFor(host.org.id)).accepted]).toEqual([true, true]);
    expect((await acceptanceFor(brokerage.id)).outdated).toBe(true);
  });
});

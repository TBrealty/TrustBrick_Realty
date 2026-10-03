import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseFilters } from "@/lib/listings/filters";
import { getListing, searchListings } from "@/lib/listings/queries";
import { acceptCommissionTerms } from "@/lib/services/commission";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createDraft } from "@/lib/services/listings/onboarding";
import { cancelTrip, createBooking, getBookingForActor, getTrip, listTrips, quoteStay, transitionBooking, unavailableDates } from "@/lib/services/stays/bookings";
import { blockDates, calendarMonth, setSpecialRate } from "@/lib/services/stays/calendar";
import { applyAsHost, approveHost, suspendHost, reinstateHost } from "@/lib/services/stays/hosts";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { actorFor, ctx, locality, makeAdmin, makeAgent, makeHost, makeOrg, makeSuperadmin, makeUser, one, person, statusOf } from "./support/factory";
import { readyStay } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const day = (offset: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
/** The next date at least `min` days away that falls on the given ISO weekday (1 = Monday). */
const nextWeekday = (isoDow: number, min = 7) => {
  for (let i = min; i < min + 7; i++) {
    const d = day(i);
    if ((new Date(`${d}T00:00:00Z`).getUTCDay() || 7) === isoDow) return d;
  }
  throw new Error("unreachable");
};

let host: Actor;
let otherHost: Actor;
let moderator: Actor;
let ops: Actor;
let guest: Awaited<ReturnType<typeof makeUser>>;
let guest2: Awaited<ReturnType<typeof makeUser>>;
let stay: string;

const guestOf = (u: { id: string; email: string }) => ({ userId: u.id, email: u.email });
const booking = (checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) => ({
  checkIn,
  checkOut,
  adults: "2",
  children: "0",
  name: "Test Guest",
  phone: "98765 11111",
  agree: "on",
  ...extra,
});

async function publish(ref: string) {
  await transitionListing(host, ref, "submit", {}, ctx);
  await transitionListing(moderator, ref, "approve", { reason: "Checked the details and photos." }, ctx);
}

beforeAll(async () => {
  host = await (await makeHost("Stay Host", { verified: true })).actor();
  otherHost = await (await makeHost("Other Host")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  guest = await makeUser("Stay Guest");
  guest2 = await makeUser("Second Guest");
  stay = await readyStay(host, { title: "Test villa in Calangute", price: 5000, weekendPrice: 7000, cleaningFee: 800, minNights: 2, maxNights: 14, maxGuests: 4 });
  await publish(stay);
});

describe("hosts", () => {
  it("a host lists homestays only, in their own scope", async () => {
    expect(host.roles).toEqual(["host"]);
    expect(can(host, "bookings.manage")).toBe(true);
    const loc = await locality("anjuna");
    expect(await code(createDraft(host, { purpose: "rent", propertyType: "apartment", localityId: loc, line1: "Not allowed" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(createDraft(host, { purpose: "stay", propertyType: "apartment", localityId: loc, line1: "Allowed" }, ctx))).toBe("OK");
  });

  it("applying, approval and suspension", async () => {
    const applicant = await makeUser("Would-be Host");
    const city = await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'north_goa'`);
    expect(await code(applyAsHost(person(applicant), { phone: "9876512345", cityId: city.id, relationship: "owner" }, ctx))).toBe("VALIDATION_ERROR");
    const { referenceId } = await applyAsHost(person(applicant), { phone: "98765 12345", cityId: city.id, relationship: "owner", languages: "English, Konkani", agree: "on" }, ctx);
    expect(referenceId).toMatch(/^HST-/);
    expect(await code(applyAsHost(person(applicant), { phone: "9876512345", cityId: city.id, relationship: "owner", agree: "on" }, ctx))).toBe("CONFLICT");

    const sa = await (await makeSuperadmin()).actor();
    expect(await code(approveHost(sa, referenceId, { verify: true }, ctx))).toBe("FORBIDDEN");
    await approveHost(ops, referenceId, { verify: true }, ctx);
    const actor = await actorFor(applicant.id);
    expect(actor.roles).toEqual(["host"]);
    expect(actor.host?.referenceId).toBe(referenceId);

    // Suspension pauses their live stays and removes the workspace; reinstating restores both.
    const own = await readyStay(actor, { title: "Suspension test stay" });
    // A new host accepts Trustbrick's commission before their first stay can be submitted.
    expect(await code(transitionListing(actor, own, "submit", {}, ctx))).toBe("VALIDATION_ERROR");
    await acceptCommissionTerms(actor, ctx);
    await transitionListing(actor, own, "submit", {}, ctx);
    await transitionListing(moderator, own, "approve", { reason: "Checked the details and photos." }, ctx);
    const { paused } = await suspendHost(ops, referenceId, "Guests reported the listing doesn't exist.", ctx);
    expect(paused).toBe(1);
    expect(await statusOf(own)).toBe("paused");
    await expect(actorFor(applicant.id)).rejects.toThrow();
    await reinstateHost(ops, referenceId, ctx);
    expect(await statusOf(own)).toBe("published");
  });
});

describe("finding and pricing a stay", () => {
  it("appears on /stays and filters by dates and guests", async () => {
    const all = await searchListings("stay", parseFilters("stay", { q: "Test villa in Calangute" }));
    const item = all.items.find((i) => i.referenceId === stay);
    expect(item).toMatchObject({ transactionType: "stay", price: 5000 });
    expect(item?.stay).toMatchObject({ spaceType: "entire_home", maxGuests: 4 });
    const tooMany = await searchListings("stay", parseFilters("stay", { q: "Test villa in Calangute", guests: "5" }));
    expect(tooMany.items.some((i) => i.referenceId === stay)).toBe(false);
    // Stays never show up among homes for rent.
    const rent = await searchListings("rent", parseFilters("rent", { q: "Test villa in Calangute" }));
    expect(rent.items).toHaveLength(0);
  });

  it("prices night by night: weekday, weekend, special rates and the cleaning fee", async () => {
    const friday = nextWeekday(5, 20);
    const sunday = day(Math.round((Date.parse(friday) - Date.parse(day(0))) / 86_400_000) + 2);
    const q = await quoteStay(stay, { checkIn: day(Math.round((Date.parse(friday) - Date.parse(day(0))) / 86_400_000) - 1), checkOut: sunday, adults: 2 });
    // Thursday (weekday), Friday and Saturday (weekend).
    expect(q.ok && q.nightly.map((n) => n.price)).toEqual([5000, 7000, 7000]);
    expect(q.ok && q.total).toBe(5000 + 7000 + 7000 + 800);

    await setSpecialRate(host, stay, { from: friday, to: friday, price: "9000", note: "Festival" }, ctx);
    const q2 = await quoteStay(stay, { checkIn: friday, checkOut: sunday, adults: 2 });
    expect(q2.ok && q2.nightly.map((n) => n.price)).toEqual([9000, 7000]);
  });

  it("refuses what the host doesn't allow", async () => {
    expect(await quoteStay(stay, { checkIn: day(40), checkOut: day(41), adults: 2 })).toMatchObject({ ok: false, message: expect.stringContaining("shortest stay") });
    expect(await quoteStay(stay, { checkIn: day(40), checkOut: day(60), adults: 2 })).toMatchObject({ ok: false, message: expect.stringContaining("longest stay") });
    expect(await quoteStay(stay, { checkIn: day(40), checkOut: day(43), adults: 3, children: 2 })).toMatchObject({ ok: false, field: "adults" });
    expect(await quoteStay(stay, { checkIn: day(40), checkOut: day(43), adults: 2, pets: "on" })).toMatchObject({ ok: false, field: "pets" });
    expect(await quoteStay(stay, { checkIn: day(-2), checkOut: day(1), adults: 2 })).toMatchObject({ ok: false, field: "checkIn" });
  });

  it("keeps the exact address off the public page", async () => {
    const detail = await getListing(stay);
    expect(detail?.stay?.host?.name).toBe("Stay");
    expect(JSON.stringify(detail)).not.toContain("House 7, Beach Road");
  });
});

describe("booking requests", () => {
  it("request → accept: confirmed, address revealed, overlapping requests declined, dates held", async () => {
    const a = await createBooking(guestOf(guest), stay, booking(day(30), day(33), { message: "Coming for a wedding." }), ctx);
    const b = await createBooking(guestOf(guest2), stay, booking(day(31), day(34)), ctx);
    expect(a.status).toBe("requested");
    expect(a.referenceId).toMatch(/^BKG-/);

    const pending = await getTrip(guest.id, a.referenceId);
    expect(pending.address).toBeNull();
    expect(pending.hostPhone).toBeNull();
    const asHost = await getBookingForActor(host, a.referenceId);
    expect(asHost.guestContact).toBeNull();
    expect(asHost.actions).toEqual(expect.arrayContaining(["accept", "decline"]));

    const result = await transitionBooking(host, a.referenceId, "accept", null, ctx);
    expect(result.autoDeclined).toBe(1);
    expect((await getTrip(guest2.id, b.referenceId)).status).toBe("declined");
    const confirmed = await getTrip(guest.id, a.referenceId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.address?.line1).toBe("House 7, Beach Road");
    expect(confirmed.hostPhone).toBe("+919888877777");
    expect((await getBookingForActor(host, a.referenceId)).guestContact?.phone).toBe("9876511111");

    expect(await unavailableDates(stay)).toEqual(expect.arrayContaining([{ from: day(30), to: day(33) }]));
    expect(await code(createBooking(guestOf(guest2), stay, booking(day(32), day(35)), ctx))).toBe("VALIDATION_ERROR");
    // Back-to-back is fine: check-out day is free for the next check-in.
    expect(await code(createBooking(guestOf(guest2), stay, booking(day(33), day(35)), ctx))).toBe("OK");
  });

  it("the database refuses overlapping confirmed bookings even if the service is bypassed", async () => {
    const ref = await one<{ id: string; property_id: string; organization_id: string }>(sql`SELECT id, property_id, organization_id FROM marketplace.listings WHERE reference_id = ${stay}`);
    const insert = () =>
      db.execute(sql`
        INSERT INTO stays.bookings (id, listing_id, property_id, organization_id, host_user_id, guest_user_id, dates, nights, nightly_breakdown, subtotal, total, status,
                                    guest_name, guest_phone, cancellation_policy, check_in_time, check_out_time)
        VALUES (gen_random_uuid(), ${ref.id}, ${ref.property_id}, ${ref.organization_id}, ${host.userId}, ${guest2.id}, daterange(${day(30)}::date, ${day(32)}::date), 2,
                '[]'::jsonb, 1, 1, 'confirmed', 'X', '9999999999', 'moderate', '14:00', '11:00')`);
    await expect(insert()).rejects.toThrow();
  });

  it("instant book confirms straight away; blocked dates can't be booked", async () => {
    const instant = await readyStay(host, { title: "Instant test flat", instantBook: true });
    await publish(instant);
    const b = await createBooking(guestOf(guest), instant, booking(day(10), day(12)), ctx);
    expect(b.status).toBe("confirmed");
    await blockDates(host, instant, { from: day(20), to: day(22), reason: "Family visiting" }, ctx);
    expect(await code(createBooking(guestOf(guest2), instant, booking(day(21), day(23)), ctx))).toBe("VALIDATION_ERROR");
    expect(await code(blockDates(host, instant, { from: day(11), to: day(11) }, ctx))).toBe("CONFLICT");
    const month = await calendarMonth(host, instant, day(20).slice(0, 7));
    expect(month.days.find((d) => d.date === day(21))?.blocked).not.toBeNull();
  });

  it("requests expire after 24 hours unanswered", async () => {
    const r = await createBooking(guestOf(guest2), stay, booking(day(60), day(62)), ctx);
    await db.execute(sql`UPDATE stays.bookings SET expires_at = now() - interval '1 minute' WHERE reference_id = ${r.referenceId}`);
    expect((await getTrip(guest2.id, r.referenceId)).status).toBe("expired");
    expect(await code(transitionBooking(host, r.referenceId, "accept", null, ctx))).toBe("CONFLICT");
  });

  it("guests cancel their own; hosts must give a reason; admins can cancel anything", async () => {
    const r = await createBooking(guestOf(guest), stay, booking(day(70), day(73)), ctx);
    expect(await code(cancelTrip(person(guest2), r.referenceId, null, ctx))).toBe("NOT_FOUND");
    await transitionBooking(host, r.referenceId, "accept", null, ctx);
    expect(await code(transitionBooking(host, r.referenceId, "host_cancel", "short", ctx))).toBe("VALIDATION_ERROR");
    expect(await code(transitionBooking(host, r.referenceId, "check_in", null, ctx))).toBe("CONFLICT");
    const trip = await getTrip(guest.id, r.referenceId);
    expect(trip.canCancel).toBe(true);
    await cancelTrip(person(guest), r.referenceId, "Plans changed.", ctx);
    expect((await getTrip(guest.id, r.referenceId)).status).toBe("cancelled");

    const r2 = await createBooking(guestOf(guest), stay, booking(day(80), day(82)), ctx);
    const sa = await (await makeSuperadmin()).actor();
    expect(await code(transitionBooking(sa, r2.referenceId, "admin_cancel", "Safety concern reported by a neighbour.", ctx))).toBe("FORBIDDEN");
    await transitionBooking(ops, r2.referenceId, "admin_cancel", "Safety concern reported by a neighbour.", ctx);
    expect((await getTrip(guest.id, r2.referenceId)).cancelledBy).toBe("admin");
    // The booking history can't be rewritten.
    await expect(db.execute(sql`UPDATE stays.booking_events SET note = 'x'`)).rejects.toThrow();
  });

  it("hosts only see their own bookings; guests only their own trips", async () => {
    const trips = await listTrips(guest.id);
    const [first] = trips;
    expect(await code(getBookingForActor(otherHost, first.referenceId))).toBe("NOT_FOUND");
    expect(await code(transitionBooking(otherHost, first.referenceId, "decline", null, ctx))).toBe("NOT_FOUND");
    expect(await code(getTrip(guest2.id, first.referenceId))).toBe("NOT_FOUND");
    const agent = await (await makeAgent((await makeOrg("Unrelated Realty")).id)).actor();
    expect(await code(getBookingForActor(agent, first.referenceId))).toBe("NOT_FOUND");
    expect((await getBookingForActor(ops, first.referenceId)).referenceId).toBe(first.referenceId);
  });

  it("hosts can't book their own stay, and unconfirmed accounts can't book", async () => {
    const hostUser = await one<{ id: string; email: string }>(sql`SELECT id, email FROM identity.users WHERE id = ${host.userId}`);
    expect(await code(createBooking({ userId: hostUser.id, email: hostUser.email }, stay, booking(day(100), day(102)), ctx))).toBe("FORBIDDEN");
    const unverified = await makeUser("Unverified Guest", { verified: false });
    expect(await code(createBooking(guestOf(unverified), stay, booking(day(100), day(102)), ctx))).toBe("FORBIDDEN");
  });
});

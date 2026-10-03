import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { bookingScope, listingScope } from "@/lib/authz/scope";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { bookingMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { formatDay, formatPrice } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { BOOKING_ACTIONS, type BookingAction, type BookingActionDef, bookingActionsFor, dateRuleMet, todayInIndia } from "@/lib/stays/booking-lifecycle";
import { BOOKING_STATUS_LABELS, CANCELLATION_LABELS, REQUEST_HOURS, nightsLabel } from "@/lib/stays/labels";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/vocab";
import { type AuditEvent, type PersonActor, type RequestContext, audit } from "../audit";
import { chargeBooking } from "../commission";
import { type NotificationType, notify } from "../notifications";
import { type Page, pageParams } from "../pagination";

/**
 * Homestay bookings (docs/stays/README.md §4). Guests pay the host at the property, so a
 * booking is an agreement about dates and price, not a payment. The price is computed here,
 * night by night, and stored on the booking; nothing the browser sends is trusted for it.
 *
 * No double bookings: the service locks the listing's terms row while it checks blocked
 * dates and existing bookings, and the database's exclusion constraint rejects any overlap
 * that slips past (two requests accepted at the same instant, for example).
 */

type Row = Record<string, unknown>;
const HOLDING = sql`('confirmed', 'checked_in', 'completed')`;
const MAX_ADVANCE_DAYS = 365;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const money = (v: number) => formatPrice(v, { compact: false });
const url = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();
const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── The stay being booked ────────────────────────────────────────────────────

type Stay = {
  listingId: string;
  referenceId: string;
  title: string;
  status: string;
  isSample: boolean;
  propertyId: string;
  organizationId: string;
  hostUserId: string | null;
  hostName: string | null;
  hostEmail: string | null;
  price: number;
  weekendPrice: number | null;
  cleaningFee: number;
  minNights: number;
  maxNights: number;
  maxGuests: number;
  instantBook: boolean;
  petsAllowed: boolean;
  cancellationPolicy: "flexible" | "moderate" | "strict";
  checkInTime: string;
  checkOutTime: string;
  locality: string;
};

async function loadStay(tx: DbOrTx, referenceId: string, lock = false): Promise<Stay | null> {
  if (!isReferenceId(referenceId, "LST")) return null;
  const { rows } = await tx.execute(sql`
    SELECT l.id, l.reference_id, l.title, l.status, l.is_sample, l.property_id, l.organization_id, l.price,
           st.weekend_price, st.cleaning_fee, st.min_nights, st.max_nights, st.max_guests, st.instant_book, st.pets_allowed,
           st.cancellation_policy, to_char(st.check_in_time, 'HH24:MI') AS check_in_time, to_char(st.check_out_time, 'HH24:MI') AS check_out_time,
           la.agent_user_id AS host_user_id, hu.name AS host_name, hu.email AS host_email, loc.name AS locality
      FROM marketplace.listings l
      JOIN stays.stay_terms st ON st.listing_id = l.id
      JOIN real_estate.properties p ON p.id = l.property_id
      JOIN geography.addresses a ON a.id = p.address_id
      JOIN geography.places loc ON loc.id = a.place_id
      LEFT JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
      LEFT JOIN identity.users hu ON hu.id = la.agent_user_id
     WHERE l.reference_id = ${referenceId} AND l.transaction_type = 'stay' AND l.deleted_at IS NULL
     ${lock ? sql`FOR UPDATE OF st` : sql``}`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    listingId: String(r.id),
    referenceId: String(r.reference_id),
    title: String(r.title),
    status: String(r.status),
    isSample: Boolean(r.is_sample),
    propertyId: String(r.property_id),
    organizationId: String(r.organization_id),
    hostUserId: (r.host_user_id as string) ?? null,
    hostName: (r.host_name as string) ?? null,
    hostEmail: (r.host_email as string) ?? null,
    price: Number(r.price),
    weekendPrice: r.weekend_price === null ? null : Number(r.weekend_price),
    cleaningFee: r.cleaning_fee === null ? 0 : Number(r.cleaning_fee),
    minNights: Number(r.min_nights),
    maxNights: Number(r.max_nights),
    maxGuests: Number(r.max_guests),
    instantBook: Boolean(r.instant_book),
    petsAllowed: Boolean(r.pets_allowed),
    cancellationPolicy: r.cancellation_policy as Stay["cancellationPolicy"],
    checkInTime: String(r.check_in_time),
    checkOutTime: String(r.check_out_time),
    locality: String(r.locality),
  };
}

/** Requests the host didn't answer in time become `expired`. Derived on read and write, so no scheduler is needed. */
export async function expireStaleRequests(tx: DbOrTx, where: SQL = sql`TRUE`) {
  await tx.execute(sql`
    WITH expired AS (
      UPDATE stays.bookings b SET status = 'expired', status_reason = 'The host didn''t respond in time.', updated_at = now()
       WHERE b.status = 'requested' AND b.expires_at <= now() AND ${where}
      RETURNING b.id)
    INSERT INTO stays.booking_events (id, booking_id, from_status, to_status, action, actor_role)
    SELECT gen_random_uuid(), id, 'requested', 'expired', 'expire', 'system' FROM expired`);
}

// ── Quote: dates, guests and the price, night by night ───────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const stayRequestSchema = z.object({
  checkIn: z.string().regex(ISO_DATE, "Choose a check-in date"),
  checkOut: z.string().regex(ISO_DATE, "Choose a check-out date"),
  adults: z.coerce.number({ message: "Enter the number of adults" }).int().min(1, "At least one adult").max(30),
  children: z.preprocess((v) => (v === "" || v === undefined || v === null ? 0 : v), z.coerce.number().int().min(0).max(30)),
  pets: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});
export type StayRequest = z.infer<typeof stayRequestSchema>;

export type Quote =
  | {
      ok: true;
      checkIn: string;
      checkOut: string;
      nights: number;
      nightly: { date: string; price: number }[];
      subtotal: number;
      cleaningFee: number;
      total: number;
      instantBook: boolean;
    }
  | { ok: false; message: string; field?: string };

async function unavailable(tx: DbOrTx, listingId: string, checkIn: string, checkOut: string, exceptBookingId?: string) {
  const { rows } = await tx.execute(sql`
    SELECT
      EXISTS (SELECT 1 FROM stays.bookings b WHERE b.listing_id = ${listingId} AND b.status IN ${HOLDING}
                 AND b.dates && daterange(${checkIn}::date, ${checkOut}::date) ${exceptBookingId ? sql`AND b.id <> ${exceptBookingId}` : sql``}) AS booked,
      EXISTS (SELECT 1 FROM stays.stay_blocks k WHERE k.listing_id = ${listingId} AND k.dates && daterange(${checkIn}::date, ${checkOut}::date)) AS blocked`);
  const r = rows[0] as Row;
  return Boolean(r.booked) || Boolean(r.blocked);
}

async function priceNights(tx: DbOrTx, stay: Stay, checkIn: string, checkOut: string) {
  // Friday and Saturday nights (ISO days 5 and 6) use the weekend price; a special rate beats both.
  const { rows } = await tx.execute(sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
           coalesce(r.nightly_price,
                    CASE WHEN extract(isodow FROM d) IN (5, 6) AND ${stay.weekendPrice}::numeric IS NOT NULL THEN ${stay.weekendPrice}::numeric
                         ELSE ${stay.price}::numeric END) AS price
      FROM generate_series(${checkIn}::date, ${checkOut}::date - 1, interval '1 day') d
      LEFT JOIN stays.stay_rates r ON r.listing_id = ${stay.listingId} AND r.dates @> d::date
     ORDER BY d`);
  return (rows as Row[]).map((r) => ({ date: String(r.date), price: Number(r.price) }));
}

async function computeQuote(tx: DbOrTx, stay: Stay, input: StayRequest, options: { exceptBookingId?: string } = {}): Promise<Quote> {
  const today = todayInIndia();
  if (stay.status !== "published") return { ok: false, message: "This stay isn't taking bookings right now." };
  if (!stay.hostUserId) return { ok: false, message: "This is a sample stay without a host, so it can't be booked." };
  if (input.checkIn < today) return { ok: false, message: "Check-in can't be in the past.", field: "checkIn" };
  if (daysBetween(today, input.checkIn) > MAX_ADVANCE_DAYS) return { ok: false, message: "You can book up to a year ahead.", field: "checkIn" };
  const nights = daysBetween(input.checkIn, input.checkOut);
  if (nights < 1) return { ok: false, message: "Check-out must be after check-in.", field: "checkOut" };
  if (nights < stay.minNights) return { ok: false, message: `The shortest stay here is ${nightsLabel(stay.minNights)}.`, field: "checkOut" };
  if (nights > stay.maxNights) return { ok: false, message: `The longest stay here is ${nightsLabel(stay.maxNights)}.`, field: "checkOut" };
  if (input.adults + input.children > stay.maxGuests) return { ok: false, message: `This stay has room for up to ${stay.maxGuests} guests.`, field: "adults" };
  if (input.pets && !stay.petsAllowed) return { ok: false, message: "Pets aren't allowed at this stay.", field: "pets" };
  if (await unavailable(tx, stay.listingId, input.checkIn, input.checkOut, options.exceptBookingId)) {
    return { ok: false, message: "Some of those dates aren't available. Choose different dates.", field: "checkIn" };
  }
  const nightly = await priceNights(tx, stay, input.checkIn, input.checkOut);
  const subtotal = nightly.reduce((sum, n) => sum + n.price, 0);
  return { ok: true, checkIn: input.checkIn, checkOut: input.checkOut, nights, nightly, subtotal, cleaningFee: stay.cleaningFee, total: subtotal + stay.cleaningFee, instantBook: stay.instantBook };
}

/** The live price for the booking panel. Public: anyone may ask what a stay costs. */
export async function quoteStay(referenceId: string, raw: unknown): Promise<Quote> {
  const parsed = stayRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    return { ok: false, message: first?.message ?? "Check the dates and guests.", field: String(first?.path[0] ?? "") };
  }
  const stay = await loadStay(db, normalizeReferenceId(referenceId));
  if (!stay) return { ok: false, message: "This stay no longer exists." };
  return computeQuote(db, stay, parsed.data);
}

/** Held and blocked dates for the next months, for the booking panel's calendar. No guest details. */
export async function unavailableDates(referenceId: string, fromDate = todayInIndia(), days = 240): Promise<{ from: string; to: string }[]> {
  if (!isReferenceId(referenceId, "LST")) return [];
  const to = addDays(fromDate, days);
  const { rows } = await db.execute(sql`
    SELECT to_char(lower(r), 'YYYY-MM-DD') AS from_date, to_char(upper(r), 'YYYY-MM-DD') AS to_date FROM (
      SELECT b.dates * daterange(${fromDate}::date, ${to}::date) AS r FROM stays.bookings b
        JOIN marketplace.listings l ON l.id = b.listing_id
       WHERE l.reference_id = ${referenceId} AND b.status IN ${HOLDING} AND b.dates && daterange(${fromDate}::date, ${to}::date)
      UNION ALL
      SELECT k.dates * daterange(${fromDate}::date, ${to}::date) FROM stays.stay_blocks k
        JOIN marketplace.listings l ON l.id = k.listing_id
       WHERE l.reference_id = ${referenceId} AND k.dates && daterange(${fromDate}::date, ${to}::date)
    ) x WHERE NOT isempty(r) ORDER BY 1`);
  return (rows as Row[]).map((r) => ({ from: String(r.from_date), to: String(r.to_date) }));
}

// ── Guests: request or book ──────────────────────────────────────────────────

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits"));

export const bookingSchema = stayRequestSchema.extend({
  name: z.string().trim().min(2, "Enter your name").max(120),
  phone,
  message: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000, "Keep the message under 1,000 characters").optional()),
  agree: z.preprocess((v) => v === "on" || v === true, z.literal(true, { message: "Agree to the house rules and cancellation policy" })),
});

type Guest = { userId: string; email: string };

async function writeEvent(tx: Tx, bookingId: string, from: BookingStatus | null, to: BookingStatus, action: string, actorUserId: string | null, actorRole: string, note?: string | null) {
  await tx.execute(sql`
    INSERT INTO stays.booking_events (id, booking_id, from_status, to_status, action, note, actor_user_id, actor_role)
    VALUES (gen_random_uuid(), ${bookingId}, ${from}, ${to}, ${action}, ${note ?? null}, ${actorUserId}, ${actorRole})`);
}

const isOverlap = (e: unknown) => /bookings_no_overlap/.test(String((e as { cause?: { constraint?: string } })?.cause?.constraint ?? (e as Error)?.message ?? ""));

export async function createBooking(guest: Guest, referenceId: string, raw: unknown, ctx: RequestContext): Promise<{ referenceId: string; status: BookingStatus }> {
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const input = parsed.data;
  const limited = await limit([{ key: `booking:user:${guest.userId}`, rule: RULES.bookingByUser }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");

  const result = await db
    .transaction(async (tx) => {
      const account = await tx.execute(sql`SELECT reference_id, email_verified, status FROM identity.users WHERE id = ${guest.userId}`);
      const a = account.rows[0] as Row | undefined;
      if (!a || a.status !== "active") throw new AppError("FORBIDDEN");
      if (!a.email_verified) throw new AppError("FORBIDDEN", "Confirm your email before booking.");

      const stay = await loadStay(tx, normalizeReferenceId(referenceId), true);
      if (!stay) throw notFound("This stay no longer exists.");
      if (stay.hostUserId === guest.userId) throw new AppError("FORBIDDEN", "You can't book your own stay.");
      await expireStaleRequests(tx, sql`b.listing_id = ${stay.listingId}`);

      const quote = await computeQuote(tx, stay, input);
      if (!quote.ok) throw invalid(quote.message, quote.field ? { [quote.field]: quote.message } : undefined);

      const duplicate = await tx.execute(sql`
        SELECT reference_id FROM stays.bookings
         WHERE listing_id = ${stay.listingId} AND guest_user_id = ${guest.userId} AND status IN ('requested', 'confirmed')
           AND dates && daterange(${quote.checkIn}::date, ${quote.checkOut}::date) LIMIT 1`);
      if (duplicate.rows[0]) throw conflict(`You already have a booking for these dates (${(duplicate.rows[0] as Row).reference_id}).`);

      const status: BookingStatus = stay.instantBook ? "confirmed" : "requested";
      // A request expires after 24 hours, or at the end of the check-in day if that comes sooner.
      const expires =
        status === "requested" ? sql`least(now() + ${`${REQUEST_HOURS} hours`}::interval, ((${quote.checkIn}::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))` : sql`NULL`;
      const created = await tx.execute(sql`
        INSERT INTO stays.bookings (id, listing_id, property_id, organization_id, host_user_id, guest_user_id, dates, nights, adults, children, pets,
                                    nightly_breakdown, subtotal, cleaning_fee, total, status, guest_name, guest_phone, guest_message,
                                    cancellation_policy, check_in_time, check_out_time, expires_at, confirmed_at)
        VALUES (gen_random_uuid(), ${stay.listingId}, ${stay.propertyId}, ${stay.organizationId}, ${stay.hostUserId}, ${guest.userId},
                daterange(${quote.checkIn}::date, ${quote.checkOut}::date), ${quote.nights}, ${input.adults}, ${input.children}, ${input.pets},
                ${JSON.stringify(quote.nightly)}::jsonb, ${quote.subtotal}, ${quote.cleaningFee}, ${quote.total}, ${status}, ${input.name}, ${input.phone},
                ${input.message ?? null}, ${stay.cancellationPolicy}, ${stay.checkInTime}::time, ${stay.checkOutTime}::time, ${expires},
                ${status === "confirmed" ? sql`now()` : sql`NULL`})
        RETURNING id, reference_id`);
      const booking = created.rows[0] as Row;
      const bookingId = String(booking.id);
      const bookingRef = String(booking.reference_id);
      await writeEvent(tx, bookingId, null, status, status === "confirmed" ? "instant_book" : "request", guest.userId, "guest", input.message);

      const person: PersonActor = { kind: "person", userId: guest.userId, referenceId: String(a.reference_id), role: "guest" };
      await audit(
        tx,
        person,
        {
          event: "BOOKING_CREATED",
          target: { type: "booking", id: bookingId, referenceId: bookingRef },
          organizationId: stay.organizationId,
          metadata: { listing: stay.referenceId, status, checkIn: quote.checkIn, checkOut: quote.checkOut, total: quote.total },
        },
        ctx,
      );
      await notify(tx, [stay.hostUserId], {
        type: status === "confirmed" ? "booking_confirmed" : "booking_requested",
        title:
          status === "confirmed"
            ? `New booking ${bookingRef}: ${formatDay(quote.checkIn)} – ${formatDay(quote.checkOut)}`
            : `${input.name} asks to book ${formatDay(quote.checkIn)} – ${formatDay(quote.checkOut)}`,
        body: stay.title,
        link: `/bookings/${bookingRef}`,
      });
      return { referenceId: bookingRef, status, stay, quote };
    })
    .catch((error) => {
      if (isOverlap(error)) throw conflict("Someone just booked some of those dates. Choose different dates.");
      throw error;
    });

  const { stay, quote } = result;
  const dates = `${formatDay(quote.checkIn)} – ${formatDay(quote.checkOut)} (${nightsLabel(quote.nights)})`;
  void Promise.all([
    stay.hostEmail
      ? sendEmail(
          bookingMessage(stay.hostEmail, {
            subject: result.status === "confirmed" ? `New booking for ${stay.title}` : `Booking request for ${stay.title}`,
            heading: result.status === "confirmed" ? "You have a new booking" : "A guest wants to stay",
            lines: [
              `${input.name} ${result.status === "confirmed" ? "booked" : "asks to book"} ${stay.title} for ${dates}, ${input.adults + input.children} guest(s).`,
              `Total ${money(quote.total)}, paid to you at the property.`,
              result.status === "requested" ? `Accept or decline within ${REQUEST_HOURS} hours, or the request expires.` : "The dates are now blocked on your calendar.",
            ],
            action: { label: "Open the booking", url: url(`/bookings/${result.referenceId}`) },
          }),
        )
      : null,
    sendEmail(
      bookingMessage(guest.email, {
        subject: result.status === "confirmed" ? `Booked: ${stay.title}` : `Request sent: ${stay.title}`,
        heading: result.status === "confirmed" ? "Your stay is confirmed" : "Your request is with the host",
        lines: [
          `${stay.title}, ${stay.locality}. ${dates}.`,
          `Total ${money(quote.total)}, paid to the host at the property.`,
          result.status === "confirmed"
            ? "The exact address and the host's phone number are on your trip page."
            : `The host has ${REQUEST_HOURS} hours to respond. We'll email you either way.`,
        ],
        action: { label: "View your trip", url: url(`/account/trips/${result.referenceId}`) },
      }),
    ),
  ]).catch((e) => log.error("email.booking_failed", { error: String(e) }));

  return { referenceId: result.referenceId, status: result.status };
}

// ── Reading bookings ─────────────────────────────────────────────────────────

const BOOKING_COLUMNS = sql`
  b.id, b.reference_id, b.status, b.nights, b.adults, b.children, b.pets, b.subtotal, b.cleaning_fee, b.total, b.guest_name, b.guest_phone,
  b.guest_message, b.status_reason, b.cancelled_by, b.cancellation_policy, b.expires_at, b.created_at, b.confirmed_at, b.nightly_breakdown,
  to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out,
  to_char(b.check_in_time, 'HH24:MI') AS check_in_time, to_char(b.check_out_time, 'HH24:MI') AS check_out_time,
  l.reference_id AS listing_ref, l.title AS listing_title, loc.name AS locality, city.name AS city,
  gu.reference_id AS guest_ref, gu.email AS guest_email, hu.name AS host_name, hu.reference_id AS host_user_ref,
  (SELECT hp.reference_id FROM stays.host_profiles hp WHERE hp.user_id = b.host_user_id) AS host_ref`;

const BOOKING_JOINS = sql`
  JOIN marketplace.listings l ON l.id = b.listing_id
  JOIN real_estate.properties p ON p.id = b.property_id
  JOIN geography.addresses a ON a.id = p.address_id
  JOIN geography.places loc ON loc.id = a.place_id
  LEFT JOIN geography.places city ON city.id = loc.parent_id
  JOIN identity.users gu ON gu.id = b.guest_user_id
  JOIN identity.users hu ON hu.id = b.host_user_id`;

export type BookingRow = {
  id: string;
  referenceId: string;
  status: BookingStatus;
  statusLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  pets: boolean;
  total: number;
  listing: { referenceId: string; title: string; locality: string; city: string | null };
  guestName: string;
  hostName: string;
  expiresAt: string | null;
  createdAt: string;
};

const toRow = (r: Row): BookingRow => ({
  id: String(r.id),
  referenceId: String(r.reference_id),
  status: r.status as BookingStatus,
  statusLabel: BOOKING_STATUS_LABELS[r.status as BookingStatus],
  checkIn: String(r.check_in),
  checkOut: String(r.check_out),
  nights: Number(r.nights),
  adults: Number(r.adults),
  children: Number(r.children),
  pets: Boolean(r.pets),
  total: Number(r.total),
  listing: { referenceId: String(r.listing_ref), title: String(r.listing_title), locality: String(r.locality), city: (r.city as string) ?? null },
  guestName: String(r.guest_name),
  hostName: String(r.host_name),
  expiresAt: iso(r.expires_at),
  createdAt: iso(r.created_at)!,
});

export const BOOKING_GROUPS = {
  upcoming: sql`b.status IN ('confirmed', 'checked_in') AND upper(b.dates) >= (now() AT TIME ZONE 'Asia/Kolkata')::date`,
  requests: sql`b.status = 'requested'`,
  past: sql`b.status IN ('completed', 'no_show') OR (b.status IN ('confirmed', 'checked_in') AND upper(b.dates) < (now() AT TIME ZONE 'Asia/Kolkata')::date)`,
  cancelled: sql`b.status IN ('cancelled', 'declined', 'expired')`,
  all: sql`TRUE`,
} as const;
export type BookingGroup = keyof typeof BOOKING_GROUPS;

export const bookingFilters = z.object({
  group: z.enum(Object.keys(BOOKING_GROUPS) as [BookingGroup, ...BookingGroup[]]).catch("upcoming"),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(BOOKING_STATUSES).optional().catch(undefined),
});
export type BookingFilters = z.infer<typeof bookingFilters>;

export async function listBookingsForActor(actor: Actor, filters: BookingFilters, page: number): Promise<Page<BookingRow> & { counts: Record<BookingGroup, number> }> {
  const scope = bookingScope(actor, "bookings.view");
  await expireStaleRequests(db, scope);
  const where: SQL[] = [scope, BOOKING_GROUPS[filters.group]];
  if (filters.status) where.push(sql`b.status = ${filters.status}`);
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${likeEscape(filters.q)}%`;
    where.push(sql`(b.reference_id = ${ref} OR l.reference_id = ${ref} OR b.guest_name ILIKE ${like} OR l.title ILIKE ${like} OR gu.email ILIKE ${like})`);
  }
  const { limit: take, offset } = pageParams(page);
  const whereSql = sql.join(where, sql` AND `);
  const order = filters.group === "past" || filters.group === "cancelled" ? sql`lower(b.dates) DESC` : filters.group === "requests" ? sql`b.created_at ASC` : sql`lower(b.dates) ASC`;
  const [rows, count, groups] = await Promise.all([
    db.execute(sql`SELECT ${BOOKING_COLUMNS} FROM stays.bookings b ${BOOKING_JOINS} WHERE ${whereSql} ORDER BY ${order}, b.id LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM stays.bookings b ${BOOKING_JOINS} WHERE ${whereSql}`),
    db.execute(sql`
      SELECT ${sql.join(
        (Object.keys(BOOKING_GROUPS) as BookingGroup[]).map((g) => sql`count(*) FILTER (WHERE ${BOOKING_GROUPS[g]})::int AS ${sql.raw(g)}`),
        sql`, `,
      )} FROM stays.bookings b WHERE ${scope}`),
  ]);
  const g = groups.rows[0] as Row;
  return {
    rows: (rows.rows as Row[]).map(toRow),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: take,
    counts: Object.fromEntries(Object.keys(BOOKING_GROUPS).map((k) => [k, Number(g[k])])) as Record<BookingGroup, number>,
  };
}

export type BookingDetail = BookingRow & {
  subtotal: number;
  cleaningFee: number;
  nightly: { date: string; price: number }[];
  guestMessage: string | null;
  statusReason: string | null;
  cancelledBy: string | null;
  cancellationPolicy: { code: string; label: string; rule: string };
  checkInTime: string;
  checkOutTime: string;
  /** Contact details are shown once the dates are agreed. */
  guestContact: { phone: string; email: string } | null;
  guestReferenceId: string;
  hostReferenceId: string | null;
  events: { from: string | null; to: string; label: string; action: string; note: string | null; actorRole: string; at: string }[];
  actions: BookingAction[];
};

async function detailFor(r: Row, side: "host" | "admin" | "guest" | null): Promise<BookingDetail> {
  const events = await db.execute(sql`SELECT from_status, to_status, action, note, actor_role, created_at FROM stays.booking_events WHERE booking_id = ${String(r.id)} ORDER BY created_at, id`);
  const base = toRow(r);
  const agreed = ["confirmed", "checked_in", "completed", "no_show"].includes(base.status);
  const policy = r.cancellation_policy as keyof typeof CANCELLATION_LABELS;
  return {
    ...base,
    subtotal: Number(r.subtotal),
    cleaningFee: Number(r.cleaning_fee),
    nightly: (r.nightly_breakdown as { date: string; price: number }[]) ?? [],
    guestMessage: (r.guest_message as string) ?? null,
    statusReason: (r.status_reason as string) ?? null,
    cancelledBy: (r.cancelled_by as string) ?? null,
    cancellationPolicy: { code: policy, label: CANCELLATION_LABELS[policy].label, rule: CANCELLATION_LABELS[policy].rule },
    checkInTime: String(r.check_in_time),
    checkOutTime: String(r.check_out_time),
    guestContact: agreed ? { phone: String(r.guest_phone), email: String(r.guest_email) } : null,
    guestReferenceId: String(r.guest_ref),
    hostReferenceId: (r.host_ref as string) ?? null,
    events: (events.rows as Row[]).map((e) => ({
      from: (e.from_status as string) ?? null,
      to: String(e.to_status),
      label: BOOKING_STATUS_LABELS[e.to_status as BookingStatus] ?? String(e.to_status),
      action: String(e.action),
      note: (e.note as string) ?? null,
      actorRole: String(e.actor_role),
      at: iso(e.created_at)!,
    })),
    actions: side ? bookingActionsFor(side, base.status, base.checkIn, todayInIndia()) : [],
  };
}

export async function getBookingForActor(actor: Actor, referenceId: string): Promise<BookingDetail> {
  if (!isReferenceId(referenceId, "BKG")) throw notFound();
  const scope = bookingScope(actor, "bookings.view");
  await expireStaleRequests(db, sql`b.reference_id = ${referenceId}`);
  const { rows } = await db.execute(sql`SELECT ${BOOKING_COLUMNS} FROM stays.bookings b ${BOOKING_JOINS} WHERE b.reference_id = ${referenceId} AND ${scope}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const detail = await detailFor(r, null);
  const actions: BookingAction[] = [];
  if (can(actor, "bookings.manage") && actor.workspace === "professional") {
    const manageable = await db.execute(sql`SELECT 1 FROM stays.bookings b WHERE b.reference_id = ${referenceId} AND ${bookingScope(actor, "bookings.manage")}`);
    if (manageable.rows[0]) actions.push(...bookingActionsFor("host", detail.status, detail.checkIn, todayInIndia()));
  }
  if (can(actor, "bookings.manage", "platform")) actions.push(...bookingActionsFor("admin", detail.status, detail.checkIn, todayInIndia()));
  return { ...detail, actions };
}

// ── Host and admin decisions ─────────────────────────────────────────────────

const AUDIT_FOR: Partial<Record<BookingAction, AuditEvent>> = {
  accept: "BOOKING_ACCEPTED",
  decline: "BOOKING_DECLINED",
  host_cancel: "BOOKING_CANCELLED",
  admin_cancel: "BOOKING_CANCELLED",
  guest_cancel: "BOOKING_CANCELLED",
  check_in: "BOOKING_CHECKED_IN",
  complete: "BOOKING_COMPLETED",
  no_show: "BOOKING_NO_SHOW",
};

type Locked = { id: string; referenceId: string; status: BookingStatus; listingId: string; checkIn: string; checkOut: string; hostUserId: string; guestUserId: string; organizationId: string; guestEmail: string; guestName: string; hostEmail: string; title: string; expired: boolean };

async function lockBooking(tx: Tx, where: SQL): Promise<Locked | null> {
  const { rows } = await tx.execute(sql`
    SELECT b.id, b.reference_id, b.status, b.listing_id, b.host_user_id, b.guest_user_id, b.organization_id, b.guest_name,
           to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out,
           (b.status = 'requested' AND b.expires_at <= now()) AS expired, gu.email AS guest_email, hu.email AS host_email, l.title
      FROM stays.bookings b
      JOIN marketplace.listings l ON l.id = b.listing_id
      JOIN identity.users gu ON gu.id = b.guest_user_id
      JOIN identity.users hu ON hu.id = b.host_user_id
     WHERE ${where} FOR UPDATE OF b`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    referenceId: String(r.reference_id),
    status: r.status as BookingStatus,
    listingId: String(r.listing_id),
    checkIn: String(r.check_in),
    checkOut: String(r.check_out),
    hostUserId: String(r.host_user_id),
    guestUserId: String(r.guest_user_id),
    organizationId: String(r.organization_id),
    guestEmail: String(r.guest_email),
    guestName: String(r.guest_name),
    hostEmail: String(r.host_email),
    title: String(r.title),
    expired: Boolean(r.expired),
  };
}

type Who = { userId: string; referenceId: string; role: string; audit: Actor | PersonActor };

async function applyTransition(tx: Tx, who: Who, booking: Locked, action: BookingAction, reason: string | null, ctx: RequestContext) {
  const def: BookingActionDef = BOOKING_ACTIONS[action];
  if (booking.expired) {
    await expireStaleRequests(tx, sql`b.id = ${booking.id}`);
    throw conflict("This request expired before it was answered.");
  }
  if (!(def.from as readonly BookingStatus[]).includes(booking.status)) {
    throw conflict(`This booking is ${BOOKING_STATUS_LABELS[booking.status].toLowerCase()}, so "${def.label}" isn't available. Refresh to see its current state.`);
  }
  if (!dateRuleMet(action, booking.checkIn, todayInIndia())) {
    throw conflict(def.when === "before_check_in" ? "This can't be done once the stay has started." : `This can be done from the check-in date, ${formatDay(booking.checkIn)}.`);
  }
  if (def.reason === "required" && (!reason || reason.length < 10)) {
    throw invalid("Give a reason of at least 10 characters. The other side sees it.", { reason: "Give a reason of at least 10 characters" });
  }

  if (action === "accept") {
    // Serialise with other decisions and new bookings on this listing, then re-check the host's own blocks.
    await tx.execute(sql`SELECT 1 FROM stays.stay_terms WHERE listing_id = ${booking.listingId} FOR UPDATE`);
    if (await unavailable(tx, booking.listingId, booking.checkIn, booking.checkOut, booking.id)) {
      throw conflict("Those dates are no longer free: they're blocked on your calendar or already booked.");
    }
  }

  const to = def.to as BookingStatus;
  const stamp =
    to === "confirmed" ? sql`, confirmed_at = now()` : to === "cancelled" ? sql`, cancelled_at = now()` : to === "checked_in" ? sql`, checked_in_at = now()` : to === "completed" ? sql`, completed_at = now()` : sql``;
  const cancelledBy = to === "cancelled" ? (def.side === "admin" ? "admin" : def.side) : null;
  await tx.execute(sql`
    UPDATE stays.bookings SET status = ${to}, status_reason = ${reason}, cancelled_by = ${cancelledBy}, updated_at = now() ${stamp}
     WHERE id = ${booking.id} AND status = ${booking.status}`);
  await writeEvent(tx, booking.id, booking.status, to, action, who.userId, who.role, reason);
  // The stay has begun, so Trustbrick's commission on it is due (once, whatever happens next).
  if (to === "checked_in") await chargeBooking(tx, who.audit, booking.id, ctx);

  // Accepting one request frees the host from the others for the same dates.
  let autoDeclined: Row[] = [];
  if (action === "accept") {
    const declined = await tx.execute(sql`
      UPDATE stays.bookings b SET status = 'declined', status_reason = 'Those dates were booked by another guest.', updated_at = now()
       WHERE b.listing_id = ${booking.listingId} AND b.status = 'requested' AND b.id <> ${booking.id}
         AND b.dates && daterange(${booking.checkIn}::date, ${booking.checkOut}::date)
      RETURNING b.id, b.reference_id, b.guest_user_id`);
    autoDeclined = declined.rows as Row[];
    for (const d of autoDeclined) await writeEvent(tx, String(d.id), "requested", "declined", "auto_decline", null, "system", "Those dates were booked by another guest.");
  }

  const event = AUDIT_FOR[action];
  if (event) {
    await audit(
      tx,
      who.audit,
      {
        event,
        target: { type: "booking", id: booking.id, referenceId: booking.referenceId },
        organizationId: booking.organizationId,
        before: { status: booking.status },
        after: { status: to },
        metadata: { ...(reason ? { reason } : {}), ...(autoDeclined.length ? { autoDeclined: autoDeclined.map((d) => d.reference_id) } : {}) },
      },
      ctx,
    );
  }

  const dates = `${formatDay(booking.checkIn)} – ${formatDay(booking.checkOut)}`;
  const toGuest = who.userId !== booking.guestUserId;
  const toHost = who.userId !== booking.hostUserId;
  const note: { type: NotificationType; title: string } | null =
    to === "confirmed"
      ? { type: "booking_confirmed", title: `Your stay is confirmed: ${booking.title}, ${dates}` }
      : to === "declined"
        ? { type: "booking_updated", title: `The host couldn't accept your request for ${dates}` }
        : to === "cancelled"
          ? { type: "booking_updated", title: `Booking ${booking.referenceId} (${dates}) was cancelled` }
          : null;
  if (note) {
    const recipients = [toGuest ? booking.guestUserId : null, toHost ? booking.hostUserId : null];
    await notify(tx, recipients, { type: note.type, title: note.title, body: reason ?? booking.title, link: toGuest ? `/account/trips/${booking.referenceId}` : `/bookings/${booking.referenceId}` });
  }
  for (const d of autoDeclined) {
    await notify(tx, [String(d.guest_user_id)], { type: "booking_updated", title: `Your request for ${dates} wasn't accepted`, body: "Those dates were booked by another guest.", link: `/account/trips/${d.reference_id}` });
  }

  const emails: Promise<void>[] = [];
  if (note && toGuest) {
    emails.push(
      sendEmail(
        bookingMessage(booking.guestEmail, {
          subject: `${BOOKING_STATUS_LABELS[to]}: ${booking.title}`,
          heading: note.title,
          lines: [reason ? `Note: ${reason}` : `${booking.title}, ${dates}.`, to === "confirmed" ? "The exact address and the host's phone number are now on your trip page." : "Nothing was charged: payment is only ever made at the property."],
          action: { label: "View your trip", url: url(`/account/trips/${booking.referenceId}`) },
        }),
      ),
    );
  }
  if (note && toHost && to === "cancelled") {
    emails.push(
      sendEmail(
        bookingMessage(booking.hostEmail, {
          subject: `Cancelled: ${booking.title}, ${dates}`,
          heading: `Booking ${booking.referenceId} was cancelled`,
          lines: [`${booking.guestName}'s stay for ${dates} is cancelled${reason ? `: ${reason}` : "."}`, "The dates are free again on your calendar."],
          action: { label: "Open the booking", url: url(`/bookings/${booking.referenceId}`) },
        }),
      ),
    );
  }
  if (emails.length) void Promise.all(emails).catch((e) => log.error("email.booking_failed", { error: String(e) }));
  return { status: to, autoDeclined: autoDeclined.length };
}

/** A host (within their scope) or an admin acts on a booking. */
export async function transitionBooking(actor: Actor, referenceId: string, action: BookingAction, rawReason: unknown, ctx: RequestContext) {
  const def: BookingActionDef = BOOKING_ACTIONS[action];
  if (def.side === "guest") throw new AppError("FORBIDDEN");
  if (def.side === "admin") assertCan(actor, "bookings.manage", "platform");
  if (!isReferenceId(referenceId, "BKG")) throw notFound();
  const reason = typeof rawReason === "string" && rawReason.trim() ? rawReason.trim().slice(0, 2000) : null;
  const scope = def.side === "admin" ? sql`TRUE` : bookingScope(actor, "bookings.manage");
  if (def.side === "host" && actor.workspace !== "professional") throw new AppError("FORBIDDEN", "Only the host can do this. Admins can cancel on Trustbrick's behalf.");
  return db
    .transaction(async (tx) => {
      const booking = await lockBooking(tx, sql`b.reference_id = ${referenceId} AND ${scope}`);
      if (!booking) throw notFound();
      return applyTransition(tx, { userId: actor.userId, referenceId: actor.userReferenceId, role: def.side === "admin" ? "admin" : "host", audit: actor }, booking, action, reason, ctx);
    })
    .catch((error) => {
      if (isOverlap(error)) throw conflict("Those dates were just booked by another guest.");
      throw error;
    });
}

// ── Guests' own trips ────────────────────────────────────────────────────────

export type TripDetail = BookingDetail & {
  /** Revealed once the booking is confirmed. */
  address: { line1: string | null; line2: string | null; landmark: string | null; unit: string | null; postalCode: string | null; latitude: number; longitude: number } | null;
  hostPhone: string | null;
  canCancel: boolean;
  freeCancellation: boolean;
};

export async function listTrips(userId: string): Promise<BookingRow[]> {
  await expireStaleRequests(db, sql`b.guest_user_id = ${userId}`);
  const { rows } = await db.execute(sql`
    SELECT ${BOOKING_COLUMNS} FROM stays.bookings b ${BOOKING_JOINS}
     WHERE b.guest_user_id = ${userId}
     ORDER BY (b.status IN ('requested', 'confirmed', 'checked_in') AND upper(b.dates) >= (now() AT TIME ZONE 'Asia/Kolkata')::date) DESC, lower(b.dates) DESC LIMIT 100`);
  return (rows as Row[]).map(toRow);
}

export async function getTrip(userId: string, referenceId: string): Promise<TripDetail> {
  if (!isReferenceId(referenceId, "BKG")) throw notFound();
  await expireStaleRequests(db, sql`b.reference_id = ${referenceId}`);
  const { rows } = await db.execute(sql`
    SELECT ${BOOKING_COLUMNS}, a.line1, a.line2, a.landmark, a.postal_code, p.unit_number,
           ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng,
           (SELECT hp.phone FROM stays.host_profiles hp WHERE hp.user_id = b.host_user_id) AS host_phone,
           (SELECT ap.phone FROM orgs.agent_profiles ap WHERE ap.user_id = b.host_user_id) AS agent_phone
      FROM stays.bookings b ${BOOKING_JOINS}
     WHERE b.reference_id = ${referenceId} AND b.guest_user_id = ${userId}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  const detail = await detailFor(r, "guest");
  const agreed = ["confirmed", "checked_in", "completed"].includes(detail.status);
  const today = todayInIndia();
  const hoursToCheckIn = (Date.parse(`${detail.checkIn}T00:00:00+05:30`) - Date.now()) / 3_600_000;
  const policy = CANCELLATION_LABELS[detail.cancellationPolicy.code as keyof typeof CANCELLATION_LABELS];
  return {
    ...detail,
    guestContact: null,
    address: agreed
      ? {
          line1: (r.line1 as string) ?? null,
          line2: (r.line2 as string) ?? null,
          landmark: (r.landmark as string) ?? null,
          unit: (r.unit_number as string) ?? null,
          postalCode: (r.postal_code as string) ?? null,
          latitude: Number(r.lat),
          longitude: Number(r.lng),
        }
      : null,
    hostPhone: agreed ? ((r.host_phone as string) ?? (r.agent_phone as string) ?? null) : null,
    canCancel: detail.actions.includes("guest_cancel") && today < detail.checkIn,
    freeCancellation: detail.status === "requested" || hoursToCheckIn >= policy.freeUntilHours,
  };
}

export async function cancelTrip(guest: PersonActor, referenceId: string, rawReason: unknown, ctx: RequestContext) {
  if (!isReferenceId(referenceId, "BKG")) throw notFound();
  const reason = typeof rawReason === "string" && rawReason.trim() ? rawReason.trim().slice(0, 1000) : null;
  return db.transaction(async (tx) => {
    const booking = await lockBooking(tx, sql`b.reference_id = ${referenceId} AND b.guest_user_id = ${guest.userId}`);
    if (!booking) throw notFound();
    return applyTransition(tx, { userId: guest.userId, referenceId: guest.referenceId, role: "guest", audit: guest }, booking, "guest_cancel", reason, ctx);
  });
}

// ── Numbers for dashboards ───────────────────────────────────────────────────

export type HostingStats = { requests: number; upcoming: number; arrivalsThisWeek: number; nightsBookedNext30: number; stays: number; bookedValueThisMonth: number };

export async function hostingStats(actor: Actor): Promise<HostingStats | null> {
  if (!can(actor, "bookings.view")) return null;
  const scope = bookingScope(actor, "bookings.view");
  await expireStaleRequests(db, scope);
  const { rows } = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE b.status = 'requested')::int AS requests,
      count(*) FILTER (WHERE b.status IN ('confirmed', 'checked_in') AND upper(b.dates) >= (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS upcoming,
      count(*) FILTER (WHERE b.status = 'confirmed' AND lower(b.dates) BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date AND (now() AT TIME ZONE 'Asia/Kolkata')::date + 7)::int AS arrivals,
      coalesce(sum(upper(b.dates * daterange((now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date + 30)) - lower(b.dates * daterange((now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date + 30)))
               FILTER (WHERE b.status IN ('confirmed', 'checked_in') AND b.dates && daterange((now() AT TIME ZONE 'Asia/Kolkata')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date + 30)), 0)::int AS nights30,
      coalesce(sum(b.total) FILTER (WHERE b.status IN ('confirmed', 'checked_in', 'completed')
                                  AND date_trunc('month', lower(b.dates)) = date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')::date)), 0)::numeric AS value_month
      FROM stays.bookings b WHERE ${scope}`);
  const staysCount = await db.execute(sql`
    SELECT count(*)::int AS n FROM marketplace.listings l
     WHERE l.transaction_type = 'stay' AND l.deleted_at IS NULL AND l.status = 'published' AND ${listingScope(actor, "listings.view")}`);
  const r = rows[0] as Row;
  const stays = Number((staysCount.rows[0] as Row).n);
  if (stays === 0 && Number(r.requests) === 0 && Number(r.upcoming) === 0) return null;
  return {
    requests: Number(r.requests),
    upcoming: Number(r.upcoming),
    arrivalsThisWeek: Number(r.arrivals),
    nightsBookedNext30: Number(r.nights30),
    stays,
    bookedValueThisMonth: Number(r.value_month),
  };
}

export type HostDashboard = {
  stats: HostingStats;
  requests: BookingRow[];
  arrivals: BookingRow[];
  stays: { referenceId: string; title: string; status: string; statusReason: string | null; price: number }[];
};

/** Everything a host's dashboard shows, in their scope. */
export async function hostDashboard(actor: Actor): Promise<HostDashboard> {
  const scope = bookingScope(actor, "bookings.view");
  const [stats, requests, arrivals, stays] = await Promise.all([
    hostingStats(actor),
    db.execute(sql`SELECT ${BOOKING_COLUMNS} FROM stays.bookings b ${BOOKING_JOINS} WHERE ${scope} AND b.status = 'requested' AND b.expires_at > now() ORDER BY b.expires_at LIMIT 8`),
    db.execute(sql`
      SELECT ${BOOKING_COLUMNS} FROM stays.bookings b ${BOOKING_JOINS}
       WHERE ${scope} AND b.status IN ('confirmed', 'checked_in') AND upper(b.dates) >= (now() AT TIME ZONE 'Asia/Kolkata')::date
       ORDER BY lower(b.dates) LIMIT 8`),
    db.execute(sql`
      SELECT l.reference_id, l.title, l.status, l.status_reason, l.price FROM marketplace.listings l
       WHERE l.transaction_type = 'stay' AND l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")}
       ORDER BY (l.status IN ('changes_requested', 'rejected')) DESC, l.updated_at DESC LIMIT 20`),
  ]);
  return {
    stats: stats ?? { requests: 0, upcoming: 0, arrivalsThisWeek: 0, nightsBookedNext30: 0, stays: 0, bookedValueThisMonth: 0 },
    requests: (requests.rows as Row[]).map(toRow),
    arrivals: (arrivals.rows as Row[]).map(toRow),
    stays: (stays.rows as Row[]).map((s) => ({ referenceId: String(s.reference_id), title: String(s.title), status: String(s.status), statusReason: (s.status_reason as string) ?? null, price: Number(s.price ?? 0) })),
  };
}

/** Platform-wide homestay numbers for the admin dashboard. */
export async function platformStaysStats(actor: Actor) {
  assertCan(actor, "bookings.view", "platform");
  const { rows } = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM marketplace.listings WHERE transaction_type = 'stay' AND status = 'published' AND deleted_at IS NULL)::int AS live_stays,
      (SELECT count(*) FROM stays.host_profiles WHERE status = 'active')::int AS hosts,
      (SELECT count(*) FROM stays.host_profiles WHERE status = 'pending')::int AS pending_hosts,
      (SELECT count(*) FROM stays.bookings WHERE status = 'requested' AND expires_at > now())::int AS requests,
      (SELECT count(*) FROM stays.bookings WHERE status IN ('confirmed', 'checked_in') AND upper(dates) >= (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS upcoming,
      (SELECT count(*) FROM stays.bookings WHERE created_at > now() - interval '30 days')::int AS bookings_30d`);
  const r = rows[0] as Row;
  return {
    liveStays: Number(r.live_stays),
    hosts: Number(r.hosts),
    pendingHosts: Number(r.pending_hosts),
    requests: Number(r.requests),
    upcoming: Number(r.upcoming),
    bookings30d: Number(r.bookings_30d),
  };
}

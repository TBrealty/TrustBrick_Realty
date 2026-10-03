import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { listingScope } from "@/lib/authz/scope";
import { db } from "@/lib/db";
import { AppError, conflict, invalid, notFound } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import type { BookingStatus } from "@/lib/vocab";
import { type RequestContext, audit } from "../audit";
import { findListingInScope } from "../listings/access";

/**
 * The host's calendar: blocked dates and special nightly prices, with bookings on top.
 * Hosts manage their own stays (listings.edit in scope); admins with listings.manage can
 * manage any. Blocking never cancels a booking: dates held by a booking can't be blocked.
 */

type Row = Record<string, unknown>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function stayInScope(actor: Actor, referenceId: string, forEdit: boolean) {
  const admin = can(actor, "listings.manage", "platform");
  if (forEdit && !admin && actor.workspace !== "professional") throw new AppError("FORBIDDEN");
  const listing = await findListingInScope(actor, referenceId, forEdit && !admin ? "listings.edit" : "listings.view");
  if (listing.transactionType !== "stay") throw notFound();
  return listing;
}

/** The stays this actor manages, for the calendar's picker. */
export async function myStays(actor: Actor): Promise<{ referenceId: string; title: string; status: string }[]> {
  assertCan(actor, "listings.view");
  const { rows } = await db.execute(sql`
    SELECT l.reference_id, l.title, l.status FROM marketplace.listings l
     WHERE l.transaction_type = 'stay' AND l.deleted_at IS NULL AND ${listingScope(actor, "listings.view")}
     ORDER BY (l.status = 'published') DESC, l.updated_at DESC LIMIT 200`);
  return (rows as Row[]).map((r) => ({ referenceId: String(r.reference_id), title: String(r.title), status: String(r.status) }));
}

export type CalendarDay = {
  date: string;
  price: number;
  special: boolean;
  blocked: { id: string; reason: string | null } | null;
  booking: { referenceId: string; status: BookingStatus; guestName: string; isStart: boolean } | null;
  requests: number;
  past: boolean;
};

export type CalendarMonth = {
  listing: { referenceId: string; title: string; status: string; price: number; weekendPrice: number | null };
  month: string;
  days: CalendarDay[];
  blocks: { id: string; from: string; to: string; reason: string | null }[];
  rates: { id: string; from: string; to: string; price: number; note: string | null }[];
  canEdit: boolean;
};

export async function calendarMonth(actor: Actor, referenceId: string, month: string): Promise<CalendarMonth> {
  const listing = await stayInScope(actor, referenceId, false);
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : todayInIndia().slice(0, 7);
  const first = `${m}-01`;
  const [terms, days, blocks, rates, canEdit] = await Promise.all([
    db.execute(sql`SELECT l.price, st.weekend_price FROM marketplace.listings l JOIN stays.stay_terms st ON st.listing_id = l.id WHERE l.id = ${listing.id}`),
    db.execute(sql`
      SELECT to_char(d, 'YYYY-MM-DD') AS date, extract(isodow FROM d)::int AS dow,
             r.nightly_price AS rate, k.id AS block_id, k.reason AS block_reason,
             b.reference_id AS booking_ref, b.status AS booking_status, b.guest_name, (lower(b.dates) = d::date) AS booking_start,
             (SELECT count(*) FROM stays.bookings q WHERE q.listing_id = ${listing.id} AND q.status = 'requested' AND q.expires_at > now() AND q.dates @> d::date)::int AS requests
        FROM generate_series(${first}::date, (${first}::date + interval '1 month' - interval '1 day')::date, interval '1 day') d
        LEFT JOIN stays.stay_rates r ON r.listing_id = ${listing.id} AND r.dates @> d::date
        LEFT JOIN stays.stay_blocks k ON k.listing_id = ${listing.id} AND k.dates @> d::date
        LEFT JOIN stays.bookings b ON b.listing_id = ${listing.id} AND b.status IN ('confirmed', 'checked_in', 'completed') AND b.dates @> d::date
       ORDER BY d`),
    db.execute(sql`
      SELECT id, to_char(lower(dates), 'YYYY-MM-DD') AS from_date, to_char(upper(dates) - 1, 'YYYY-MM-DD') AS to_date, reason
        FROM stays.stay_blocks WHERE listing_id = ${listing.id} AND upper(dates) > (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY lower(dates)`),
    db.execute(sql`
      SELECT id, to_char(lower(dates), 'YYYY-MM-DD') AS from_date, to_char(upper(dates) - 1, 'YYYY-MM-DD') AS to_date, nightly_price, note
        FROM stays.stay_rates WHERE listing_id = ${listing.id} AND upper(dates) > (now() AT TIME ZONE 'Asia/Kolkata')::date ORDER BY lower(dates)`),
    stayInScope(actor, referenceId, true).then(
      () => true,
      () => false,
    ),
  ]);
  const t = terms.rows[0] as Row;
  const base = Number(t.price);
  const weekend = t.weekend_price === null ? null : Number(t.weekend_price);
  const today = todayInIndia();
  return {
    listing: { referenceId: listing.referenceId, title: listing.title, status: listing.status, price: base, weekendPrice: weekend },
    month: m,
    days: (days.rows as Row[]).map((d) => ({
      date: String(d.date),
      price: d.rate !== null ? Number(d.rate) : weekend !== null && [5, 6].includes(Number(d.dow)) ? weekend : base,
      special: d.rate !== null,
      blocked: d.block_id ? { id: String(d.block_id), reason: (d.block_reason as string) ?? null } : null,
      booking: d.booking_ref ? { referenceId: String(d.booking_ref), status: d.booking_status as BookingStatus, guestName: String(d.guest_name), isStart: Boolean(d.booking_start) } : null,
      requests: Number(d.requests),
      past: String(d.date) < today,
    })),
    blocks: (blocks.rows as Row[]).map((b) => ({ id: String(b.id), from: String(b.from_date), to: String(b.to_date), reason: (b.reason as string) ?? null })),
    rates: (rates.rows as Row[]).map((r) => ({ id: String(r.id), from: String(r.from_date), to: String(r.to_date), price: Number(r.nightly_price), note: (r.note as string) ?? null })),
    canEdit,
  };
}

const rangeSchema = z
  .object({
    from: z.string().regex(ISO, "Choose the first date"),
    to: z.string().regex(ISO, "Choose the last date"),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "The last date can't be before the first" });

const blockSchema = rangeSchema.and(z.object({ reason: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(200).optional()) }));
const rateSchema = rangeSchema.and(
  z.object({
    price: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number({ message: "Enter the nightly price" }).min(300, "At least ₹300 a night").max(1_000_000, "At most ₹10 lakh a night")),
    note: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(80).optional()),
  }),
);

function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(r.error));
  return r.data;
}

/** Closes dates. `to` is the last closed night. Adjacent or overlapping blocks merge into one. */
export async function blockDates(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  const input = parse(blockSchema, raw);
  if (input.from < todayInIndia()) throw invalid("You can't block dates in the past.", { from: "Choose today or later" });
  const listing = await stayInScope(actor, referenceId, true);
  const end = nextDay(input.to);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM stays.stay_terms WHERE listing_id = ${listing.id} FOR UPDATE`);
    const held = await tx.execute(sql`
      SELECT reference_id FROM stays.bookings WHERE listing_id = ${listing.id} AND status IN ('confirmed', 'checked_in')
         AND dates && daterange(${input.from}::date, ${end}::date) LIMIT 3`);
    if (held.rows.length) {
      throw conflict(`Those dates include a booking (${(held.rows as Row[]).map((r) => r.reference_id).join(", ")}). Cancel it first if you really can't host it.`);
    }
    const merged = await tx.execute(sql`
      DELETE FROM stays.stay_blocks WHERE listing_id = ${listing.id}
         AND (dates && daterange(${input.from}::date, ${end}::date) OR dates -|- daterange(${input.from}::date, ${end}::date))
      RETURNING to_char(lower(dates), 'YYYY-MM-DD') AS lo, to_char(upper(dates), 'YYYY-MM-DD') AS hi`);
    const lows = [input.from, ...(merged.rows as Row[]).map((r) => String(r.lo))];
    const highs = [end, ...(merged.rows as Row[]).map((r) => String(r.hi))];
    await tx.execute(sql`
      INSERT INTO stays.stay_blocks (id, listing_id, dates, reason, created_by)
      VALUES (gen_random_uuid(), ${listing.id}, daterange(${lows.sort()[0]}::date, ${highs.sort().at(-1)}::date), ${input.reason ?? null}, ${actor.userId})`);
    await audit(tx, actor, { event: "STAY_CALENDAR_UPDATED", target: { type: "listing", id: listing.id, referenceId: listing.referenceId }, organizationId: listing.organizationId, metadata: { blocked: { from: input.from, to: input.to } } }, ctx);
  });
}

export async function unblockDates(actor: Actor, referenceId: string, blockId: string, ctx: RequestContext) {
  const listing = await stayInScope(actor, referenceId, true);
  if (!z.uuid().safeParse(blockId).success) throw notFound();
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`DELETE FROM stays.stay_blocks WHERE id = ${blockId} AND listing_id = ${listing.id} RETURNING to_char(lower(dates), 'YYYY-MM-DD') AS f, to_char(upper(dates) - 1, 'YYYY-MM-DD') AS t`);
    const r = rows[0] as Row | undefined;
    if (!r) throw notFound();
    await audit(tx, actor, { event: "STAY_CALENDAR_UPDATED", target: { type: "listing", id: listing.id, referenceId: listing.referenceId }, organizationId: listing.organizationId, metadata: { unblocked: { from: r.f, to: r.t } } }, ctx);
  });
}

/** A special nightly price for some dates. Doesn't change existing bookings, which keep the price they were made at. */
export async function setSpecialRate(actor: Actor, referenceId: string, raw: unknown, ctx: RequestContext) {
  const input = parse(rateSchema, raw);
  if (input.from < todayInIndia()) throw invalid("Choose today or a later date.", { from: "Choose today or later" });
  const listing = await stayInScope(actor, referenceId, true);
  const end = nextDay(input.to);
  await db.transaction(async (tx) => {
    const overlap = await tx.execute(sql`
      SELECT to_char(lower(dates), 'YYYY-MM-DD') AS f, to_char(upper(dates) - 1, 'YYYY-MM-DD') AS t FROM stays.stay_rates
       WHERE listing_id = ${listing.id} AND dates && daterange(${input.from}::date, ${end}::date) LIMIT 1`);
    const o = overlap.rows[0] as Row | undefined;
    if (o) throw conflict(`You already have a special price for ${formatDay(String(o.f))} – ${formatDay(String(o.t))}. Remove it first.`);
    await tx.execute(sql`
      INSERT INTO stays.stay_rates (id, listing_id, dates, nightly_price, note, created_by)
      VALUES (gen_random_uuid(), ${listing.id}, daterange(${input.from}::date, ${end}::date), ${input.price}, ${input.note ?? null}, ${actor.userId})`);
    await audit(tx, actor, { event: "STAY_CALENDAR_UPDATED", target: { type: "listing", id: listing.id, referenceId: listing.referenceId }, organizationId: listing.organizationId, metadata: { rate: { from: input.from, to: input.to, price: input.price } } }, ctx);
  });
}

export async function removeSpecialRate(actor: Actor, referenceId: string, rateId: string, ctx: RequestContext) {
  const listing = await stayInScope(actor, referenceId, true);
  if (!z.uuid().safeParse(rateId).success) throw notFound();
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`DELETE FROM stays.stay_rates WHERE id = ${rateId} AND listing_id = ${listing.id} RETURNING nightly_price`);
    if (!rows[0]) throw notFound();
    await audit(tx, actor, { event: "STAY_CALENDAR_UPDATED", target: { type: "listing", id: listing.id, referenceId: listing.referenceId }, organizationId: listing.organizationId, metadata: { rateRemoved: rateId } }, ctx);
  });
}

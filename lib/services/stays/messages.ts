import "server-only";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { assertCan, can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { bookingScope, conversationScope } from "@/lib/authz/scope";
import { type DbOrTx, type Tx, db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { bookingMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { AppError, invalid, notFound } from "@/lib/errors";
import { photoUrl } from "@/lib/listings/queries";
import { log } from "@/lib/log";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { BOOKING_STATUS_LABELS } from "@/lib/stays/labels";
import { type BookingStatus, MESSAGE_MAX_LENGTH, type MessageSenderRole } from "@/lib/vocab";
import { type PersonActor, type RequestContext, audit } from "../audit";
import { notify } from "../notifications";
import { type Page, pageParams } from "../pagination";
import { expireStaleRequests } from "./bookings";

/**
 * Guest ↔ host chat for homestays (docs/stays/README.md §Messages).
 *
 * One conversation per guest and listing, kept for good. The guest starts it, or the host once
 * that guest has booked; the host (or someone with the host's bookings in scope) replies.
 * Messages are append-only.
 * Every send locks the conversation row, so within a conversation `seq` order is commit order:
 * a client polling for "seq > the last one I have" can never skip a message.
 */

type Row = Record<string, unknown>;
export type Side = MessageSenderRole;

const PAGE_SIZE = 50;
const SNIPPET = 160;
const iso = (v: unknown) => new Date(v as string).toISOString();
const url = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();
const firstName = (name: unknown) => String(name ?? "").trim().split(/\s+/)[0] || "Someone";
const snippet = (body: string) => (body.length > SNIPPET ? `${body.slice(0, SNIPPET - 1).trimEnd()}…` : body);

export type ChatMessage = { seq: number; body: string; mine: boolean; senderName: string; createdAt: string };

export type ConversationView = {
  /** Null until the guest sends the first message. */
  referenceId: string | null;
  side: Side;
  listing: { referenceId: string; title: string; place: string; image: string | null };
  /** The other person: the host for a guest, the guest for a host. */
  counterpart: { name: string; fullName: string; verified: boolean; referenceId: string | null };
  bookings: { referenceId: string; checkIn: string; checkOut: string; status: BookingStatus; statusLabel: string }[];
  messages: ChatMessage[];
  hasEarlier: boolean;
  /** The last of my messages the other side has seen. */
  seenUpTo: number;
  canSend: boolean;
  closedReason: string | null;
};

export type ConversationSummary = {
  referenceId: string;
  listing: { referenceId: string; title: string; place: string; image: string | null };
  counterpartName: string;
  last: { body: string; mine: boolean; at: string } | null;
  unread: number;
};

// ── Input ─────────────────────────────────────────────────────────────────────

/** Plain text only: line endings normalised, control characters dropped, runs of blank lines collapsed. */
const bodySchema = z
  .string()
  .transform((v) =>
    v
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
  .pipe(z.string().min(1, "Write a message first.").max(MESSAGE_MAX_LENGTH, `Keep it under ${MESSAGE_MAX_LENGTH.toLocaleString("en-IN")} characters.`));

function parseBody(raw: unknown): string {
  const parsed = bodySchema.safeParse(typeof raw === "string" ? raw : "");
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Write a message first.";
    throw invalid(message, { body: message });
  }
  return parsed.data;
}

// ── Loading ───────────────────────────────────────────────────────────────────

const cover = sql`(SELECT ${photoUrl(1280)} FROM real_estate.media_links ml JOIN real_estate.media m ON m.id = ml.media_id
                    WHERE ml.property_id = p.id AND m.media_type = 'image' AND NOT m.is_private ORDER BY ml.sort_order LIMIT 1)`;

const PLACE_JOINS = sql`
  JOIN real_estate.properties p ON p.id = l.property_id
  JOIN geography.addresses a ON a.id = p.address_id
  JOIN geography.places loc ON loc.id = a.place_id
  LEFT JOIN geography.places city ON city.id = loc.parent_id`;

const CONVERSATION_SELECT = sql`
  SELECT c.id, c.reference_id, c.listing_id, c.organization_id, c.guest_user_id, c.host_user_id,
         c.guest_last_read_seq, c.host_last_read_seq,
         l.reference_id AS listing_ref, l.title, l.status AS listing_status, (l.deleted_at IS NOT NULL) AS listing_deleted,
         loc.name AS locality, city.name AS city, ${cover} AS image,
         gu.name AS guest_name, gu.email AS guest_email, gu.status AS guest_status, gu.reference_id AS guest_ref,
         hu.name AS host_name, hu.email AS host_email, hu.status AS host_status,
         hp.reference_id AS host_ref, coalesce(hp.verification_status = 'verified', false) AS host_verified
    FROM stays.conversations c
    JOIN marketplace.listings l ON l.id = c.listing_id
    ${PLACE_JOINS}
    JOIN identity.users gu ON gu.id = c.guest_user_id
    JOIN identity.users hu ON hu.id = c.host_user_id
    LEFT JOIN stays.host_profiles hp ON hp.user_id = c.host_user_id`;

const place = (r: Row) => [r.locality, r.city].filter(Boolean).join(", ");

/** Why a conversation can no longer take messages, or null if it can. */
function closedReason(r: Row, side: Side): string | null {
  if (r.listing_deleted || ["removed", "archived"].includes(String(r.listing_status))) return "This stay is no longer on Trustbrick, so the conversation is closed. Your messages are kept here.";
  if (side === "guest" && r.host_status !== "active") return "This host isn't available on Trustbrick right now, so you can't send messages.";
  if (side === "host" && r.guest_status !== "active") return "This guest's account isn't active, so you can't send messages.";
  return null;
}

async function loadMessages(tx: DbOrTx, conversationId: string, side: Side, where: SQL = sql`TRUE`, limitTo = PAGE_SIZE) {
  const { rows } = await tx.execute(sql`
    SELECT m.seq, m.body, m.sender_role, m.created_at, su.name AS sender_name
      FROM stays.messages m LEFT JOIN identity.users su ON su.id = m.sender_user_id
     WHERE m.conversation_id = ${conversationId} AND ${where}
     ORDER BY m.seq DESC LIMIT ${limitTo + 1}`);
  const list = rows as Row[];
  const hasMore = list.length > limitTo;
  const messages: ChatMessage[] = list
    .slice(0, limitTo)
    .reverse()
    .map((m) => ({
      seq: Number(m.seq),
      body: String(m.body),
      mine: m.sender_role === side,
      senderName: firstName(m.sender_name ?? (m.sender_role === "host" ? "Host" : "Guest")),
      createdAt: iso(m.created_at),
    }));
  return { messages, hasMore };
}

async function bookingsBetween(listingId: string, guestUserId: string) {
  await expireStaleRequests(db, sql`b.listing_id = ${listingId} AND b.guest_user_id = ${guestUserId}`);
  const { rows } = await db.execute(sql`
    SELECT b.reference_id, b.status, to_char(lower(b.dates), 'YYYY-MM-DD') AS check_in, to_char(upper(b.dates), 'YYYY-MM-DD') AS check_out
      FROM stays.bookings b
     WHERE b.listing_id = ${listingId} AND b.guest_user_id = ${guestUserId}
     ORDER BY lower(b.dates) DESC LIMIT 5`);
  return (rows as Row[]).map((b) => ({
    referenceId: String(b.reference_id),
    checkIn: String(b.check_in),
    checkOut: String(b.check_out),
    status: b.status as BookingStatus,
    statusLabel: BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? String(b.status),
  }));
}

/** Records that `side` has seen everything up to `seq` (never moves backwards). */
async function markRead(tx: DbOrTx, conversationId: string, side: Side, seq: number) {
  if (seq <= 0) return;
  const column = side === "guest" ? sql`guest_last_read_seq` : sql`host_last_read_seq`;
  await tx.execute(sql`UPDATE stays.conversations SET ${column} = ${seq} WHERE id = ${conversationId} AND ${column} < ${seq}`);
}

async function view(r: Row, side: Side): Promise<ConversationView> {
  const conversationId = String(r.id);
  const [{ messages, hasMore }, bookings] = await Promise.all([loadMessages(db, conversationId, side), bookingsBetween(String(r.listing_id), String(r.guest_user_id))]);
  const lastSeq = messages.at(-1)?.seq ?? 0;
  await markRead(db, conversationId, side, lastSeq);
  const reason = closedReason(r, side);
  return {
    referenceId: String(r.reference_id),
    side,
    listing: { referenceId: String(r.listing_ref), title: String(r.title), place: place(r), image: (r.image as string) ?? null },
    counterpart:
      side === "guest"
        ? { name: firstName(r.host_name), fullName: firstName(r.host_name), verified: Boolean(r.host_verified), referenceId: null }
        : { name: firstName(r.guest_name), fullName: String(r.guest_name), verified: false, referenceId: String(r.guest_ref) },
    bookings,
    messages,
    hasEarlier: hasMore,
    seenUpTo: Number(side === "guest" ? r.host_last_read_seq : r.guest_last_read_seq),
    canSend: reason === null,
    closedReason: reason,
  };
}

// ── Access ────────────────────────────────────────────────────────────────────

async function guestRow(tx: DbOrTx, userId: string, referenceId: string, lock = false): Promise<Row> {
  const ref = normalizeReferenceId(referenceId);
  if (!isReferenceId(ref, "MSG")) throw notFound();
  const { rows } = await tx.execute(sql`${CONVERSATION_SELECT} WHERE c.reference_id = ${ref} AND c.guest_user_id = ${userId} ${lock ? sql`FOR UPDATE OF c` : sql``}`);
  if (!rows[0]) throw notFound();
  return rows[0] as Row;
}

/** Hosts read and reply in their workspace. Admins review disputes separately (see the end of this file). */
async function hostRow(tx: DbOrTx, actor: Actor, referenceId: string, permission: "bookings.view" | "bookings.manage", lock = false): Promise<Row> {
  if (actor.workspace !== "professional") throw new AppError("FORBIDDEN");
  const scope = conversationScope(actor, permission);
  const ref = normalizeReferenceId(referenceId);
  if (!isReferenceId(ref, "MSG")) throw notFound();
  const { rows } = await tx.execute(sql`${CONVERSATION_SELECT} WHERE c.reference_id = ${ref} AND ${scope} ${lock ? sql`FOR UPDATE OF c` : sql``}`);
  if (!rows[0]) throw notFound();
  return rows[0] as Row;
}

export async function getGuestConversation(userId: string, referenceId: string): Promise<ConversationView> {
  return view(await guestRow(db, userId, referenceId), "guest");
}

const READ_ONLY = "You can read this conversation, but replying needs permission to manage bookings.";

/** Someone who can see a host's bookings but not manage them may read, not reply. */
function readOnlyUnlessManager<T extends { canSend: boolean; closedReason: string | null }>(actor: Actor, v: T): T {
  return can(actor, "bookings.manage") ? v : { ...v, canSend: false, closedReason: READ_ONLY };
}

export async function getHostConversation(actor: Actor, referenceId: string): Promise<ConversationView> {
  return readOnlyUnlessManager(actor, await view(await hostRow(db, actor, referenceId, "bookings.view"), "host"));
}

/**
 * Where "Message the host" leads: the guest's existing conversation about this stay, or an
 * empty one to write the first message in. Nothing is created until they send.
 */
export async function guestConversationForListing(userId: string, listingReferenceId: string): Promise<{ existing: string } | { draft: ConversationView }> {
  const ref = normalizeReferenceId(listingReferenceId);
  if (!isReferenceId(ref, "LST")) throw notFound();
  const found = await db.execute(sql`
    SELECT c.reference_id FROM stays.conversations c JOIN marketplace.listings l ON l.id = c.listing_id
     WHERE l.reference_id = ${ref} AND c.guest_user_id = ${userId}`);
  if (found.rows[0]) return { existing: String((found.rows[0] as Row).reference_id) };

  const stay = await stayForMessaging(db, ref);
  if (!stay) throw notFound();
  const reason = draftClosedReason(stay, userId);
  const bookings = stay.hostUserId ? await bookingsBetween(stay.listingId, userId) : [];
  return {
    draft: {
      referenceId: null,
      side: "guest",
      listing: { referenceId: stay.referenceId, title: stay.title, place: stay.place, image: stay.image },
      counterpart: { name: firstName(stay.hostName), fullName: firstName(stay.hostName), verified: stay.hostVerified, referenceId: null },
      bookings,
      messages: [],
      hasEarlier: false,
      seenUpTo: 0,
      canSend: reason === null,
      closedReason: reason,
    },
  };
}

type StayForMessaging = {
  listingId: string;
  referenceId: string;
  title: string;
  status: string;
  organizationId: string;
  place: string;
  image: string | null;
  hostUserId: string | null;
  hostName: string | null;
  hostEmail: string | null;
  hostStatus: string | null;
  hostVerified: boolean;
};

async function stayForMessaging(tx: DbOrTx, listingRef: string): Promise<StayForMessaging | null> {
  const { rows } = await tx.execute(sql`
    SELECT l.id, l.reference_id, l.title, l.status, l.organization_id, loc.name AS locality, city.name AS city, ${cover} AS image,
           la.agent_user_id AS host_user_id, hu.name AS host_name, hu.email AS host_email, hu.status AS host_status,
           coalesce(hp.verification_status = 'verified', false) AS host_verified
      FROM marketplace.listings l
      ${PLACE_JOINS}
      LEFT JOIN marketplace.listing_agents la ON la.listing_id = l.id AND la.role = 'primary' AND la.ended_at IS NULL
      LEFT JOIN identity.users hu ON hu.id = la.agent_user_id
      LEFT JOIN stays.host_profiles hp ON hp.user_id = la.agent_user_id
     WHERE l.reference_id = ${listingRef} AND l.transaction_type = 'stay' AND l.deleted_at IS NULL`);
  const r = rows[0] as Row | undefined;
  if (!r) return null;
  return {
    listingId: String(r.id),
    referenceId: String(r.reference_id),
    title: String(r.title),
    status: String(r.status),
    organizationId: String(r.organization_id),
    place: place(r),
    image: (r.image as string) ?? null,
    hostUserId: (r.host_user_id as string) ?? null,
    hostName: (r.host_name as string) ?? null,
    hostEmail: (r.host_email as string) ?? null,
    hostStatus: (r.host_status as string) ?? null,
    hostVerified: Boolean(r.host_verified),
  };
}

function draftClosedReason(stay: StayForMessaging, userId: string): string | null {
  if (!stay.hostUserId) return "This is a sample stay without a host, so there's no one to message.";
  if (stay.hostUserId === userId) return "This is your own stay. Guests' messages arrive in your hosting workspace.";
  if (stay.status !== "published") return "This stay isn't taking new enquiries right now.";
  if (stay.hostStatus !== "active") return "This host isn't available on Trustbrick right now.";
  return null;
}

// ── Sending ───────────────────────────────────────────────────────────────────

type Sent = { referenceId: string; message: ChatMessage };
type Delivery = { toEmail: string | null; fromName: string; listingTitle: string; body: string; link: string };

/** Appends a message to a locked conversation and works out whether the recipient needs telling. */
async function append(tx: Tx, r: Row, side: Side, senderUserId: string, body: string): Promise<{ message: ChatMessage; firstUnread: boolean }> {
  const conversationId = String(r.id);
  const recipientRead = Number(side === "guest" ? r.host_last_read_seq : r.guest_last_read_seq);
  // Only the first message the recipient hasn't seen triggers an email, so a burst of messages is one alert.
  const pending = await tx.execute(sql`
    SELECT 1 FROM stays.messages WHERE conversation_id = ${conversationId} AND sender_role = ${side} AND seq > ${recipientRead} LIMIT 1`);
  const inserted = await tx.execute(sql`
    INSERT INTO stays.messages (id, conversation_id, sender_user_id, sender_role, body)
    VALUES (gen_random_uuid(), ${conversationId}, ${senderUserId}, ${side}, ${body})
    RETURNING seq, created_at`);
  const m = inserted.rows[0] as Row;
  const seq = Number(m.seq);
  const readColumn = side === "guest" ? sql`guest_last_read_seq` : sql`host_last_read_seq`;
  await tx.execute(sql`UPDATE stays.conversations SET last_message_at = now(), ${readColumn} = ${seq}, updated_at = now() WHERE id = ${conversationId}`);
  const senderName = firstName(side === "guest" ? r.guest_name : r.host_name);
  return { message: { seq, body, mine: true, senderName, createdAt: iso(m.created_at) }, firstUnread: pending.rows.length === 0 };
}

function deliver(d: Delivery) {
  void sendEmail(
    bookingMessage(d.toEmail ?? "", {
      subject: `New message from ${d.fromName} about ${d.listingTitle}`,
      heading: `${d.fromName} sent you a message`,
      lines: [`“${snippet(d.body)}”`, `About ${d.listingTitle}. Reply on Trustbrick so the whole conversation stays in one place.`],
      action: { label: "Read and reply", url: url(d.link) },
    }),
  ).catch((e) => log.error("email.message_failed", { error: String(e) }));
}

async function checkRate(userId: string, newConversation: boolean) {
  const checks = [{ key: `message:user:${userId}`, rule: RULES.messageByUser }];
  if (newConversation) checks.push({ key: `conversation:user:${userId}`, rule: RULES.conversationByUser });
  const limited = await limit(checks);
  if (limited.limited) throw new AppError("RATE_LIMITED", "You've sent a lot of messages in a short time. Please wait a few minutes.");
}

/**
 * A guest writes: into an existing conversation, or about a listing (starting the conversation
 * if this is their first message about it).
 */
export async function sendGuestMessage(guest: { userId: string }, target: { conversation?: string; listing?: string }, raw: unknown, ctx: RequestContext): Promise<Sent> {
  const body = parseBody(raw);
  const account = await db.execute(sql`SELECT reference_id, status, email_verified FROM identity.users WHERE id = ${guest.userId}`);
  const a = account.rows[0] as Row | undefined;
  if (!a || a.status !== "active") throw new AppError("FORBIDDEN");
  if (!a.email_verified) throw new AppError("FORBIDDEN", "Confirm your email address before messaging hosts.");

  let conversationRef = target.conversation ? normalizeReferenceId(target.conversation) : null;
  if (!conversationRef && target.listing) {
    const existing = await guestConversationForListing(guest.userId, target.listing);
    if ("existing" in existing) conversationRef = existing.existing;
  }
  await checkRate(guest.userId, !conversationRef);

  const result = await db.transaction(async (tx) => {
    let r: Row;
    if (conversationRef) {
      r = await guestRow(tx, guest.userId, conversationRef, true);
    } else {
      const stay = await stayForMessaging(tx, normalizeReferenceId(target.listing ?? ""));
      if (!stay) throw notFound("This stay no longer exists.");
      const reason = draftClosedReason(stay, guest.userId);
      if (reason) throw new AppError("FORBIDDEN", reason);
      // Two tabs sending a first message at once still end up in one conversation.
      const created = await tx.execute(sql`
        INSERT INTO stays.conversations (id, listing_id, organization_id, host_user_id, guest_user_id)
        VALUES (gen_random_uuid(), ${stay.listingId}, ${stay.organizationId}, ${stay.hostUserId}, ${guest.userId})
        ON CONFLICT (listing_id, guest_user_id) DO NOTHING
        RETURNING reference_id`);
      const ref = created.rows[0] ? String((created.rows[0] as Row).reference_id) : null;
      if (ref) {
        const person: PersonActor = { kind: "person", userId: guest.userId, referenceId: String(a.reference_id), role: "guest" };
        await audit(tx, person, { event: "CONVERSATION_STARTED", target: { type: "conversation", referenceId: ref }, organizationId: stay.organizationId, metadata: { listing: stay.referenceId } }, ctx);
      }
      const { rows } = await tx.execute(sql`
        SELECT c.reference_id FROM stays.conversations c WHERE c.listing_id = ${stay.listingId} AND c.guest_user_id = ${guest.userId}`);
      r = await guestRow(tx, guest.userId, String((rows[0] as Row).reference_id), true);
    }
    const reason = closedReason(r, "guest");
    if (reason) throw new AppError("FORBIDDEN", reason);

    const { message, firstUnread } = await append(tx, r, "guest", guest.userId, body);
    const referenceId = String(r.reference_id);
    if (firstUnread) {
      await notify(tx, [String(r.host_user_id)], {
        type: "stay_message",
        title: `${firstName(r.guest_name)} sent you a message`,
        body: `${r.title}: ${snippet(body)}`,
        link: `/messages/${referenceId}`,
      });
    }
    const delivery: Delivery | null = firstUnread
      ? { toEmail: (r.host_email as string) ?? null, fromName: firstName(r.guest_name), listingTitle: String(r.title), body, link: `/messages/${referenceId}` }
      : null;
    return { referenceId, message, delivery };
  });
  if (result.delivery?.toEmail) deliver(result.delivery);
  return { referenceId: result.referenceId, message: result.message };
}

/** The host (or a colleague with the host's bookings in scope) replies. */
export async function sendHostMessage(actor: Actor, referenceId: string, raw: unknown): Promise<Sent> {
  assertCan(actor, "bookings.manage");
  const body = parseBody(raw);
  await checkRate(actor.userId, false);
  const result = await db.transaction(async (tx) => {
    const r = await hostRow(tx, actor, referenceId, "bookings.manage", true);
    const reason = closedReason(r, "host");
    if (reason) throw new AppError("FORBIDDEN", reason);
    const { message, firstUnread } = await append(tx, r, "host", actor.userId, body);
    const ref = String(r.reference_id);
    return {
      referenceId: ref,
      message,
      delivery: firstUnread
        ? { toEmail: (r.guest_email as string) ?? null, fromName: firstName(r.host_name), listingTitle: String(r.title), body, link: `/account/messages/${ref}` }
        : null,
    };
  });
  if (result.delivery?.toEmail) deliver(result.delivery);
  return { referenceId: result.referenceId, message: result.message };
}

// ── Live updates ──────────────────────────────────────────────────────────────

export type PollResult = { messages: ChatMessage[]; seenUpTo: number; canSend: boolean; closedReason: string | null };

async function poll(r: Row, side: Side, afterSeq: number): Promise<PollResult> {
  const after = Number.isFinite(afterSeq) && afterSeq > 0 ? Math.floor(afterSeq) : 0;
  const { messages } = await loadMessages(db, String(r.id), side, sql`m.seq > ${after}`, 200);
  // loadMessages returns the newest page; on a poll that's everything new unless 200+ arrived at once.
  const last = messages.at(-1)?.seq;
  if (last) await markRead(db, String(r.id), side, last);
  const reason = closedReason(r, side);
  return { messages, seenUpTo: Number(side === "guest" ? r.host_last_read_seq : r.guest_last_read_seq), canSend: reason === null, closedReason: reason };
}

export async function pollGuestConversation(userId: string, referenceId: string, afterSeq: number) {
  return poll(await guestRow(db, userId, referenceId), "guest", afterSeq);
}

export async function pollHostConversation(actor: Actor, referenceId: string, afterSeq: number) {
  return readOnlyUnlessManager(actor, await poll(await hostRow(db, actor, referenceId, "bookings.view"), "host", afterSeq));
}

async function earlier(r: Row, side: Side, beforeSeq: number) {
  const { messages, hasMore } = await loadMessages(db, String(r.id), side, sql`m.seq < ${Math.floor(beforeSeq)}`);
  return { messages, hasEarlier: hasMore };
}

export async function earlierGuestMessages(userId: string, referenceId: string, beforeSeq: number) {
  return earlier(await guestRow(db, userId, referenceId), "guest", beforeSeq);
}

export async function earlierHostMessages(actor: Actor, referenceId: string, beforeSeq: number) {
  return earlier(await hostRow(db, actor, referenceId, "bookings.view"), "host", beforeSeq);
}

// ── Lists and counts ──────────────────────────────────────────────────────────

const SUMMARY_SELECT = (side: Side) => sql`
  SELECT c.reference_id, l.reference_id AS listing_ref, l.title, loc.name AS locality, city.name AS city, ${cover} AS image,
         ${side === "guest" ? sql`hu.name` : sql`gu.name`} AS counterpart,
         lm.body AS last_body, lm.sender_role AS last_role, lm.created_at AS last_at,
         (SELECT count(*) FROM stays.messages um
           WHERE um.conversation_id = c.id AND um.sender_role = ${side === "guest" ? "host" : "guest"}
             AND um.seq > ${side === "guest" ? sql`c.guest_last_read_seq` : sql`c.host_last_read_seq`})::int AS unread
    FROM stays.conversations c
    JOIN marketplace.listings l ON l.id = c.listing_id
    ${PLACE_JOINS}
    JOIN identity.users gu ON gu.id = c.guest_user_id
    JOIN identity.users hu ON hu.id = c.host_user_id
    LEFT JOIN LATERAL (SELECT body, sender_role, created_at FROM stays.messages WHERE conversation_id = c.id ORDER BY seq DESC LIMIT 1) lm ON true`;

const toSummary = (side: Side) => (r: Row): ConversationSummary => ({
  referenceId: String(r.reference_id),
  listing: { referenceId: String(r.listing_ref), title: String(r.title), place: place(r), image: (r.image as string) ?? null },
  counterpartName: side === "guest" ? firstName(r.counterpart) : String(r.counterpart),
  last: r.last_body ? { body: snippet(String(r.last_body)), mine: r.last_role === side, at: iso(r.last_at) } : null,
  unread: Number(r.unread),
});

export async function listGuestConversations(userId: string): Promise<ConversationSummary[]> {
  const { rows } = await db.execute(sql`${SUMMARY_SELECT("guest")} WHERE c.guest_user_id = ${userId} ORDER BY c.last_message_at DESC LIMIT 100`);
  return (rows as Row[]).map(toSummary("guest"));
}

export const hostInboxFilters = z.object({
  show: z.enum(["all", "unread"]).catch("all"),
  q: z.string().trim().max(100).optional().catch(undefined),
});

export async function listHostConversations(actor: Actor, filters: z.infer<typeof hostInboxFilters>, page: number): Promise<Page<ConversationSummary> & { unread: number }> {
  if (actor.workspace !== "professional") throw new AppError("FORBIDDEN");
  const scope = conversationScope(actor, "bookings.view");
  const where: SQL[] = [scope];
  const unreadCond = sql`EXISTS (SELECT 1 FROM stays.messages um WHERE um.conversation_id = c.id AND um.sender_role = 'guest' AND um.seq > c.host_last_read_seq)`;
  if (filters.show === "unread") where.push(unreadCond);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const ref = normalizeReferenceId(filters.q);
    where.push(sql`(c.reference_id = ${ref} OR l.reference_id = ${ref} OR gu.name ILIKE ${like} OR l.title ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const { limit: take, offset } = pageParams(page);
  const [rows, count, unread] = await Promise.all([
    db.execute(sql`${SUMMARY_SELECT("host")} WHERE ${whereSql} ORDER BY c.last_message_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n FROM stays.conversations c JOIN marketplace.listings l ON l.id = c.listing_id JOIN identity.users gu ON gu.id = c.guest_user_id WHERE ${whereSql}`),
    db.execute(sql`SELECT count(*)::int AS n FROM stays.conversations c WHERE ${scope} AND ${unreadCond}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map(toSummary("host")),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: take,
    unread: Number((unread.rows[0] as Row).n),
  };
}

/** Conversations with something the guest hasn't read, for the account badge. */
export async function guestUnreadCount(userId: string): Promise<number> {
  const { rows } = await db.execute(sql`
    SELECT count(*)::int AS n FROM stays.conversations c
     WHERE c.guest_user_id = ${userId}
       AND EXISTS (SELECT 1 FROM stays.messages m WHERE m.conversation_id = c.id AND m.sender_role = 'host' AND m.seq > c.guest_last_read_seq)`);
  return Number((rows[0] as Row).n);
}

/** For a listing page: the guest's conversation about this stay, if there is one. */
export async function guestConversationSummary(userId: string, listingReferenceId: string): Promise<ConversationSummary | null> {
  const ref = normalizeReferenceId(listingReferenceId);
  if (!isReferenceId(ref, "LST")) return null;
  const { rows } = await db.execute(sql`${SUMMARY_SELECT("guest")} WHERE c.guest_user_id = ${userId} AND l.reference_id = ${ref}`);
  return rows[0] ? toSummary("guest")(rows[0] as Row) : null;
}

/**
 * For a booking page the caller has already been allowed to see: the conversation between the
 * booking's guest and its listing, if there is one.
 */
export async function conversationForBooking(bookingReferenceId: string): Promise<string | null> {
  const { rows } = await db.execute(sql`
    SELECT c.reference_id FROM stays.bookings b
      JOIN stays.conversations c ON c.listing_id = b.listing_id AND c.guest_user_id = b.guest_user_id
     WHERE b.reference_id = ${bookingReferenceId}`);
  return rows[0] ? String((rows[0] as Row).reference_id) : null;
}

/**
 * A host opens the conversation with a guest who has booked with them (they can't message
 * someone out of the blue). Returns the existing conversation if there is one.
 */
export async function hostConversationForBooking(actor: Actor, bookingReferenceId: string, ctx: RequestContext): Promise<string> {
  if (actor.workspace !== "professional") throw new AppError("FORBIDDEN");
  const scope = bookingScope(actor, "bookings.manage");
  const ref = normalizeReferenceId(bookingReferenceId);
  if (!isReferenceId(ref, "BKG")) throw notFound();
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT b.listing_id, b.organization_id, b.host_user_id, b.guest_user_id FROM stays.bookings b WHERE b.reference_id = ${ref} AND ${scope}`);
    const b = rows[0] as Row | undefined;
    if (!b) throw notFound();
    const created = await tx.execute(sql`
      INSERT INTO stays.conversations (id, listing_id, organization_id, host_user_id, guest_user_id)
      VALUES (gen_random_uuid(), ${String(b.listing_id)}, ${String(b.organization_id)}, ${String(b.host_user_id)}, ${String(b.guest_user_id)})
      ON CONFLICT (listing_id, guest_user_id) DO NOTHING
      RETURNING reference_id`);
    if (created.rows[0]) {
      const conversationRef = String((created.rows[0] as Row).reference_id);
      await audit(tx, actor, { event: "CONVERSATION_STARTED", target: { type: "conversation", referenceId: conversationRef }, organizationId: String(b.organization_id), metadata: { booking: ref } }, ctx);
      return conversationRef;
    }
    const existing = await tx.execute(sql`SELECT reference_id FROM stays.conversations WHERE listing_id = ${String(b.listing_id)} AND guest_user_id = ${String(b.guest_user_id)}`);
    return String((existing.rows[0] as Row).reference_id);
  });
}

// ── Dispute review by Trustbrick admins ───────────────────────────────────────
//
// Admins with `conversations.view` can read a conversation, read-only, to resolve a dispute.
// Each time, they first say why; the reason is written to the audit log and opens the
// conversation to them for a few hours. Reading never changes either side's read receipts.

export const ADMIN_ACCESS_HOURS = 8;

const accessReasonSchema = z.string().trim().min(10, "Say why you need to read it (at least 10 characters).").max(500, "Keep it under 500 characters.");

export type AdminConversationSummary = {
  referenceId: string;
  listing: { referenceId: string; title: string };
  guest: { name: string; referenceId: string };
  host: { name: string; referenceId: string };
  messageCount: number;
  lastMessageAt: string;
  bookings: number;
};

export type AdminConversation = {
  referenceId: string;
  listing: { referenceId: string; title: string; place: string };
  guest: { name: string; email: string; referenceId: string };
  host: { name: string; email: string; referenceId: string; hostReferenceId: string | null };
  messages: { seq: number; body: string; senderRole: Side; senderName: string; createdAt: string }[];
  bookings: { referenceId: string; checkIn: string; checkOut: string; status: BookingStatus; statusLabel: string }[];
  access: { actorName: string; reason: string; at: string }[];
  grantedUntil: string;
};

async function adminConversationId(actor: Actor, referenceId: string): Promise<{ id: string; ref: string; organizationId: string }> {
  assertCan(actor, "conversations.view", "platform");
  const ref = normalizeReferenceId(referenceId);
  if (!isReferenceId(ref, "MSG")) throw notFound();
  const { rows } = await db.execute(sql`SELECT id, organization_id FROM stays.conversations WHERE reference_id = ${ref}`);
  const r = rows[0] as Row | undefined;
  if (!r) throw notFound();
  return { id: String(r.id), ref, organizationId: String(r.organization_id) };
}

/** When this admin's current access to the conversation ends, or null if they must give a reason first. */
export async function adminAccessUntil(actor: Actor, referenceId: string): Promise<string | null> {
  const c = await adminConversationId(actor, referenceId);
  const { rows } = await db.execute(sql`
    SELECT created_at + ${`${ADMIN_ACCESS_HOURS} hours`}::interval AS until FROM platform.audit_events
     WHERE event_type = 'CONVERSATION_ACCESSED' AND actor_user_id = ${actor.userId} AND target_reference_id = ${c.ref}
       AND created_at > now() - ${`${ADMIN_ACCESS_HOURS} hours`}::interval
     ORDER BY created_at DESC LIMIT 1`);
  return rows[0] ? iso((rows[0] as Row).until) : null;
}

/** An admin states why they need to read a conversation. Logged; opens it to them for a few hours. */
export async function openConversationForReview(actor: Actor, referenceId: string, rawReason: unknown, ctx: RequestContext): Promise<void> {
  const c = await adminConversationId(actor, referenceId);
  const parsed = accessReasonSchema.safeParse(typeof rawReason === "string" ? rawReason : "");
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Say why you need to read it.";
    throw invalid(message, { reason: message });
  }
  await audit(db, actor, { event: "CONVERSATION_ACCESSED", target: { type: "conversation", id: c.id, referenceId: c.ref }, organizationId: c.organizationId, metadata: { reason: parsed.data } }, ctx);
}

/** The whole conversation, read-only, for an admin who has given a reason. */
export async function getConversationForAdmin(actor: Actor, referenceId: string): Promise<AdminConversation> {
  const until = await adminAccessUntil(actor, referenceId);
  if (!until) throw new AppError("FORBIDDEN", "Give a reason before reading this conversation.");
  const c = await adminConversationId(actor, referenceId);
  const [head, messages, access] = await Promise.all([
    db.execute(sql`
      SELECT c.guest_user_id, c.listing_id, l.reference_id AS listing_ref, l.title, loc.name AS locality, city.name AS city,
             gu.name AS guest_name, gu.email AS guest_email, gu.reference_id AS guest_ref,
             hu.name AS host_name, hu.email AS host_email, hu.reference_id AS host_ref, hp.reference_id AS host_profile_ref
        FROM stays.conversations c
        JOIN marketplace.listings l ON l.id = c.listing_id
        ${PLACE_JOINS}
        JOIN identity.users gu ON gu.id = c.guest_user_id
        JOIN identity.users hu ON hu.id = c.host_user_id
        LEFT JOIN stays.host_profiles hp ON hp.user_id = c.host_user_id
       WHERE c.id = ${c.id}`),
    db.execute(sql`
      SELECT m.seq, m.body, m.sender_role, m.created_at, su.name AS sender_name
        FROM stays.messages m LEFT JOIN identity.users su ON su.id = m.sender_user_id
       WHERE m.conversation_id = ${c.id} ORDER BY m.seq LIMIT 2000`),
    db.execute(sql`
      SELECT coalesce(u.name, a.actor_reference_id) AS actor_name, a.metadata->>'reason' AS reason, a.created_at
        FROM platform.audit_events a LEFT JOIN identity.users u ON u.id = a.actor_user_id
       WHERE a.event_type = 'CONVERSATION_ACCESSED' AND a.target_reference_id = ${c.ref}
       ORDER BY a.created_at DESC LIMIT 20`),
  ]);
  const h = head.rows[0] as Row;
  return {
    referenceId: c.ref,
    listing: { referenceId: String(h.listing_ref), title: String(h.title), place: place(h) },
    guest: { name: String(h.guest_name), email: String(h.guest_email), referenceId: String(h.guest_ref) },
    host: { name: String(h.host_name), email: String(h.host_email), referenceId: String(h.host_ref), hostReferenceId: (h.host_profile_ref as string) ?? null },
    messages: (messages.rows as Row[]).map((m) => ({
      seq: Number(m.seq),
      body: String(m.body),
      senderRole: m.sender_role as Side,
      senderName: String(m.sender_name ?? (m.sender_role === "host" ? "Host" : "Guest")),
      createdAt: iso(m.created_at),
    })),
    bookings: await bookingsBetween(String(h.listing_id), String(h.guest_user_id)),
    access: (access.rows as Row[]).map((a) => ({ actorName: String(a.actor_name ?? "An admin"), reason: String(a.reason ?? ""), at: iso(a.created_at) })),
    grantedUntil: until,
  };
}

export const adminConversationFilters = z.object({ q: z.string().trim().max(100).optional().catch(undefined) });

/** Conversations for admins to find the right one: who, which stay, how much. Never the messages themselves. */
export async function listConversationsForAdmin(actor: Actor, filters: z.infer<typeof adminConversationFilters>, page: number): Promise<Page<AdminConversationSummary>> {
  assertCan(actor, "conversations.view", "platform");
  const where: SQL[] = [sql`TRUE`];
  if (filters.q) {
    const ref = normalizeReferenceId(filters.q);
    const like = `%${filters.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    where.push(sql`(c.reference_id = ${ref} OR l.reference_id = ${ref} OR gu.reference_id = ${ref} OR hu.reference_id = ${ref}
                    OR EXISTS (SELECT 1 FROM stays.bookings b WHERE b.reference_id = ${ref} AND b.listing_id = c.listing_id AND b.guest_user_id = c.guest_user_id)
                    OR gu.name ILIKE ${like} OR gu.email ILIKE ${like} OR hu.name ILIKE ${like} OR l.title ILIKE ${like})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const from = sql`FROM stays.conversations c
    JOIN marketplace.listings l ON l.id = c.listing_id
    JOIN identity.users gu ON gu.id = c.guest_user_id
    JOIN identity.users hu ON hu.id = c.host_user_id`;
  const { limit: take, offset } = pageParams(page);
  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT c.reference_id, c.last_message_at, l.reference_id AS listing_ref, l.title, gu.name AS guest_name, gu.reference_id AS guest_ref,
             hu.name AS host_name, hu.reference_id AS host_ref,
             (SELECT count(*) FROM stays.messages m WHERE m.conversation_id = c.id)::int AS messages,
             (SELECT count(*) FROM stays.bookings b WHERE b.listing_id = c.listing_id AND b.guest_user_id = c.guest_user_id)::int AS bookings
        ${from} WHERE ${whereSql} ORDER BY c.last_message_at DESC LIMIT ${take} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${whereSql}`),
  ]);
  return {
    rows: (rows.rows as Row[]).map((r) => ({
      referenceId: String(r.reference_id),
      listing: { referenceId: String(r.listing_ref), title: String(r.title) },
      guest: { name: String(r.guest_name), referenceId: String(r.guest_ref) },
      host: { name: String(r.host_name), referenceId: String(r.host_ref) },
      messageCount: Number(r.messages),
      lastMessageAt: iso(r.last_message_at),
      bookings: Number(r.bookings),
    })),
    total: Number((count.rows[0] as Row).n),
    page,
    pageSize: take,
  };
}

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { createBooking } from "@/lib/services/stays/bookings";
import {
  getGuestConversation,
  getHostConversation,
  guestConversationForListing,
  guestUnreadCount,
  adminAccessUntil,
  getConversationForAdmin,
  hostConversationForBooking,
  listConversationsForAdmin,
  openConversationForReview,
  listGuestConversations,
  listHostConversations,
  pollGuestConversation,
  pollHostConversation,
  sendGuestMessage,
  sendHostMessage,
} from "@/lib/services/stays/messages";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import { MESSAGE_MAX_LENGTH } from "@/lib/vocab";
import { ctx, makeAdmin, makeHost, makeSuperadmin, makeUser, one } from "./support/factory";
import { readyStay } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const day = (offset: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const notifications = async (userId: string) =>
  (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE user_id = ${userId} AND type = 'stay_message'`)).n;

let host: Actor;
let otherHost: Actor;
let admin: Actor;
let moderator: Actor;
let guest: Awaited<ReturnType<typeof makeUser>>;
let stranger: Awaited<ReturnType<typeof makeUser>>;
let stay: string;

beforeAll(async () => {
  host = await (await makeHost("Chat Host", { verified: true })).actor();
  otherHost = await (await makeHost("Other Chat Host")).actor();
  moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  guest = await makeUser("Chat Guest");
  stranger = await makeUser("Chat Stranger");
  stay = await readyStay(host, { title: "Chat test cottage in Assagao", price: 4000, minNights: 1, maxNights: 10, maxGuests: 4 });
  await transitionListing(host, stay, "submit", {}, ctx);
  await transitionListing(moderator, stay, "approve", { reason: "Checked the details and photos." }, ctx);
});

describe("stay messages", () => {
  let conversation: string;

  it("shows an empty conversation until the guest's first message creates it", async () => {
    const found = await guestConversationForListing(guest.id, stay);
    expect("draft" in found && found.draft.referenceId).toBe(null);
    expect("draft" in found && found.draft.canSend).toBe(true);
    expect(await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM stays.conversations WHERE guest_user_id = ${guest.id}`)).toEqual({ n: 0 });
  });

  it("starts the conversation on the first message and tells the host once", async () => {
    const first = await sendGuestMessage({ userId: guest.id }, { listing: stay }, "  Hi! Is there parking for one car?\r\n\r\n\r\n\r\nThanks  ", ctx);
    conversation = first.referenceId;
    expect(conversation).toMatch(/^MSG-/);
    expect(first.message.body).toBe("Hi! Is there parking for one car?\n\nThanks");
    expect(await notifications(host.userId)).toBe(1);

    // A second message before the host has read the first is not a second alert.
    const second = await sendGuestMessage({ userId: guest.id }, { listing: stay }, "Also, can we check in at noon?", ctx);
    expect(second.referenceId).toBe(conversation);
    expect(second.message.seq).toBeGreaterThan(first.message.seq);
    expect(await notifications(host.userId)).toBe(1);
  });

  it("lets the host read and reply, and tracks what each side has seen", async () => {
    const inbox = await listHostConversations(host, { show: "unread" }, 1);
    expect(inbox.unread).toBe(1);
    expect(inbox.rows[0]).toMatchObject({ referenceId: conversation, unread: 2, counterpartName: "Chat Guest" });

    const view = await getHostConversation(host, conversation);
    expect(view.messages.map((m) => m.mine)).toEqual([false, false]);
    expect(view.canSend).toBe(true);
    expect((await listHostConversations(host, { show: "unread" }, 1)).unread).toBe(0);

    const reply = await sendHostMessage(host, conversation, "Yes, there's covered parking. Noon is fine.");
    expect(await guestUnreadCount(guest.id)).toBe(1);

    const guestView = await getGuestConversation(guest.id, conversation);
    expect(guestView.messages.at(-1)).toMatchObject({ body: "Yes, there's covered parking. Noon is fine.", mine: false, senderName: "Chat" });
    // The host has seen both of the guest's messages.
    expect(guestView.seenUpTo).toBeGreaterThanOrEqual(guestView.messages[1].seq);
    expect(await guestUnreadCount(guest.id)).toBe(0);

    // Polling returns only what's new.
    expect((await pollGuestConversation(guest.id, conversation, reply.message.seq)).messages).toEqual([]);
    const poll = await pollHostConversation(host, conversation, 0);
    expect(poll.messages).toHaveLength(3);
  });

  it("keeps one conversation per guest and stay, so a returning guest sees the earlier chat", async () => {
    const found = await guestConversationForListing(guest.id, stay);
    expect(found).toEqual({ existing: conversation });
    const list = await listGuestConversations(guest.id);
    expect(list).toHaveLength(1);
    expect(list[0].last).toMatchObject({ mine: false });

    // Booking the stay later doesn't start a new thread: the booking shows up beside the old one.
    await createBooking({ userId: guest.id, email: guest.email }, stay, { checkIn: day(40), checkOut: day(42), adults: "2", children: "0", name: "Chat Guest", phone: "98765 22222", agree: "on" }, ctx);
    const view = await getGuestConversation(guest.id, conversation);
    expect(view.messages).toHaveLength(3);
    expect(view.bookings).toHaveLength(1);
  });

  it("keeps conversations private", async () => {
    expect(await code(getGuestConversation(stranger.id, conversation))).toBe("NOT_FOUND");
    expect(await code(sendGuestMessage({ userId: stranger.id }, { conversation }, "Hello?", ctx))).toBe("NOT_FOUND");
    expect(await code(getHostConversation(otherHost, conversation))).toBe("NOT_FOUND");
    expect(await code(sendHostMessage(otherHost, conversation, "Hello?"))).toBe("NOT_FOUND");
    // Admins don't use the host's inbox; they review through /conversations with a logged reason.
    expect(await code(getHostConversation(admin, conversation))).toBe("FORBIDDEN");
    // A host can't message their own stay as a guest.
    expect(await code(sendGuestMessage({ userId: host.userId }, { listing: stay }, "Testing", ctx))).toBe("FORBIDDEN");
  });

  it("validates messages and keeps the log append-only", async () => {
    expect(await code(sendGuestMessage({ userId: guest.id }, { conversation }, "   \n  ", ctx))).toBe("VALIDATION_ERROR");
    expect(await code(sendGuestMessage({ userId: guest.id }, { conversation }, "x".repeat(MESSAGE_MAX_LENGTH + 1), ctx))).toBe("VALIDATION_ERROR");
    const unverified = await makeUser("Unverified Guest", { verified: false });
    expect(await code(sendGuestMessage({ userId: unverified.id }, { listing: stay }, "Hello there", ctx))).toBe("FORBIDDEN");
    await expect(db.execute(sql`UPDATE stays.messages SET body = 'edited' WHERE conversation_id = (SELECT id FROM stays.conversations WHERE reference_id = ${conversation})`)).rejects.toThrow();
  });

  it("lets a host open a conversation only with a guest who has booked", async () => {
    const booker = await makeUser("Booking Guest");
    const booked = await createBooking({ userId: booker.id, email: booker.email }, stay, { checkIn: day(50), checkOut: day(52), adults: "1", children: "0", name: "Booking Guest", phone: "98765 33333", agree: "on" }, ctx);
    const ref = await hostConversationForBooking(host, booked.referenceId, ctx);
    expect(ref).toMatch(/^MSG-/);
    expect(await hostConversationForBooking(host, booked.referenceId, ctx)).toBe(ref);
    expect(await code(hostConversationForBooking(otherHost, booked.referenceId, ctx))).toBe("NOT_FOUND");
    await sendHostMessage(host, ref, "Looking forward to hosting you!");
    // The guest's own "Message the host" lands in the same conversation.
    expect(await guestConversationForListing(booker.id, stay)).toEqual({ existing: ref });
  });

  it("lets an admin with conversations.view read a conversation, read-only, after giving a logged reason", async () => {
    // Moderators and the SuperAdmin don't have the permission.
    const superadmin = await (await makeSuperadmin()).actor();
    expect(await code(listConversationsForAdmin(moderator, {}, 1))).toBe("FORBIDDEN");
    expect(await code(adminAccessUntil(superadmin, conversation))).toBe("FORBIDDEN");

    const list = await listConversationsForAdmin(admin, { q: guest.email }, 1);
    expect(list.rows.map((r) => r.referenceId)).toContain(conversation);
    expect(await code(getConversationForAdmin(admin, conversation))).toBe("FORBIDDEN");
    expect(await code(openConversationForReview(admin, conversation, "curious", ctx))).toBe("VALIDATION_ERROR");

    const before = await one<{ g: number; h: number }>(sql`SELECT guest_last_read_seq::int AS g, host_last_read_seq::int AS h FROM stays.conversations WHERE reference_id = ${conversation}`);
    await openConversationForReview(admin, conversation, "Guest disputes what was agreed about check-in time.", ctx);
    expect(await adminAccessUntil(admin, conversation)).not.toBe(null);
    const read = await getConversationForAdmin(admin, conversation);
    expect(read.messages.map((m) => m.senderRole)).toEqual(["guest", "guest", "host"]);
    expect(read.access[0].reason).toBe("Guest disputes what was agreed about check-in time.");
    // Reading changes nothing the guest or host see.
    const after = await one<{ g: number; h: number }>(sql`SELECT guest_last_read_seq::int AS g, host_last_read_seq::int AS h FROM stays.conversations WHERE reference_id = ${conversation}`);
    expect(after).toEqual(before);
    const logged = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type = 'CONVERSATION_ACCESSED' AND target_reference_id = ${conversation} AND actor_user_id = ${admin.userId}`);
    expect(logged.n).toBe(1);
    // Admins still can't reply as the host.
    expect(await code(sendHostMessage(admin, conversation, "Hello from Trustbrick"))).toBe("FORBIDDEN");
  });
});

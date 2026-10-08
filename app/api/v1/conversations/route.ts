import { apiRoute } from "@/lib/api/http";
import { guestUnreadCount, listGuestConversations } from "@/lib/services/stays/messages";

/** The person's conversations with hosts, newest first, with unread counts. */
export const GET = apiRoute("v1.conversations", { auth: "user" }, async ({ person }) => {
  const [items, unread] = await Promise.all([listGuestConversations(person!.userId), guestUnreadCount(person!.userId)]);
  return { unread, items };
});

import { apiRoute } from "@/lib/api/http";
import { listNotifications, unreadCount } from "@/lib/services/notifications";

/** The person's notifications, newest first (up to 50), and how many are unread. */
export const GET = apiRoute("v1.notifications", { auth: "user" }, async ({ person }) => {
  const [items, unread] = await Promise.all([listNotifications(person!.userId, 50), unreadCount(person!.userId)]);
  return {
    unread,
    items: items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.readAt !== null, createdAt: n.createdAt.toISOString() })),
  };
});

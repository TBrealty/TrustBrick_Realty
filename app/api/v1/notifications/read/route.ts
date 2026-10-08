import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { markRead, unreadCount } from "@/lib/services/notifications";

/** Marks one notification read (`{ id }`), or all of them (`{}`). */
export const POST = apiRoute("v1.notifications.read", { auth: "user" }, async ({ request, person }) => {
  const { id } = await readJson(request, z.object({ id: z.uuid().optional() }));
  await markRead(person!.userId, id);
  return { unread: await unreadCount(person!.userId) };
});

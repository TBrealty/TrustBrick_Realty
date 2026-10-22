import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { NOTIFICATION_TYPES, type NotificationType, setMutedTypes } from "@/lib/services/notifications";

/** Which notifications to get: `{ enabled: [types] }`; the rest are muted (security notices always come). */
export const PUT = apiRoute("v1.me.notification_preferences", { auth: "user" }, async ({ person, request }) => {
  const { enabled } = await readJson(request, z.object({ enabled: z.array(z.string().max(60)).max(100) }));
  const on = new Set(enabled);
  await setMutedTypes(person!.userId, (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter((t) => !on.has(t)));
  return { saved: true };
});

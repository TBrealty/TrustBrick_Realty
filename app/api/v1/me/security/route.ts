import { desc, eq } from "drizzle-orm";
import { apiRoute } from "@/lib/api/http";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema/identity";
import { NOTIFICATION_TYPES, type NotificationType, mutedTypes } from "@/lib/services/notifications";

/** A device, in words, from its user agent ("Chrome on Windows", "Trustbrick app on Android"). */
function device(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/okhttp|Expo|Trustbrick|CFNetwork|Dalvik/i.test(ua)) return /iPhone|iPad|CFNetwork|Darwin/i.test(ua) ? "Trustbrick app on iOS" : "Trustbrick app on Android";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Profile & security, as the website's page: where the person is signed in (this device marked)
 * and which notifications they get. Security notices can't be turned off.
 */
export const GET = apiRoute("v1.me.security", { auth: "user" }, async ({ person }) => {
  const p = person!;
  const [rows, muted] = await Promise.all([
    db.select({ id: sessions.id, ua: sessions.userAgent, ip: sessions.ipAddress, updatedAt: sessions.updatedAt }).from(sessions).where(eq(sessions.userId, p.userId)).orderBy(desc(sessions.updatedAt)).limit(20),
    mutedTypes(p.userId),
  ]);
  return {
    sessions: rows.map((s) => ({ device: device(s.ua), ip: s.ip, lastActiveAt: s.updatedAt.toISOString(), current: s.id === p.sessionId })),
    notifications: (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
      type,
      label: NOTIFICATION_TYPES[type],
      enabled: !muted.has(type),
      locked: type === "security" || type === "admin_access_changed",
    })),
  };
});

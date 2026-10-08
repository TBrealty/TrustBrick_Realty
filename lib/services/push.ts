import "server-only";
import { sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";

/**
 * Push notifications for the Trustbrick app. Nothing calls this when something happens:
 * `notify()` writes the in-app notification as before, and delivery picks up any not yet
 * pushed, after the request that created them has committed. A notification rolled back with
 * its transaction is never pushed, and one that fails to send isn't retried forever.
 *
 * Delivery goes through Expo's push service, which forwards to Firebase (Android) and Apple's
 * service (iOS), so the server needs no Firebase or Apple keys of its own.
 *
 * PUSH_DRIVER: "expo" sends; "log" only logs (development); "off" does nothing.
 * Defaults to "expo" in production and "log" otherwise. EXPO_ACCESS_TOKEN is optional, for
 * projects with Expo's enhanced push security turned on.
 */

type Row = Record<string, unknown>;

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
/** Notifications older than this when delivery runs are marked done without sending. */
const FRESH_FOR = "1 hour";
const BATCH = 200;

export const PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

export const deviceSchema = z.object({
  token: z.string().trim().regex(PUSH_TOKEN, "That isn't an Expo push token"),
  platform: z.enum(["android", "ios"]),
  appVersion: z.string().trim().max(40).optional(),
});

function driver(): "expo" | "log" | "off" {
  const d = process.env.PUSH_DRIVER;
  if (d === "expo" || d === "log" || d === "off") return d;
  return process.env.NODE_ENV === "production" ? "expo" : "log";
}

/** Registers (or moves) a phone's push token to this person and app session. */
export async function registerDevice(userId: string, sessionId: string, raw: unknown) {
  const parsed = deviceSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const d = parsed.data;
  await db.execute(sql`
    INSERT INTO platform.push_devices (id, user_id, session_id, token, platform, app_version)
    VALUES (gen_random_uuid(), ${userId}, ${sessionId}, ${d.token}, ${d.platform}, ${d.appVersion ?? null})
    ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id, platform = excluded.platform,
      app_version = excluded.app_version, last_seen_at = now(), disabled_at = NULL`);
}

/** Stops pushes to a phone: on signing out, or when the person turns them off. Only their own. */
export async function unregisterDevice(userId: string, token: string) {
  await db.execute(sql`DELETE FROM platform.push_devices WHERE user_id = ${userId} AND token = ${token}`);
}

/**
 * Delivers after the response, once whatever created the notifications has committed. Called by
 * every API route and server action that changes something; tests call delivery directly.
 */
export function schedulePushDelivery() {
  if (process.env.NODE_ENV === "test" || driver() === "off") return;
  const run = () => deliverPendingPush().catch((e) => log.warn("push.delivery_failed", { error: e instanceof Error ? e.message : String(e) }));
  try {
    after(run);
  } catch {
    void run();
  }
}

type Message = { to: string; title: string; body?: string; data: Record<string, unknown>; sound: "default"; badge: number; channelId: string; deviceId: string };

/**
 * Sends notifications not yet pushed. Claims a batch first (so two servers never send the same
 * one), then sends to each person's live devices: those whose app session is still valid.
 */
export async function deliverPendingPush(): Promise<{ notifications: number; messages: number; disabled: number }> {
  const mode = driver();
  const claimed = await db.execute(sql`
    WITH batch AS (
      SELECT id FROM platform.notifications WHERE pushed_at IS NULL ORDER BY created_at LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
    )
    UPDATE platform.notifications n SET pushed_at = now() FROM batch WHERE n.id = batch.id
    RETURNING n.id, n.user_id, n.type, n.title, n.body, n.link, n.created_at > now() - ${FRESH_FOR}::interval AS fresh`);
  const rows = (claimed.rows as Row[]).filter((r) => r.fresh);
  if (rows.length === 0 || mode === "off") return { notifications: claimed.rows.length, messages: 0, disabled: 0 };

  const userIds = [...new Set(rows.map((r) => String(r.user_id)))];
  const devices = await db.execute(sql`
    SELECT d.id, d.user_id, d.token,
           (SELECT count(*) FROM platform.notifications u WHERE u.user_id = d.user_id AND u.read_at IS NULL)::int AS unread
      FROM platform.push_devices d JOIN identity.sessions s ON s.id = d.session_id AND s.expires_at > now()
      JOIN identity.users usr ON usr.id = d.user_id AND usr.status = 'active'
     WHERE d.user_id = ANY(${sql.param(userIds)}::uuid[]) AND d.disabled_at IS NULL`);
  const byUser = new Map<string, Row[]>();
  for (const d of devices.rows as Row[]) byUser.set(String(d.user_id), [...(byUser.get(String(d.user_id)) ?? []), d]);

  const messages: Message[] = rows.flatMap((n) =>
    (byUser.get(String(n.user_id)) ?? []).map((d) => ({
      to: String(d.token),
      title: String(n.title),
      ...(n.body ? { body: String(n.body).slice(0, 300) } : {}),
      // The app opens `link` (a website path it maps to a screen) when the notification is tapped.
      data: { notificationId: String(n.id), type: String(n.type), link: (n.link as string) ?? null },
      sound: "default" as const,
      badge: Number(d.unread),
      channelId: "default",
      deviceId: String(d.id),
    })),
  );
  if (messages.length === 0) return { notifications: claimed.rows.length, messages: 0, disabled: 0 };

  if (mode === "log") {
    for (const m of messages) log.info("push.would_send", { to: m.to.slice(0, 24), title: m.title, link: m.data.link });
    return { notifications: claimed.rows.length, messages: messages.length, disabled: 0 };
  }

  let disabled = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const response = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: m.sound, badge: m.badge, channelId: m.channelId }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        log.warn("push.send_failed", { status: response.status });
        continue;
      }
      const tickets = ((await response.json()) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
      const gone = chunk.filter((_, k) => tickets[k]?.status === "error" && tickets[k]?.details?.error === "DeviceNotRegistered").map((m) => m.deviceId);
      if (gone.length) {
        await db.execute(sql`UPDATE platform.push_devices SET disabled_at = now() WHERE id = ANY(${sql.param(gone)}::uuid[])`);
        disabled += gone.length;
      }
    } catch (error) {
      log.warn("push.send_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { notifications: claimed.rows.length, messages: messages.length, disabled };
}

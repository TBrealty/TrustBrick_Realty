import { timingSafeEqual } from "node:crypto";
import { deliverPendingPush } from "@/lib/services/push";

/**
 * Sends any push notifications still waiting (normally sent straight after the request that
 * created them). For a scheduler to call every minute or so:
 * `POST /api/internal/push` with `Authorization: Bearer $PUSH_CRON_SECRET`.
 * Without PUSH_CRON_SECRET set, it's switched off.
 */
export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json(await deliverPendingPush(), { headers: { "Cache-Control": "no-store" } });
}

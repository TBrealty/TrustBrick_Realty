import { timingSafeEqual } from "node:crypto";
import { reconcilePayments, settlePayments } from "@/lib/services/stays/payments";

/**
 * Carries out what online payments owe: holds taken or released, refunds sent, hosts paid on
 * their payout date, failures retried. For a scheduler every 5 minutes:
 * `POST /api/internal/payments` with `Authorization: Bearer $CRON_SECRET`; once a day with
 * `?reconcile=1`, which also checks recent payments against the provider's records.
 * Without CRON_SECRET, it's off.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return new Response("Not found", { status: 404 });
  const settled = await settlePayments();
  const reconciled = new URL(request.url).searchParams.get("reconcile") === "1" ? await reconcilePayments() : null;
  return Response.json({ settled, reconciled }, { headers: { "Cache-Control": "no-store" } });
}

import { timingSafeEqual } from "node:crypto";
import { processCaptures } from "@/lib/services/tour-captures";

/**
 * Makes any 360° photos still waiting (normally made straight after the app finishes sending the
 * photos, or when the agent opens the listing). For a scheduler to call every few minutes:
 * `POST /api/internal/captures` with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET, it's off.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ made: await processCaptures() }, { headers: { "Cache-Control": "no-store" } });
}

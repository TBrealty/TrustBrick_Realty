import { apiRoute, rateLimit } from "@/lib/api/http";
import { RULES } from "@/lib/auth/rate-limit";
import { putCaptureShot } from "@/lib/services/tour-captures";

/**
 * One photo of a guided capture: the JPEG as the body, and where the phone pointed as
 * `?yaw=&pitch=&roll=` (degrees). Sending the same index again replaces it.
 */
export const PUT = apiRoute<{ id: string; index: string }>("v1.partner.capture_shot", { auth: "user" }, async ({ actor, params, request, url }) => {
  const a = await actor();
  await rateLimit([{ key: `capture-shot:user:${a.userId}`, rule: RULES.captureShotByUser }]);
  const q = url.searchParams;
  return putCaptureShot(a, params.id, Number(params.index), { yaw: q.get("yaw"), pitch: q.get("pitch"), roll: q.get("roll") ?? 0 }, request.body);
});

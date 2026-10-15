import { apiRoute, created, rateLimit, readJson } from "@/lib/api/http";
import { RULES } from "@/lib/auth/rate-limit";
import { captureSchema, startCapture } from "@/lib/services/tour-captures";

/**
 * Starts a 360° photo taken with the app's guided camera: `{ roomName, hfov, shotCount }` → `{ id }`.
 * Then send each photo to /partner/captures/{id}/shots/{index}, and finish with /partner/captures/{id}/finish.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.capture_start", { auth: "user" }, async ({ actor, params, request }) => {
  const a = await actor();
  await rateLimit([{ key: `capture:user:${a.userId}`, rule: RULES.captureByUser }]);
  return created(await startCapture(a, params.ref, await readJson(request, captureSchema)));
});

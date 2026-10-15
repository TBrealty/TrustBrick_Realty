import { apiRoute } from "@/lib/api/http";
import { discardCapture } from "@/lib/services/tour-captures";

/** Discards a capture that's still uploading, or one that couldn't be made. */
export const DELETE = apiRoute<{ id: string }>("v1.partner.capture_discard", { auth: "user" }, async ({ actor, params }) => {
  await discardCapture(await actor(), params.id);
  return { discarded: true };
});

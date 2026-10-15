import { apiRoute } from "@/lib/api/http";
import { finishCapture, scheduleCaptureProcessing } from "@/lib/services/tour-captures";

/** All photos are sent: the 360° photo is made in the background (a minute or two), then added to the tour. */
export const POST = apiRoute<{ id: string }>("v1.partner.capture_finish", { auth: "user" }, async ({ actor, params }) => {
  const view = await finishCapture(await actor(), params.id);
  scheduleCaptureProcessing();
  return view;
});

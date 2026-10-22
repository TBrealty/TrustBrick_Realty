import { apiRoute } from "@/lib/api/http";
import { unblockDates } from "@/lib/services/stays/calendar";

/** Opens blocked nights again. */
export const DELETE = apiRoute<{ ref: string; id: string }>("v1.partner.stay_unblock", { auth: "user" }, async ({ actor, params, requestContext }) => {
  await unblockDates(await actor(), params.ref, params.id, requestContext);
  return { removed: true };
});

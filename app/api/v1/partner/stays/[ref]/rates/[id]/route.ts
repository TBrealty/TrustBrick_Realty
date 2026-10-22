import { apiRoute } from "@/lib/api/http";
import { removeSpecialRate } from "@/lib/services/stays/calendar";

/** Removes a special price. */
export const DELETE = apiRoute<{ ref: string; id: string }>("v1.partner.stay_rate_remove", { auth: "user" }, async ({ actor, params, requestContext }) => {
  await removeSpecialRate(await actor(), params.ref, params.id, requestContext);
  return { removed: true };
});

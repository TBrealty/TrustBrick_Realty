import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateVisit } from "@/lib/services/crm";

/**
 * Acts on a visit: `{ action: "schedule", scheduledAt }` (an ISO date-time) confirms a time and
 * tells the customer; `complete`, `no_show` and `cancel` close it.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.visit", { auth: "user" }, async ({ actor, params, request }) => {
  await updateVisit(await actor(), params.ref, await readJson(request, z.object({ action: z.string(), scheduledAt: z.string().optional(), notes: z.string().optional() })));
  return { updated: true };
});

import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { getLead, updateLeadStatus } from "@/lib/services/crm";

/** Moves a lead along the pipeline: `{ status, note?, lostReason? }` (a reason is needed for lost). */
export const POST = apiRoute<{ ref: string }>("v1.partner.lead_status", { auth: "user" }, async ({ actor, params, request }) => {
  const a = await actor();
  await updateLeadStatus(a, params.ref, await readJson(request, z.object({ status: z.string(), note: z.string().optional(), lostReason: z.string().optional() })));
  return getLead(a, params.ref);
});

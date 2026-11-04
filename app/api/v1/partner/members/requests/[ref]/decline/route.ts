import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { declineJoinRequest } from "@/lib/services/members";

/** Turns down a request to join: `{ reason }` (at least 10 characters; they're told it). */
export const POST = apiRoute<{ ref: string }>("v1.partner.join_decline", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { reason } = await readJson(request, z.object({ reason: z.unknown() }));
  await declineJoinRequest(await actor(), params.ref, reason, requestContext);
  return { ok: true };
});

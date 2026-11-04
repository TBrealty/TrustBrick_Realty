import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { approveJoinRequest } from "@/lib/services/members";

/** Lets an agent who asked to join in: `{ role?, teamId? }` (an Agent, with no team, unless given). */
export const POST = apiRoute<{ ref: string }>("v1.partner.join_approve", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  await approveJoinRequest(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext);
  return { ok: true };
});

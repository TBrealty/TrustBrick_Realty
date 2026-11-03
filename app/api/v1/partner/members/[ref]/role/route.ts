import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { changeMemberRole, getMember } from "@/lib/services/members";

/** Changes someone's role: `{ role, phone?, handoverTo? }` (a phone to make them an agent; who takes their work if they become an Operator). */
export const POST = apiRoute<{ ref: string }>("v1.partner.member_role", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const a = await actor();
  await changeMemberRole(a, params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext);
  return getMember(a, params.ref);
});

import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { setTeamMember } from "@/lib/services/members";

/** Adds a supervisor or agent to the team, or takes them out: `{ member: "USR-…", inTeam: boolean }`. */
export const POST = apiRoute<{ id: string }>("v1.partner.team_member", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { member, inTeam } = await readJson(request, z.object({ member: z.string(), inTeam: z.boolean() }));
  await setTeamMember(await actor(), params.id, member, inTeam, requestContext);
  return { ok: true };
});

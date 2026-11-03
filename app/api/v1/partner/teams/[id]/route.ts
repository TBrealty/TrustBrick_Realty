import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { deleteTeam, renameTeam } from "@/lib/services/members";

/** Renames a team: `{ name }`. */
export const PUT = apiRoute<{ id: string }>("v1.partner.team_rename", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { name } = await readJson(request, z.object({ name: z.unknown() }));
  await renameTeam(await actor(), params.id, name, requestContext);
  return { ok: true };
});

/** Deletes a team. Its people stay in the organization. */
export const DELETE = apiRoute<{ id: string }>("v1.partner.team_delete", { auth: "user" }, async ({ actor, params, requestContext }) => {
  await deleteTeam(await actor(), params.id, requestContext);
  return { ok: true };
});

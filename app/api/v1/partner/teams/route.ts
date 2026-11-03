import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { createTeam } from "@/lib/services/members";

/** Creates a team: `{ name }`. */
export const POST = apiRoute("v1.partner.team_create", { auth: "user" }, async ({ actor, request, requestContext }) => {
  const { name } = await readJson(request, z.object({ name: z.unknown() }));
  return createTeam(await actor(), name, requestContext);
});

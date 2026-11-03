import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { removeMember } from "@/lib/services/members";

/** Removes someone from the organization: `{ handoverTo?, reason? }`. Their work goes to `handoverTo`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.member_remove", { auth: "user" }, async ({ actor, params, request, requestContext }) =>
  removeMember(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext),
);

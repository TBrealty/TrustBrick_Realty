import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { assignListingAgent } from "@/lib/services/members";

/** Gives the listing to another agent: `{ agent: "USR-…" }`. Its open leads, visits and stays go with it. */
export const POST = apiRoute<{ ref: string }>("v1.partner.listing_agent", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { agent } = await readJson(request, z.object({ agent: z.string() }));
  await assignListingAgent(await actor(), params.ref, agent, requestContext);
  return { ok: true };
});

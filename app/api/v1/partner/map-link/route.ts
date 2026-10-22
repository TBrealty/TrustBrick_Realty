import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { resolveMapLink } from "@/lib/services/map-links";

/** Reads the pin from a pasted Google or Apple Maps link (following short links): `{ link }` → `{ ok, pin? , reason? }`. */
export const POST = apiRoute("v1.partner.map_link", { auth: "user" }, async ({ actor, request }) => {
  await actor();
  const { link } = await readJson(request, z.object({ link: z.string().max(2000) }));
  return resolveMapLink(link);
});

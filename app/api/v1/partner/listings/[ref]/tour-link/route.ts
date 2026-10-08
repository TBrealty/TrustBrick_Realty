import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { updateTourLink } from "@/lib/services/tours";

/** Sets or clears (`""`) the hosted 3D tour link: `{ url }`. */
export const PUT = apiRoute<{ ref: string }>("v1.partner.tour_link", { auth: "user" }, async ({ actor, params, request }) => {
  const { url } = await readJson(request, z.object({ url: z.string().max(500) }));
  const link = await updateTourLink(await actor(), params.ref, url);
  return { link: link ? { provider: link.provider.name, url: link.url } : null };
});

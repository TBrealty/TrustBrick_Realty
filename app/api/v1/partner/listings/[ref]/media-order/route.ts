import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { reorderListingMedia } from "@/lib/services/media";

/** Sets the order of a listing's files of one kind (rooms, photos): `{ ids: [...] }`. */
export const PUT = apiRoute<{ ref: string }>("v1.partner.media_order", { auth: "user" }, async ({ actor, params, request }) => {
  const { ids } = await readJson(request, z.object({ ids: z.array(z.uuid()).max(100) }));
  await reorderListingMedia(await actor(), params.ref, ids);
  return { saved: true };
});

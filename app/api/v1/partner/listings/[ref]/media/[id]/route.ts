import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { deleteListingMedia, updateMediaAlt } from "@/lib/services/media";

/** Names a room (a 360° photo's caption) or describes a photo: `{ name }`. */
export const PUT = apiRoute<{ ref: string; id: string }>("v1.partner.media_name", { auth: "user" }, async ({ actor, params, request }) => {
  const { name } = await readJson(request, z.object({ name: z.string().max(200) }));
  await updateMediaAlt(await actor(), params.ref, params.id, name);
  return { saved: true };
});

/** Removes a file from the listing (and from storage). */
export const DELETE = apiRoute<{ ref: string; id: string }>("v1.partner.media_delete", { auth: "user" }, async ({ actor, params }) => {
  await deleteListingMedia(await actor(), params.ref, params.id);
  return { deleted: true };
});

import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { sendGuestMessage } from "@/lib/services/stays/messages";

/** Messages a stay's host before booking, starting the conversation if needed: `{ body }`. */
export const POST = apiRoute<{ ref: string }>("v1.stays.message_host", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const { body } = await readJson(request, z.object({ body: z.string().max(5000) }));
  return created(await sendGuestMessage({ userId: person!.userId }, { listing: params.ref }, body, requestContext));
});

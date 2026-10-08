import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { earlierHostMessages, pollHostConversation, sendHostMessage } from "@/lib/services/stays/messages";

/** New messages since `?after=<seq>`, or older ones before `?before=<seq>`. */
export const GET = apiRoute<{ ref: string }>("v1.partner.conversation_messages", { auth: "user" }, async ({ actor, url, params }) => {
  const a = await actor();
  if (url.searchParams.has("before")) {
    const before = Number(url.searchParams.get("before"));
    if (!Number.isFinite(before) || before < 1) throw new AppError("VALIDATION_ERROR", "before must be a message number.");
    return earlierHostMessages(a, params.ref, before);
  }
  return pollHostConversation(a, params.ref, Number(url.searchParams.get("after") ?? 0));
});

/** Replies to the guest: `{ body }`. The guest is notified in the app and by push. */
export const POST = apiRoute<{ ref: string }>("v1.partner.conversation_send", { auth: "user" }, async ({ actor, params, request }) => {
  const { body } = await readJson(request, z.object({ body: z.string().max(5000) }));
  return created(await sendHostMessage(await actor(), params.ref, body));
});

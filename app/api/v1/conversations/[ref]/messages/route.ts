import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { AppError } from "@/lib/errors";
import { earlierGuestMessages, pollGuestConversation, sendGuestMessage } from "@/lib/services/stays/messages";

/**
 * New messages since `?after=<seq>` (poll every few seconds while the chat is open; marks them
 * read), or older ones before `?before=<seq>`.
 */
export const GET = apiRoute<{ ref: string }>("v1.conversations.messages", { auth: "user" }, async ({ url, params, person }) => {
  const before = Number(url.searchParams.get("before"));
  if (url.searchParams.has("before")) {
    if (!Number.isFinite(before) || before < 1) throw new AppError("VALIDATION_ERROR", "before must be a message number.");
    return earlierGuestMessages(person!.userId, params.ref, before);
  }
  return pollGuestConversation(person!.userId, params.ref, Number(url.searchParams.get("after") ?? 0));
});

/** Sends a message to the host: `{ body }`. */
export const POST = apiRoute<{ ref: string }>("v1.conversations.send", { auth: "user" }, async ({ request, params, person, requestContext }) => {
  const { body } = await readJson(request, z.object({ body: z.string().max(5000) }));
  return created(await sendGuestMessage({ userId: person!.userId }, { conversation: params.ref }, body, requestContext));
});

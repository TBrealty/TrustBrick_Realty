"use server";

import { runPersonAction } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { AppError, type ActionResult } from "@/lib/errors";
import { type ChatMessage, type PollResult, earlierGuestMessages, guestUnreadCount, pollGuestConversation, sendGuestMessage } from "@/lib/services/stays/messages";

/** A guest's message: into their conversation, or about a listing (the first message starts the conversation). */
export async function sendGuestMessageAction(target: { conversation?: string; listing?: string }, body: string): Promise<ActionResult<{ referenceId: string; message: ChatMessage }>> {
  return runPersonAction(
    "stay.message",
    (person, ctx) => sendGuestMessage({ userId: person!.userId }, { conversation: target.conversation ? String(target.conversation) : undefined, listing: target.listing ? String(target.listing) : undefined }, body, ctx),
    { revalidate: ["/account/messages"] },
  );
}

/** New messages since `afterSeq`. Null when signed out or the conversation isn't theirs. */
export async function pollGuestAction(referenceId: string, afterSeq: number): Promise<PollResult | null> {
  const session = await getSession();
  if (!session) return null;
  return pollGuestConversation(session.user.id, String(referenceId), Number(afterSeq)).catch((e) => {
    if (e instanceof AppError) return null;
    throw e;
  });
}

export async function earlierGuestAction(referenceId: string, beforeSeq: number): Promise<{ messages: ChatMessage[]; hasEarlier: boolean } | null> {
  const session = await getSession();
  if (!session) return null;
  return earlierGuestMessages(session.user.id, String(referenceId), Number(beforeSeq)).catch((e) => {
    if (e instanceof AppError) return null;
    throw e;
  });
}

/** For the account nav badge: conversations with something unread. */
export async function guestUnreadAction(): Promise<number> {
  const session = await getSession();
  return session ? guestUnreadCount(session.user.id) : 0;
}

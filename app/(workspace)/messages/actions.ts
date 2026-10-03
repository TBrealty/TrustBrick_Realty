"use server";

import { redirect } from "next/navigation";
import { runAction, text } from "@/lib/actions";
import { actorForAction } from "@/lib/authz/session";
import { AppError, type ActionResult } from "@/lib/errors";
import { type ChatMessage, type PollResult, earlierHostMessages, hostConversationForBooking, pollHostConversation, sendHostMessage } from "@/lib/services/stays/messages";

export async function sendHostMessageAction(target: { conversation?: string }, body: string): Promise<ActionResult<{ referenceId: string; message: ChatMessage }>> {
  return runAction("stay.message.reply", (actor) => sendHostMessage(actor, String(target.conversation ?? ""), body), { revalidate: ["/messages"] });
}

export async function pollHostAction(referenceId: string, afterSeq: number): Promise<PollResult | null> {
  try {
    return await pollHostConversation(await actorForAction(), String(referenceId), Number(afterSeq));
  } catch (e) {
    if (e instanceof AppError) return null;
    throw e;
  }
}

export async function earlierHostAction(referenceId: string, beforeSeq: number): Promise<{ messages: ChatMessage[]; hasEarlier: boolean } | null> {
  try {
    return await earlierHostMessages(await actorForAction(), String(referenceId), Number(beforeSeq));
  } catch (e) {
    if (e instanceof AppError) return null;
    throw e;
  }
}

/** "Message guest" on a booking: opens (or creates) the conversation with that guest. */
export async function messageGuestAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const booking = text(form, "booking");
  const result = await runAction("stay.message.open", (actor, ctx) => hostConversationForBooking(actor, booking, ctx));
  if (result.ok) redirect(`/messages/${result.data as string}`);
  return result;
}

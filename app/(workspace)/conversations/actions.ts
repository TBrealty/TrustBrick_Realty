"use server";

import { redirect } from "next/navigation";
import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { openConversationForReview } from "@/lib/services/stays/messages";

/** An admin states why they need to read a conversation; the reason goes to the audit log. */
export async function openForReviewAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  const result = await runAction("conversation.review", (actor, ctx) => openConversationForReview(actor, ref, text(form, "reason"), ctx));
  if (result.ok) redirect(`/conversations/${ref}`);
  return result;
}

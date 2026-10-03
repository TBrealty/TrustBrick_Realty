"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { markRead } from "@/lib/services/notifications";

const UUID = /^[0-9a-f-]{36}$/i;

/** Scoped to the actor's own notifications inside markRead, so an id alone reads nobody else's. */
export async function markReadAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const id = text(form, "id");
  return runAction("notification.read", async (a) => (UUID.test(id) ? markRead(a.userId, id) : undefined), { revalidate: ["/notifications"] });
}

export async function markAllReadAction(): Promise<ActionResult<unknown>> {
  return runAction("notification.read_all", (a) => markRead(a.userId), { revalidate: ["/notifications"] });
}

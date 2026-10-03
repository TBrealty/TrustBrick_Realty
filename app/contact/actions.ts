"use server";

import { formObject, runPersonAction } from "@/lib/actions";
import { clientIp } from "@/lib/auth/rate-limit";
import type { ActionResult } from "@/lib/errors";
import { sendContactMessage } from "@/lib/services/contact";

export async function contactAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const ip = await clientIp();
  const r = await runPersonAction("contact.send", (person) => sendContactMessage(formObject(form), { userId: person?.userId ?? null, ipKey: ip }), {
    requireSession: false,
  });
  if (!r.ok) return r;
  const { referenceId } = r.data as { referenceId: string };
  return { ok: true, message: referenceId, data: { referenceId } };
}

"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { resolveContactMessage } from "@/lib/services/contact";

export async function resolveContactAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const r = await runAction("contact.resolve", (a, ctx) => resolveContactMessage(a, text(form, "ref"), text(form, "reason"), ctx), { revalidate: ["/inbox", "/dashboard"] });
  return r.ok ? { ok: true, message: "Marked as resolved." } : r;
}

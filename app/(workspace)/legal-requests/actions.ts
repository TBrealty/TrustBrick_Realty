"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { LEGAL_STATUS_LABELS } from "@/lib/legal/services";
import { updateLegalRequest } from "@/lib/services/legal";
import type { LegalRequestStatus } from "@/lib/vocab";

export async function updateLegalRequestAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const status = text(form, "status");
  const r = await runAction("legal.update", (a, ctx) => updateLegalRequest(a, text(form, "ref"), { status, note: text(form, "reason") }, ctx), {
    revalidate: ["/legal-requests", "/dashboard"],
  });
  const label = LEGAL_STATUS_LABELS[status as LegalRequestStatus]?.label.toLowerCase();
  return r.ok ? { ok: true, message: label ? `Marked ${label}.` : "Updated." } : r;
}

"use server";

import { formObject, runPersonAction } from "@/lib/actions";
import { clientIp } from "@/lib/auth/rate-limit";
import type { ActionResult } from "@/lib/errors";
import { applyForLegalVerification } from "@/lib/services/legal";

export async function legalRequestAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const ip = await clientIp();
  const r = await runPersonAction("legal.apply", (person) => applyForLegalVerification(formObject(form), { userId: person?.userId ?? null, ipKey: ip }), {
    requireSession: false,
    revalidate: ["/legal-verification/requests"],
  });
  if (!r.ok) return r;
  const { referenceId } = r.data as { referenceId: string };
  return { ok: true, message: referenceId, data: { referenceId } };
}

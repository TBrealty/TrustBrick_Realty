"use server";

import { runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { acceptCommissionTerms } from "@/lib/services/commission";

export async function acceptTermsAction(): Promise<ActionResult<unknown>> {
  const r = await runAction("commission.accept", (a, ctx) => acceptCommissionTerms(a, ctx), { revalidate: ["/commission", "/properties"] });
  return r.ok ? { ok: true, message: "Accepted. You can submit listings for approval." } : r;
}

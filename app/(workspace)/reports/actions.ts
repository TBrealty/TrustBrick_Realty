"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { resolveReport } from "@/lib/services/reports";

export async function resolveReportAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const r = await runAction("report.resolve", (a, ctx) => resolveReport(a, text(form, "ref"), text(form, "outcome"), text(form, "note"), ctx), {
    revalidate: ["/reports", "/dashboard", "/approvals"],
  });
  return r.ok ? { ok: true, message: "Report resolved." } : r;
}

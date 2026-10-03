"use server";

import { runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { type Summary, type SummaryKind, loadSummary } from "@/lib/services/summaries";

/** Loads the "View" card for one user, agent or organization. Read-only; checks happen in the service. */
export async function loadSummaryAction(kind: SummaryKind, referenceId: string): Promise<ActionResult<Summary>> {
  return runAction("summary.view", (actor) => loadSummary(actor, kind, String(referenceId).trim().toUpperCase()));
}

"use server";

import { runPersonAction } from "@/lib/actions";
import { formObject } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { applyAsAgent } from "@/lib/services/agents";

export async function applyAsAgentAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const r = await runPersonAction(
    "agent.apply",
    (person, ctx) => applyAsAgent({ kind: "person", userId: person!.userId, referenceId: person!.referenceId, role: "customer" }, formObject(form), ctx),
    { revalidate: ["/become-an-agent"] },
  );
  return r.ok ? { ok: true, message: "Application sent." } : r;
}

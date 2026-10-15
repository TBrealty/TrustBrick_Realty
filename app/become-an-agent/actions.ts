"use server";

import { redirect } from "next/navigation";
import { formObject, runPersonAction } from "@/lib/actions";
import type { AgentFormState } from "@/lib/auth/form";
import { applyAsAgent } from "@/lib/services/agents";

const apply = (form: FormData) =>
  runPersonAction(
    "agent.apply",
    (person, ctx) => applyAsAgent({ kind: "person", userId: person!.userId, referenceId: person!.referenceId, role: "customer" }, formObject(form), ctx),
    { revalidate: ["/become-an-agent"] },
  );

/** The agent form on /become-an-agent, for someone already signed in. */
export async function applyAsAgentFormAction(_p: AgentFormState, form: FormData): Promise<AgentFormState> {
  const r = await apply(form);
  if (r.ok) redirect("/become-an-agent?applied=1");
  const values = Object.fromEntries(Object.entries(formObject(form)).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  return { status: "error", message: r.fieldErrors ? "Please check the highlighted fields." : r.message, fieldErrors: r.fieldErrors, values };
}

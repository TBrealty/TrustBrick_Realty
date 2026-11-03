import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { getLead } from "@/lib/services/crm";
import { assignLead, leadAssignees } from "@/lib/services/members";

/** Who this lead can be given to (empty when the person can't assign leads). */
export const GET = apiRoute<{ ref: string }>("v1.partner.lead_assignees", { auth: "user" }, async ({ actor }) => ({ assignees: await leadAssignees(await actor()) }));

/** Gives the lead to someone: `{ agent: "USR-…" }`. Within the team for a Supervisor. */
export const POST = apiRoute<{ ref: string }>("v1.partner.lead_assign", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const a = await actor();
  const { agent } = await readJson(request, z.object({ agent: z.string() }));
  await assignLead(a, params.ref, agent, requestContext);
  // A Supervisor who gives a lead away may no longer see it.
  return getLead(a, params.ref).catch(() => null);
});

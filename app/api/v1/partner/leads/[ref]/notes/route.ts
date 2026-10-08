import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { addLeadNote, getLead } from "@/lib/services/crm";

/** Adds a note to a lead's history: `{ note }`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.lead_note", { auth: "user" }, async ({ actor, params, request }) => {
  const a = await actor();
  const { note } = await readJson(request, z.object({ note: z.string() }));
  await addLeadNote(a, params.ref, note);
  return created(await getLead(a, params.ref));
});

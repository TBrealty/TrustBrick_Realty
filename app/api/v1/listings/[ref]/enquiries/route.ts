import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { createEnquiry } from "@/lib/services/crm";

/**
 * Contacts the agent about a listing, optionally asking to visit: `{ name, phone, message?,
 * wantsVisit, visitDate?, visitTime? }`, checked as on the website. Becomes a lead for the agent.
 */
export const POST = apiRoute<{ ref: string }>("v1.listings.enquire", { auth: "user" }, async ({ request, params, person }) => {
  const body = await readJson(request, z.record(z.string(), z.unknown()));
  return created(await createEnquiry({ userId: person!.userId, email: person!.email }, params.ref, body));
});

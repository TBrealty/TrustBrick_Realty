import { apiRoute } from "@/lib/api/http";
import { getLead } from "@/lib/services/crm";

/** One lead: the contact, their message, the listing, its history and visits. */
export const GET = apiRoute<{ ref: string }>("v1.partner.lead", { auth: "user" }, async ({ actor, params }) => getLead(await actor(), params.ref));

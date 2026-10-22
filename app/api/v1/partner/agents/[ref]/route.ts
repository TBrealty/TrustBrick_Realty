import { apiRoute } from "@/lib/api/http";
import { getAgent } from "@/lib/services/agents";

/** One of the organization's agents: profile, numbers and recent listings. */
export const GET = apiRoute<{ ref: string }>("v1.partner.agent", { auth: "user" }, async ({ actor, params }) => getAgent(await actor(), params.ref));

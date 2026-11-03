import { apiRoute } from "@/lib/api/http";
import { getMember } from "@/lib/services/members";

/** One person in the organization: their work, teams, and what the viewer may change. */
export const GET = apiRoute<{ ref: string }>("v1.partner.member", { auth: "user" }, async ({ actor, params }) => getMember(await actor(), params.ref));

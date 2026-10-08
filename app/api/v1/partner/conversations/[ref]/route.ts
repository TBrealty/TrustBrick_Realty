import { apiRoute } from "@/lib/api/http";
import { getHostConversation } from "@/lib/services/stays/messages";

/** One conversation with a guest (marks it read). */
export const GET = apiRoute<{ ref: string }>("v1.partner.conversation", { auth: "user" }, async ({ actor, params }) => getHostConversation(await actor(), params.ref));

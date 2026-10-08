import { apiRoute } from "@/lib/api/http";
import { getGuestConversation } from "@/lib/services/stays/messages";

/** One conversation: the host, the stay, related bookings and the latest messages (marked read). */
export const GET = apiRoute<{ ref: string }>("v1.conversations.detail", { auth: "user" }, async ({ params, person }) =>
  getGuestConversation(person!.userId, params.ref),
);

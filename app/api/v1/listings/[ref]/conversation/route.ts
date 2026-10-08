import { apiRoute } from "@/lib/api/http";
import { guestConversationForListing } from "@/lib/services/stays/messages";

/**
 * The person's conversation with a stay's host: `{ existing: "CNV-…" }` when there is one, or a
 * `draft` (the host and listing, no messages) to start one with POST /listings/{ref}/messages.
 */
export const GET = apiRoute<{ ref: string }>("v1.stays.conversation", { auth: "user" }, async ({ params, person }) =>
  guestConversationForListing(person!.userId, params.ref),
);

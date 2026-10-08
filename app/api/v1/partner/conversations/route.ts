import { apiRoute, rawParams } from "@/lib/api/http";
import { parsePage } from "@/lib/services/pagination";
import { hostInboxFilters, listHostConversations } from "@/lib/services/stays/messages";

/** Guests' messages about the host's stays: `?show=unread`, `?q=`. */
export const GET = apiRoute("v1.partner.conversations", { auth: "user" }, async ({ actor, url }) => {
  const params = rawParams(url);
  return listHostConversations(await actor(), hostInboxFilters.parse(params), parsePage(params.page));
});

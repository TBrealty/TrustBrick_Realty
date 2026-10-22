import { apiRoute } from "@/lib/api/http";
import { listContacts } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

/** Clients: everyone who has enquired on the person's listings, with their leads (`?q=`, `?page=`). */
export const GET = apiRoute("v1.partner.contacts", { auth: "user" }, async ({ actor, url }) => {
  const q = url.searchParams.get("q")?.trim() || undefined;
  return listContacts(await actor(), q, parsePage(url.searchParams.get("page")));
});

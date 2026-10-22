import { apiRoute } from "@/lib/api/http";
import { myStays } from "@/lib/services/stays/calendar";

/** The homestays whose calendars this person manages. */
export const GET = apiRoute("v1.partner.stays", { auth: "user" }, async ({ actor }) => ({ items: await myStays(await actor()) }));

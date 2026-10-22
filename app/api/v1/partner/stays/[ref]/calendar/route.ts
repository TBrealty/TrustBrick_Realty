import { apiRoute } from "@/lib/api/http";
import { calendarMonth } from "@/lib/services/stays/calendar";

/** One month of a stay's calendar (`?month=YYYY-MM`): bookings, blocked nights and special prices. */
export const GET = apiRoute<{ ref: string }>("v1.partner.stay_calendar", { auth: "user" }, async ({ actor, params, url }) => {
  const month = url.searchParams.get("month") ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
  return calendarMonth(await actor(), params.ref, month);
});

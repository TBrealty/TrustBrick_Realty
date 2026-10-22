import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { blockDates } from "@/lib/services/stays/calendar";

/** Blocks nights so they can't be booked: `{ from, to, reason? }` (dates, both included). */
export const POST = apiRoute<{ ref: string }>("v1.partner.stay_block", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  return created(await blockDates(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext));
});

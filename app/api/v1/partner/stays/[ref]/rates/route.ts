import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { setSpecialRate } from "@/lib/services/stays/calendar";

/** A special nightly price for some dates (festivals, peak season): `{ from, to, price, note? }`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.stay_rate", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  return created(await setSpecialRate(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext));
});

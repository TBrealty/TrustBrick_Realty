import { z } from "zod";
import { apiRoute, created, readJson } from "@/lib/api/http";
import { inviteExistingLandlord, inviteNewLandlord, removeLandlord } from "@/lib/services/rent/landlords";

/**
 * Adds the property's landlord. `{ mode: "new", name, email, phone }` returns a one-time sign-up
 * `url` to share (shown once); `{ mode: "existing", who }` finds them by exact email, phone or LND-
 * reference and asks them in their dashboard.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.landlord_invite", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const body = await readJson(request, z.record(z.string(), z.unknown()));
  const a = await actor();
  return created(body.mode === "existing" ? await inviteExistingLandlord(a, params.ref, body, requestContext) : await inviteNewLandlord(a, params.ref, body, requestContext));
});

/** Removes the landlord (no tenancy may be running): `{ reason }`. */
export const DELETE = apiRoute<{ ref: string }>("v1.partner.landlord_remove", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const body = await readJson(request, z.object({ reason: z.unknown() }));
  await removeLandlord(await actor(), params.ref, body.reason, requestContext);
  return { ok: true };
});

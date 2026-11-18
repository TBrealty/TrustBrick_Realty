import { z } from "zod";
import { assertCan } from "@/lib/authz";
import { apiRoute, readJson } from "@/lib/api/http";
import { respondToLandlordRequest } from "@/lib/services/rent/landlords";

/** The landlord answers an agent's request (LIN-) to add a property: `{ accept: true|false }`. */
export const POST = apiRoute<{ ref: string }>("v1.partner.landlord_request", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { accept } = await readJson(request, z.object({ accept: z.boolean() }));
  const a = await actor();
  assertCan(a, "rent.receive");
  await respondToLandlordRequest(a.userId, a.userReferenceId, params.ref, accept, requestContext);
  return { ok: true };
});

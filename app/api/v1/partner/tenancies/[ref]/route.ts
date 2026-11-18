import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { cancelTenancy, confirmTenancy, correctTenancy, disputeTenancy, endTenancyByAgent, endTenancyByLandlord, resendTenantInvite } from "@/lib/services/rent/tenancies";

/** The agent corrects the terms before it starts: `{ monthlyRent, dueDay, deposit, startDate, endDate? }`. */
export const PUT = apiRoute<{ ref: string }>("v1.partner.tenancy_correct", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  await correctTenancy(await actor(), params.ref, await readJson(request, z.record(z.string(), z.unknown())), requestContext);
  return { ok: true };
});

/**
 * Agent: `{ action: "resend" }` (a new link for the tenant), `"cancel"` (before it starts), `"end"`
 * `{ endDate, reason }`. Landlord: `"confirm"`, `"dispute"` `{ note }`, `"landlord_end"` `{ endDate, reason }`.
 */
export const POST = apiRoute<{ ref: string }>("v1.partner.tenancy_action", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const body = await readJson(request, z.looseObject({ action: z.enum(["resend", "cancel", "end", "confirm", "dispute", "landlord_end"]) }));
  const a = await actor();
  switch (body.action) {
    case "resend":
      return resendTenantInvite(a, params.ref, requestContext);
    case "cancel":
      await cancelTenancy(a, params.ref, requestContext);
      break;
    case "end":
      await endTenancyByAgent(a, params.ref, body, requestContext);
      break;
    case "confirm":
      await confirmTenancy(a, params.ref, requestContext);
      break;
    case "dispute":
      await disputeTenancy(a, params.ref, body, requestContext);
      break;
    case "landlord_end":
      await endTenancyByLandlord(a, params.ref, body, requestContext);
      break;
  }
  return { ok: true };
});

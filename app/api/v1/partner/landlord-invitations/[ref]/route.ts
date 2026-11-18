import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api/http";
import { resendLandlordInvitation, revokeLandlordInvitation } from "@/lib/services/rent/landlords";

/** `{ action: "resend" }` makes a new link (the old stops working); `{ action: "revoke" }` cancels it. */
export const POST = apiRoute<{ ref: string }>("v1.partner.landlord_invitation", { auth: "user" }, async ({ actor, params, request, requestContext }) => {
  const { action } = await readJson(request, z.object({ action: z.enum(["resend", "revoke"]) }));
  const a = await actor();
  if (action === "resend") return resendLandlordInvitation(a, params.ref, requestContext);
  await revokeLandlordInvitation(a, params.ref, requestContext);
  return { ok: true };
});

import { apiRoute } from "@/lib/api/http";
import { revokeMemberInvitation } from "@/lib/services/members";

/** Revokes a pending invitation: its link stops working. */
export const POST = apiRoute<{ ref: string }>("v1.partner.member_invite_revoke", { auth: "user" }, async ({ actor, params, requestContext }) => {
  await revokeMemberInvitation(await actor(), params.ref, requestContext);
  return { ok: true };
});

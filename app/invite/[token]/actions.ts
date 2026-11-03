"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_COOKIE } from "@/lib/authz/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { runPersonAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { acceptAgentInvitation } from "@/lib/services/agent-invitations";
import { acceptInvitation } from "@/lib/services/admins";
import { acceptMemberInvitation } from "@/lib/services/members";

export async function acceptInvitationAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const token = text(form, "token");
  const ip = await clientIp();
  // The kind only picks which table the token is looked up in; the token alone grants anything.
  const kind = text(form, "kind") === "agent" ? "agent" : text(form, "kind") === "member" ? "member" : "admin";
  const accept = kind === "agent" ? acceptAgentInvitation : kind === "member" ? acceptMemberInvitation : acceptInvitation;
  const r = await runPersonAction(
    "invite.accept",
    (person, ctx) => accept(token, { sessionUserId: person?.userId ?? null, name: form.get("name"), password: form.get("password"), ipKey: ip }, ctx),
    { requireSession: false },
  );
  if (r.ok) {
    const { createdAccount, membershipId } = r.data as { createdAccount: boolean; membershipId?: string };
    // Open the organization they just joined. The cookie is only a hint: it must match one of their live memberships.
    if (membershipId) {
      (await cookies()).set(WORKSPACE_COOKIE, membershipId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
    }
    redirect(createdAccount ? `/login?invited=${kind === "admin" ? "1" : kind}&next=%2Fdashboard` : "/dashboard");
  }
  return r;
}

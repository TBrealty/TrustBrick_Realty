"use server";

import { redirect } from "next/navigation";
import { clientIp } from "@/lib/auth/rate-limit";
import { runPersonAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { acceptAgentInvitation } from "@/lib/services/agent-invitations";
import { acceptInvitation } from "@/lib/services/admins";

export async function acceptInvitationAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const token = text(form, "token");
  const ip = await clientIp();
  // The kind only picks which table the token is looked up in; the token alone grants anything.
  const kind = text(form, "kind") === "agent" ? "agent" : "admin";
  const accept = kind === "agent" ? acceptAgentInvitation : acceptInvitation;
  const r = await runPersonAction(
    "invite.accept",
    (person, ctx) => accept(token, { sessionUserId: person?.userId ?? null, name: form.get("name"), password: form.get("password"), ipKey: ip }, ctx),
    { requireSession: false },
  );
  if (r.ok) {
    const { createdAccount } = r.data as { createdAccount: boolean };
    redirect(createdAccount ? `/login?invited=${kind === "agent" ? "agent" : "1"}&next=%2Fdashboard` : "/dashboard");
  }
  return r;
}

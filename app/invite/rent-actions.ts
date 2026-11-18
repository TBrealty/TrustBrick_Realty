"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_COOKIE } from "@/lib/authz/session";
import { clientIp } from "@/lib/auth/rate-limit";
import { runPersonAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { acceptLandlordInvitation } from "@/lib/services/rent/landlords";
import { acceptTenancyInvitation } from "@/lib/services/rent/tenancies";

/**
 * Accepting a landlord's or a tenant's link. The token alone grants it, and only for the email it
 * was sent to: someone with an account must be logged in as that email.
 */
export async function acceptRentInviteAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const token = text(form, "token");
  const kind = text(form, "kind") === "tenant" ? "tenant" : "landlord";
  const ip = await clientIp();
  const input = { name: form.get("name"), password: form.get("password"), confirm: form.get("confirm"), phone: form.get("phone"), ipKey: ip };
  const r = await runPersonAction(
    "rent.invite_accept",
    (person, ctx) => (kind === "tenant" ? acceptTenancyInvitation(token, { ...input, sessionUserId: person?.userId ?? null }, ctx) : acceptLandlordInvitation(token, { ...input, sessionUserId: person?.userId ?? null }, ctx)),
    { requireSession: false },
  );
  if (r.ok) {
    const data = r.data as { createdAccount: boolean; membershipId?: string };
    const next = kind === "tenant" ? "/account/rent" : "/my-properties";
    // Open the landlord's workspace. The cookie is only a hint: it must match one of their live memberships.
    if (data.membershipId) {
      (await cookies()).set(WORKSPACE_COOKIE, data.membershipId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 180 });
    }
    redirect(data.createdAccount ? `/login?invited=${kind}&next=${encodeURIComponent(next)}` : next);
  }
  return r;
}

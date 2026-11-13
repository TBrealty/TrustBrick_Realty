"use server";

import { formObject, runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { savePayoutAccount } from "@/lib/services/stays/payments";

export async function savePayoutAccountAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const r = await runAction("payouts.account", (a, ctx) => savePayoutAccount(a, formObject(form), ctx), { revalidate: ["/payouts", "/payouts/account"] });
  if (!r.ok) return r;
  const account = r.data!;
  return {
    ok: true,
    message:
      account.status === "active"
        ? "Verified. Guests can book your stays, and payouts go to this account."
        : account.status === "action_required"
          ? `The bank couldn't verify this account: ${account.statusReason ?? "check the details and try again."}`
          : "Saved. The payment provider is verifying it; this usually takes a few minutes.",
  };
}

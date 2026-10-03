"use server";

import { runAction, text } from "@/lib/actions";
import { assertCan } from "@/lib/authz";
import type { ActionResult } from "@/lib/errors";
import { confirmPassword } from "@/lib/services/reauth";
import { setSetting } from "@/lib/services/settings";

export async function setSettingAction(_p: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const r = await runAction(
    "settings.set",
    async (a, ctx) => {
      assertCan(a, "settings.manage", "platform");
      await confirmPassword(a.userId, form.get("password"));
      await setSetting(a, text(form, "key"), text(form, "value") === "1", ctx);
    },
    { revalidate: ["/system"] },
  );
  return r.ok ? { ok: true, message: "Saved." } : r;
}

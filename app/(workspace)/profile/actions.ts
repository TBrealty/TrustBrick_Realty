"use server";

import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/form";
import { auth } from "@/lib/auth/auth";
import { getSession } from "@/lib/auth/session";
import { runAction, text } from "@/lib/actions";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema/identity";
import { AppError, type ActionResult, invalid } from "@/lib/errors";
import { NOTIFICATION_TYPES, type NotificationType, setMutedTypes } from "@/lib/services/notifications";

type Result = ActionResult<unknown>;

export async function changePasswordAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("profile.password", async () => {
    const next = text(form, "newPassword");
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) throw invalid(`Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`, { newPassword: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters` });
    if (next !== text(form, "confirmPassword")) throw invalid("The passwords don't match.", { confirmPassword: "The passwords don't match" });
    try {
      await auth.api.changePassword({ body: { currentPassword: text(form, "currentPassword"), newPassword: next, revokeOtherSessions: true }, headers: await headers() });
    } catch (error) {
      const code = (error as { body?: { code?: string } }).body?.code;
      if (code === "INVALID_PASSWORD") throw invalid("Your current password isn't right.", { currentPassword: "That isn't your current password" });
      throw error;
    }
  });
  return r.ok ? { ok: true, message: "Password changed. You've been logged out on every other device." } : r;
}

export async function revokeOtherSessionsAction(): Promise<Result> {
  const r = await runAction(
    "profile.sessions",
    async (a) => {
      const current = await getSession();
      if (!current) throw new AppError("UNAUTHORIZED");
      await db.delete(sessions).where(and(eq(sessions.userId, a.userId), ne(sessions.id, current.session.id)));
    },
    { revalidate: ["/profile"] },
  );
  return r.ok ? { ok: true, message: "Logged out everywhere else." } : r;
}

export async function preferencesAction(_p: Result | null, form: FormData): Promise<Result> {
  const enabled = new Set(form.getAll("enabled").filter((v): v is string => typeof v === "string"));
  const muted = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter((t) => !enabled.has(t));
  const r = await runAction("profile.preferences", (a) => setMutedTypes(a.userId, muted), { revalidate: ["/profile"] });
  return r.ok ? { ok: true, message: "Preferences saved." } : r;
}

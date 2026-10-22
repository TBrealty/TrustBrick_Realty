import { z } from "zod";
import { apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { auth } from "@/lib/auth/auth";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { invalid } from "@/lib/errors";

/**
 * Changes the password: `{ currentPassword, newPassword, confirmPassword }` → `{ token }`. As on
 * the website, every session ends and this device gets a new one: the app keeps signed in by
 * switching to the returned token.
 */
export const POST = apiRoute("v1.me.password", { auth: "user" }, async ({ person, request }) => {
  await rateLimit([{ key: `password:user:${person!.userId}`, rule: RULES.reauthByUser }]);
  const input = await readJson(request, z.object({ currentPassword: z.string().max(PASSWORD_MAX), newPassword: z.string(), confirmPassword: z.string() }));
  if (input.newPassword.length < PASSWORD_MIN || input.newPassword.length > PASSWORD_MAX) {
    throw invalid(`Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`, { newPassword: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters` });
  }
  if (input.newPassword !== input.confirmPassword) throw invalid("The passwords don't match.", { confirmPassword: "The passwords don't match" });
  let token: string | null;
  try {
    ({ token } = await auth.api.changePassword({ body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true }, headers: request.headers }));
  } catch (error) {
    const code = (error as { body?: { code?: string } }).body?.code;
    if (code === "INVALID_PASSWORD") throw invalid("Your current password isn't right.", { currentPassword: "That isn't your current password" });
    throw error;
  }
  return { changed: true, token };
});

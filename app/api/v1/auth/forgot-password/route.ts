import { z } from "zod";
import { apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { auth } from "@/lib/auth/auth";
import { CODE_MINUTES } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address.").max(254) });

/**
 * Emails a password-reset code; the app then sends it with the new password to
 * POST /auth/reset-password. The answer is the same whether or not the account exists.
 */
export const POST = apiRoute("v1.auth.forgot_password", { auth: "public" }, async ({ request, ip }) => {
  const email = (await readJson(request, schema)).email.toLowerCase();
  await rateLimit([
    { key: `reset-request:ip:${ip}`, rule: RULES.resetRequestByIp },
    { key: `reset-request:email:${email}`, rule: RULES.resetRequestByEmail },
  ]);
  try {
    await auth.api.requestPasswordResetEmailOTP({ body: { email }, headers: request.headers });
  } catch (error) {
    log.error("api.password_reset_failed", { error: error instanceof Error ? error.message : String(error) });
  }
  return { message: `If an account exists for that email, we've sent a code to reset your password. It expires in ${CODE_MINUTES} minutes.` };
});

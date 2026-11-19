import { z } from "zod";
import { authErrorCode } from "@/lib/api/auth-errors";
import { apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { PASSWORD_MAX, PASSWORD_MIN, auth } from "@/lib/auth/auth";
import { CODE_LENGTH } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { invalid } from "@/lib/errors";

const schema = z
  .object({
    email: z.string().trim().email("Enter a valid email address.").max(254),
    code: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().length(CODE_LENGTH, `Enter the ${CODE_LENGTH}-digit code from the email.`)),
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`),
    confirmPassword: z.string().optional(),
  })
  .refine((v) => v.confirmPassword === undefined || v.confirmPassword === v.password, { path: ["confirmPassword"], message: "The passwords don't match." });

const CODE_PROBLEMS: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  USER_NOT_FOUND: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Ask for a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong tries for that code. Ask for a new one.",
};

/** Sets a new password with the code from the reset email. Every session is signed out; sign in again. */
export const POST = apiRoute("v1.auth.reset_password", { auth: "public" }, async ({ request, ip }) => {
  const { email, code, password } = await readJson(request, schema);
  await rateLimit([{ key: `reset-submit:ip:${ip}`, rule: RULES.resetSubmitByIp }]);
  try {
    await auth.api.resetPasswordEmailOTP({ body: { email: email.toLowerCase(), otp: code, password }, headers: request.headers });
  } catch (error) {
    const c = authErrorCode(error) ?? "";
    if (CODE_PROBLEMS[c]) throw invalid(CODE_PROBLEMS[c], { code: CODE_PROBLEMS[c] });
    if (c === "PASSWORD_TOO_SHORT" || c === "PASSWORD_TOO_LONG") throw invalid("Please check the highlighted fields.", { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` });
    throw error;
  }
  return { message: "Your password is changed. Sign in with the new one." };
});

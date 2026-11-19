import { z } from "zod";
import { authErrorCode } from "@/lib/api/auth-errors";
import { apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { sessionResponse } from "@/lib/api/session-response";
import { auth } from "@/lib/auth/auth";
import { CODE_LENGTH } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { AppError, invalid } from "@/lib/errors";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().length(CODE_LENGTH, `Enter the ${CODE_LENGTH}-digit code from the email.`)),
});

const CODE_PROBLEMS: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  USER_NOT_FOUND: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send yourself a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong tries for that code. Send yourself a new one.",
};

/**
 * Confirms a new account's email with the code from the email (after sign-up, or after signing in
 * unconfirmed), and signs in: the same answer as POST /auth/sign-in. Each code dies after 5 wrong tries.
 */
export const POST = apiRoute("v1.auth.verify_email", { auth: "public" }, async ({ request, ip }) => {
  const { email, code } = await readJson(request, schema);
  await rateLimit([{ key: `code-check:ip:${ip}`, rule: RULES.codeCheckByIp }]);
  try {
    const result = await auth.api.verifyEmailOTP({ body: { email, otp: code }, headers: request.headers });
    if (!result.token) throw new AppError("INTERNAL_ERROR");
    return sessionResponse(result.token, result.user);
  } catch (error) {
    const problem = CODE_PROBLEMS[authErrorCode(error) ?? ""];
    if (problem) throw invalid(problem, { code: problem });
    throw error;
  }
});

import { z } from "zod";
import { authErrorCode } from "@/lib/api/auth-errors";
import { apiRoute, created, rateLimit, readJson } from "@/lib/api/http";
import { PASSWORD_MAX, PASSWORD_MIN, auth } from "@/lib/auth/auth";
import { CODE_LENGTH } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { AppError, invalid } from "@/lib/errors";
import { ACCOUNT_INTENTS } from "@/lib/intents";

const schema = z
  .object({
    name: z.string().trim().min(1, "Tell us your name.").max(120),
    email: z.string().trim().email("Enter a valid email address.").max(254),
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`),
    /** The password typed again (the app checks too). Older apps don't send it. */
    confirmPassword: z.string().optional(),
    intent: z.enum(ACCOUNT_INTENTS).optional(),
  })
  .refine((v) => v.confirmPassword === undefined || v.confirmPassword === v.password, { path: ["confirmPassword"], message: "The passwords don't match." });

/**
 * Creates an account. As on the website, nothing says whether the email was already
 * registered (the owner is emailed instead), and the account can't sign in until its email is
 * confirmed: a code is emailed, which the app sends to POST /auth/verify-email (that signs in).
 */
export const POST = apiRoute("v1.auth.sign_up", { auth: "public" }, async ({ request, ip }) => {
  const parsed = await readJson(request, schema);
  const input = { name: parsed.name, email: parsed.email, password: parsed.password, intent: parsed.intent };
  await rateLimit([{ key: `sign-up:ip:${ip}`, rule: RULES.signUpByIp }]);
  try {
    await auth.api.signUpEmail({ body: input, headers: request.headers });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") throw invalid("Please check the highlighted fields.", { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` });
    if (code === "TOO_MANY_REQUESTS") throw new AppError("RATE_LIMITED");
    throw error;
  }
  return created({ message: `We've emailed a ${CODE_LENGTH}-digit code to confirm your address. Type it in the app to finish.`, next: "code" });
});

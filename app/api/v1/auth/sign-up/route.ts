import { z } from "zod";
import { authErrorCode } from "@/lib/api/auth-errors";
import { apiRoute, created, rateLimit, readJson } from "@/lib/api/http";
import { PASSWORD_MAX, PASSWORD_MIN, auth } from "@/lib/auth/auth";
import { RULES } from "@/lib/auth/rate-limit";
import { AppError, invalid } from "@/lib/errors";
import { ACCOUNT_INTENTS } from "@/lib/intents";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`),
  intent: z.enum(ACCOUNT_INTENTS).optional(),
});

/**
 * Creates an account. As on the website, nothing says whether the email was already
 * registered (the owner is emailed instead), and the account can't sign in until the
 * confirmation link in the email is opened.
 */
export const POST = apiRoute("v1.auth.sign_up", { auth: "public" }, async ({ request, ip }) => {
  const input = await readJson(request, schema);
  await rateLimit([{ key: `sign-up:ip:${ip}`, rule: RULES.signUpByIp }]);
  try {
    await auth.api.signUpEmail({ body: { ...input, callbackURL: "/welcome" }, headers: request.headers });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") throw invalid("Please check the highlighted fields.", { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` });
    if (code === "TOO_MANY_REQUESTS") throw new AppError("RATE_LIMITED");
    throw error;
  }
  return created({ message: "Check your email: we've sent a link to confirm your address. Open it, then sign in." });
});

import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiResponse, apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { authErrorCode } from "@/lib/api/auth-errors";
import { auth } from "@/lib/auth/auth";
import { RULES } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254),
  // No length rules on sign-in: a length hint would describe the policy to a guesser.
  password: z.string().min(1, "Enter your password.").max(512),
});

/**
 * Signs in with email and password and returns a session token. The app keeps it in secure
 * storage and sends it as `Authorization: Bearer <token>`. Same rules as the website: the email
 * must be confirmed, suspended accounts can't sign in, and attempts are rate-limited.
 */
export const POST = apiRoute("v1.auth.sign_in", { auth: "public" }, async ({ request, ip }) => {
  const { email, password } = await readJson(request, schema);
  await rateLimit([
    { key: `sign-in:ip:${ip}`, rule: RULES.signInByIp },
    { key: `sign-in:email:${email.toLowerCase()}`, rule: RULES.signInByEmail },
  ]);
  let signedIn: Awaited<ReturnType<typeof auth.api.signInEmail>>;
  try {
    signedIn = await auth.api.signInEmail({ body: { email, password, rememberMe: true, callbackURL: "/welcome" }, headers: request.headers });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_EMAIL_OR_PASSWORD") throw new AppError("UNAUTHORIZED", "That email and password do not match.");
    if (code === "EMAIL_NOT_VERIFIED") {
      // Only reachable with the right password, so it tells a guesser nothing.
      return new ApiResponse({ error: { code: "FORBIDDEN", reason: "EMAIL_NOT_VERIFIED", message: "Please confirm your email first. We've just sent you a fresh link." } }, 403);
    }
    if (code === "ACCOUNT_SUSPENDED") {
      return new ApiResponse({ error: { code: "FORBIDDEN", reason: "ACCOUNT_SUSPENDED", message: "This account is suspended. If you think this is a mistake, contact Trustbrick support." } }, 403);
    }
    if (code === "TOO_MANY_REQUESTS") throw new AppError("RATE_LIMITED");
    throw error;
  }
  const { rows } = await db.execute(sql`
    SELECT s.expires_at, u.reference_id FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id WHERE s.token = ${signedIn.token}`);
  const r = rows[0] as { expires_at: string; reference_id: string };
  return {
    token: signedIn.token,
    expiresAt: new Date(r.expires_at).toISOString(),
    user: { referenceId: r.reference_id, name: signedIn.user.name, email: signedIn.user.email },
  };
});

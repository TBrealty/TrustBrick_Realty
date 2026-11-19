import { sql } from "drizzle-orm";
import { z } from "zod";
import { apiRoute, rateLimit, readJson } from "@/lib/api/http";
import { auth } from "@/lib/auth/auth";
import { CODE_MINUTES } from "@/lib/auth/form";
import { RULES } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { log } from "@/lib/log";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address.").max(254) });

/**
 * A new code to confirm an email, at most once a minute. Sent only to an account that still needs
 * confirming; the answer is the same either way.
 */
export const POST = apiRoute("v1.auth.resend_code", { auth: "public" }, async ({ request, ip }) => {
  const email = (await readJson(request, schema)).email.toLowerCase();
  await rateLimit([
    { key: `code-send:email:${email}:minute`, rule: RULES.codeResendByEmail },
    { key: `code-send:email:${email}`, rule: RULES.codeSendByEmail },
    { key: `resend:ip:${ip}`, rule: RULES.resetRequestByIp },
  ]);
  const pending = await db.execute(sql`SELECT 1 FROM identity.users WHERE email = ${email} AND NOT email_verified`);
  if (pending.rows[0]) {
    try {
      await auth.api.sendVerificationOTP({ body: { email, type: "email-verification" }, headers: request.headers });
    } catch (error) {
      log.error("api.resend_code_failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { message: `If that address still needs confirming, a new code is on its way. It expires in ${CODE_MINUTES} minutes.` };
});

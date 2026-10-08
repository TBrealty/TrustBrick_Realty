import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/lib/db";
import { accounts, rateLimits, sessions, users, verifications } from "@/lib/db/schema/identity";
import { sendEmail } from "@/lib/email/send";
import { existingAccountMessage, resetPasswordMessage, verifyEmailMessage } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { isAccountIntent } from "@/lib/intents";

import { PASSWORD_MAX, PASSWORD_MIN } from "./form";

export { PASSWORD_MAX, PASSWORD_MIN };

const url = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();

/**
 * Email is sent without awaiting delivery. Awaiting would make "account exists" and
 * "account does not exist" responses take measurably different times, which leaks
 * exactly what the rest of the flow is careful to hide.
 */
function dispatch(message: Parameters<typeof sendEmail>[0]) {
  void sendEmail(message).catch((error) => console.error("[email] send failed", error));
}

export const auth = betterAuth({
  appName: "Trustbrick",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
  }),

  advanced: {
    // Time-ordered UUIDs keep B-tree inserts local as tables grow (decision D9).
    database: { generateId: () => uuidv7() },
    // Without a client IP, rate limits collapse into one shared bucket, letting a single
    // attacker lock everyone out. The fronting proxy must overwrite this header.
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },

  user: {
    additionalFields: {
      intent: { type: "string", required: false, input: true },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    // Signing up never signs you in: the account is unusable until the email is confirmed.
    autoSignIn: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 30 * 60,
    sendResetPassword: async ({ user, url: resetUrl }) => {
      dispatch(resetPasswordMessage(user.email, resetUrl));
    },
    onExistingUserSignUp: async ({ user }) => {
      dispatch(existingAccountMessage(user.email, url("/login"), url("/forgot-password")));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Logging in unverified (with the right password) sends a fresh link.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 24 * 60 * 60,
    sendVerificationEmail: async ({ user, url: verifyUrl }) => {
      dispatch(verifyEmailMessage(user.email, user.name, verifyUrl));
    },
  },

  // Tokens are stored hashed: a leaked database row cannot be replayed as a reset link.
  verification: { storeIdentifier: "hashed" },

  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/send-verification-email": { window: 15 * 60, max: 5 },
      "/reset-password": { window: 15 * 60, max: 10 },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // A suspended account cannot start a session. Suspension also deletes existing
        // sessions, so this closes the door rather than relying on the next page load.
        // It runs only after the password was accepted, so it tells a guesser nothing.
        before: async (session) => {
          const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId));
          if (row?.status !== "active") {
            throw new APIError("FORBIDDEN", { code: "ACCOUNT_SUSPENDED", message: "This account is suspended." });
          }
        },
      },
    },
    user: {
      create: {
        // The API accepts `intent` from the client, so never trust it: anything
        // outside the shared vocabulary is dropped rather than rejected.
        before: async (user) => ({
          data: { ...user, intent: isAccountIntent(user.intent) ? user.intent : null },
        }),
      },
    },
  },

  plugins: [
    // The mobile app sends its session token as `Authorization: Bearer …` instead of a cookie.
    // It's the same session (same table, expiry and revocation), so every check applies.
    bearer(),
    // Must stay last: lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

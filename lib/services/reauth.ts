import "server-only";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { RULES, isLimited, limit } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema/identity";
import { AppError, invalid } from "@/lib/errors";

/**
 * Re-authentication for sensitive SuperAdmin actions: the actor types their password again.
 * A stolen session cookie alone is then not enough to create admins or change permissions.
 * Failed attempts are rate-limited per user, so it cannot become a password oracle.
 */
export async function confirmPassword(userId: string, password: unknown): Promise<void> {
  if (typeof password !== "string" || password.length === 0) {
    throw invalid("Enter your password to confirm.", { password: "Enter your password to confirm" });
  }
  // Only wrong passwords count towards the limit, so a busy SuperAdmin is never locked out,
  // but once the limit is reached even the right password is refused until the window passes.
  const key = `reauth:user:${userId}`;
  if (await isLimited(key, RULES.reauthByUser)) throw new AppError("RATE_LIMITED");

  const [account] = await db
    .select({ hash: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  const ok = account?.hash ? await verifyPassword({ hash: account.hash, password }) : false;
  if (!ok) {
    const limited = await limit([{ key, rule: RULES.reauthByUser }]);
    if (limited.limited) throw new AppError("RATE_LIMITED");
    throw invalid("That password is not correct.", { password: "That password is not correct" });
  }
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/form";
import { RULES, limit } from "@/lib/auth/rate-limit";
import type { Tx } from "@/lib/db";
import { AppError, invalid, notFound } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";

/**
 * What admin and agent invitations share: one-time tokens stored only as SHA-256 hashes,
 * a 72-hour lifetime, and the rule for whose account accepts (docs/portals/README.md §11).
 */
export const INVITATION_TTL_HOURS = 72;
export const newInvitationToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export type AcceptInput = { sessionUserId: string | null; name?: unknown; password?: unknown; ipKey: string };

export const acceptNewAccountSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`),
});

export async function guardAcceptance(token: string, ipKey: string) {
  const limited = await limit([{ key: `invite-accept:ip:${ipKey}`, rule: RULES.inviteAcceptByIp }]);
  if (limited.limited) throw new AppError("RATE_LIMITED");
  if (!isTokenShape(token)) throw notFound("This invitation link is not valid.");
}

/**
 * The account that accepts an invitation. Someone who already has an account must be logged
 * in as the invited email; otherwise the account is created here with its email already
 * confirmed, because the emailed token proves it.
 */
export async function resolveInvitedAccount(
  tx: Tx,
  email: string,
  input: AcceptInput,
): Promise<{ userId: string; referenceId: string; createdAccount: boolean }> {
  const existing = await tx.execute(sql`SELECT id, reference_id, status FROM identity.users WHERE email = ${email}`);
  const user = existing.rows[0] as Record<string, unknown> | undefined;
  if (user) {
    if (input.sessionUserId !== String(user.id)) throw new AppError("UNAUTHORIZED", `Log in as ${email} to accept this invitation.`);
    if (user.status !== "active") throw new AppError("FORBIDDEN");
    return { userId: String(user.id), referenceId: String(user.reference_id), createdAccount: false };
  }
  const parsed = acceptNewAccountSchema.safeParse({ name: input.name, password: input.password });
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  const userId = uuidv7();
  const created = await tx.execute(sql`
    INSERT INTO identity.users (id, name, email, email_verified) VALUES (${userId}, ${parsed.data.name}, ${email}, true) RETURNING reference_id`);
  await tx.execute(sql`
    INSERT INTO identity.accounts (id, user_id, provider_id, account_id, password)
    VALUES (${uuidv7()}, ${userId}, 'credential', ${userId}, ${await hashPassword(parsed.data.password)})`);
  return { userId, referenceId: String((created.rows[0] as Record<string, unknown>).reference_id), createdAccount: true };
}

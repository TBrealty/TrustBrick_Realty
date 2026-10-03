import "server-only";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import type { Actor } from "@/lib/authz/actor";
import { actorForAction, requestContext } from "@/lib/authz/session";
import { db } from "@/lib/db";
import { AppError, type ActionResult, failure, internalFailure } from "@/lib/errors";
import { log } from "@/lib/log";
import type { RequestContext } from "@/lib/services/audit";

/**
 * Every workspace server action goes through here: the actor is resolved from the session
 * (never from the request), the request context is captured for the audit trail, AppErrors
 * become typed results, authorization failures are logged, and anything unexpected becomes a
 * generic error without leaking internals. redirect() and notFound() pass straight through.
 */
export async function runAction<T>(
  name: string,
  fn: (actor: Actor, ctx: RequestContext) => Promise<T>,
  options: { revalidate?: string[] } = {},
): Promise<ActionResult<T>> {
  let actor: Actor | null = null;
  try {
    actor = await actorForAction();
    const ctx = await requestContext();
    const data = await fn(actor, ctx);
    for (const path of options.revalidate ?? []) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
        log.warn("authz.denied", { action: name, actor: actor?.userReferenceId ?? null, code: error.code });
      }
      return failure(error);
    }
    log.error("action.failed", { action: name, actor: actor?.userReferenceId ?? null, error: error instanceof Error ? error.message : String(error) });
    return internalFailure();
  }
}

/** FormData → plain object; repeated keys become arrays. */
export function formObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    if (key in out) out[key] = ([] as unknown[]).concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

export const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

/**
 * For actions taken outside a workspace: a customer applying, enquiring or reporting, or
 * someone accepting an invitation. Same error handling as runAction; the caller decides
 * whether a session is required.
 */
export async function runPersonAction<T>(
  name: string,
  fn: (person: { userId: string; email: string; name: string; referenceId: string } | null, ctx: RequestContext) => Promise<T>,
  options: { revalidate?: string[]; requireSession?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const session = await getSession();
    if (options.requireSession !== false && !session) throw new AppError("UNAUTHORIZED");
    const person = session
      ? { userId: session.user.id, email: session.user.email, name: session.user.name, referenceId: await userReference(session.user.id) }
      : null;
    const data = await fn(person, await requestContext());
    for (const path of options.revalidate ?? []) revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) return failure(error);
    log.error("action.failed", { action: name, error: error instanceof Error ? error.message : String(error) });
    return internalFailure();
  }
}

async function userReference(userId: string): Promise<string> {
  const { rows } = await db.execute(sql`SELECT reference_id FROM identity.users WHERE id = ${userId}`);
  return String((rows[0] as { reference_id: string }).reference_id);
}

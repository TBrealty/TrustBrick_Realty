import "server-only";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { auth } from "@/lib/auth/auth";
import { RULES, limit } from "@/lib/auth/rate-limit";
import { type Actor, type Workspace, loadActor, loadWorkspaces } from "@/lib/authz/actor";
import { WORKSPACE_HEADER } from "@/lib/authz/session";
import { db } from "@/lib/db";
import { AppError, type ErrorCode, invalid } from "@/lib/errors";
import { fieldErrorsFrom } from "@/lib/listings/onboarding-schema";
import { log } from "@/lib/log";
import type { RequestContext } from "@/lib/services/audit";
import { schedulePushDelivery } from "@/lib/services/push";

/**
 * The JSON API for the Trustbrick app (/api/v1). Each route is a thin shell over the same
 * services the website uses, so rules, permissions and the audit trail are shared.
 *
 * - Auth: `Authorization: Bearer <token>` from /api/v1/auth/sign-in (or the website's cookie).
 * - Workspace: agents, hosts and staff pick one with the `X-Trustbrick-Workspace` header (a
 *   membership ID from /api/v1/me); with only one, it's used without asking.
 * - Success: `{ data }`. Failure: `{ error: { code, message, fieldErrors? } }` with the matching
 *   HTTP status. Nothing internal (SQL, stack traces) is ever returned.
 * - Paths in responses (photos, links) are relative to the API's origin.
 */

export const API_VERSION = "1";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export type ApiPerson = { userId: string; sessionId: string; email: string; name: string; referenceId: string };

export type ApiContext<P> = {
  request: Request;
  url: URL;
  params: P;
  /** The signed-in person, or null (only on routes that allow that). */
  person: ApiPerson | null;
  requestContext: RequestContext;
  ip: string;
  /** The workspace actor, for agent, host and staff routes. Throws when there isn't one. */
  actor: () => Promise<Actor>;
  /** Every workspace the person belongs to. */
  workspaces: () => Promise<Workspace[]>;
};

type AuthMode = "public" | "optional" | "user";

/** A response with a status other than 200, or headers of its own. */
export class ApiResponse {
  constructor(
    readonly body: unknown,
    readonly status = 200,
    readonly headers: Record<string, string> = {},
  ) {}
}
export const created = (data: unknown) => new ApiResponse({ data }, 201);

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Trustbrick-Api": API_VERSION, ...headers } });

export function errorResponse(error: AppError, headers: Record<string, string> = {}) {
  return json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } }, STATUS[error.code], headers);
}

export function clientIpFrom(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** The signed-in person, from the bearer token (or the website's cookie). */
export async function personFrom(request: Request): Promise<ApiPerson | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const { rows } = await db.execute(sql`SELECT reference_id FROM identity.users WHERE id = ${session.user.id} AND status = 'active'`);
  const r = rows[0] as { reference_id: string } | undefined;
  if (!r) return null;
  return { userId: session.user.id, sessionId: session.session.id, email: session.user.email, name: session.user.name, referenceId: r.reference_id };
}

/** The workspace the request acts in: the one named in the header, or the only one there is. */
export async function actorFrom(request: Request, userId: string): Promise<Actor> {
  const workspaces = await loadWorkspaces(userId);
  if (workspaces.length === 0) throw new AppError("FORBIDDEN", "This account has no agent, host or Trustbrick workspace.");
  const hint = request.headers.get(WORKSPACE_HEADER);
  const chosen = workspaces.find((w) => w.membershipId === hint) ?? (workspaces.length === 1 ? workspaces[0] : undefined);
  if (!chosen) throw new AppError("FORBIDDEN", `Choose a workspace: send its membership ID in the ${WORKSPACE_HEADER} header.`);
  const actor = await loadActor(userId, chosen.membershipId);
  if (!actor) throw new AppError("FORBIDDEN");
  return actor;
}

/** Reads and checks a JSON body (at most 64 KB). */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw invalid("Send a JSON body (Content-Type: application/json).");
  const text = await request.text();
  if (text.length > 64 * 1024) throw invalid("That request is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw invalid("That isn't valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid("Please check the highlighted fields.", fieldErrorsFrom(parsed.error));
  return parsed.data;
}

/** Applies rate limits; throws RATE_LIMITED with a Retry-After when any is over. */
export async function rateLimit(checks: { key: string; rule: (typeof RULES)[keyof typeof RULES] }[]) {
  const result = await limit(checks);
  if (result.limited) throw new RateLimited(result.retryAfterSeconds);
}
class RateLimited extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("RATE_LIMITED");
  }
}

/**
 * Wraps a route handler: resolves who is asking, runs the handler, and turns its result or
 * error into the API's JSON shape.
 */
export function apiRoute<P extends Record<string, string> = Record<string, never>>(
  name: string,
  options: { auth: AuthMode },
  handler: (c: ApiContext<P>) => Promise<unknown>,
) {
  return async (request: Request, segment?: { params: Promise<P> }): Promise<Response> => {
    let person: ApiPerson | null = null;
    try {
      const params = segment ? await segment.params : ({} as P);
      person = options.auth === "public" ? null : await personFrom(request);
      if (options.auth === "user" && !person) throw new AppError("UNAUTHORIZED");
      const ip = clientIpFrom(request);
      let actorPromise: Promise<Actor> | null = null;
      let workspacesPromise: Promise<Workspace[]> | null = null;
      const result = await handler({
        request,
        url: new URL(request.url),
        params,
        person,
        ip,
        requestContext: { ipAddress: ip === "unknown" ? null : ip, userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null },
        actor: () => {
          if (!person) throw new AppError("UNAUTHORIZED");
          actorPromise ??= actorFrom(request, person.userId);
          return actorPromise;
        },
        workspaces: () => {
          if (!person) return Promise.resolve([]);
          workspacesPromise ??= loadWorkspaces(person.userId);
          return workspacesPromise;
        },
      });
      if (request.method !== "GET") schedulePushDelivery();
      if (result instanceof ApiResponse) return json(result.body, result.status, result.headers);
      if (result instanceof Response) return result;
      return json({ data: result ?? null }, 200);
    } catch (error) {
      if (error instanceof RateLimited) return errorResponse(error, { "Retry-After": String(error.retryAfterSeconds) });
      if (error instanceof AppError) {
        if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") log.warn("api.denied", { route: name, user: person?.referenceId ?? null, code: error.code });
        return errorResponse(error);
      }
      log.error("api.failed", { route: name, user: person?.referenceId ?? null, error: error instanceof Error ? error.message : String(error) });
      return errorResponse(new AppError("INTERNAL_ERROR"));
    }
  };
}

/** Query parameters as the website's filter parser reads them: repeated keys become arrays. */
export function rawParams(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = out[key];
    out[key] = existing === undefined ? value : ([] as string[]).concat(existing, value);
  }
  return out;
}

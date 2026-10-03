import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/lib/db";

/**
 * Why this exists: Better Auth rate-limits requests that arrive through its HTTP
 * router, but server actions call `auth.api.*` directly and bypass that router.
 * Without this, the login form would have no brute-force protection at all.
 *
 * Fixed-window counters in Postgres (identity.rate_limits), so limits hold across
 * app instances. Keys are namespaced (`action:…`) and never collide with Better
 * Auth's own entries in the same table.
 */
type Rule = { max: number; windowSeconds: number };

export const RULES = {
  signInByIp: { max: 5, windowSeconds: 60 },
  signInByEmail: { max: 10, windowSeconds: 15 * 60 },
  signUpByIp: { max: 5, windowSeconds: 10 * 60 },
  resetRequestByIp: { max: 5, windowSeconds: 15 * 60 },
  resetRequestByEmail: { max: 3, windowSeconds: 15 * 60 },
  resetSubmitByIp: { max: 10, windowSeconds: 15 * 60 },
  // Workspace and customer actions.
  reauthByUser: { max: 5, windowSeconds: 15 * 60 },
  inviteAcceptByIp: { max: 10, windowSeconds: 15 * 60 },
  enquiryByUser: { max: 10, windowSeconds: 60 * 60 },
  reportByUser: { max: 10, windowSeconds: 60 * 60 },
  agentApplicationByUser: { max: 3, windowSeconds: 24 * 60 * 60 },
  hostApplicationByUser: { max: 3, windowSeconds: 24 * 60 * 60 },
  bookingByUser: { max: 10, windowSeconds: 60 * 60 },
  messageByUser: { max: 40, windowSeconds: 10 * 60 },
  conversationByUser: { max: 10, windowSeconds: 24 * 60 * 60 },
  contactByIp: { max: 5, windowSeconds: 60 * 60 },
  contactByEmail: { max: 3, windowSeconds: 60 * 60 },
  legalByIp: { max: 5, windowSeconds: 60 * 60 },
  legalByEmail: { max: 3, windowSeconds: 24 * 60 * 60 },
  uploadByUser: { max: 120, windowSeconds: 60 * 60 },
  mapLinkByUser: { max: 60, windowSeconds: 10 * 60 },
} satisfies Record<string, Rule>;

export type RateLimitResult = { limited: false } | { limited: true; retryAfterSeconds: number };

async function hit(key: string, rule: Rule): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;

  // One atomic statement: concurrent requests cannot both read "under the limit".
  const result = await db.execute<{ count: number; last_request: string }>(sql`
    INSERT INTO identity.rate_limits (id, key, count, last_request)
    VALUES (${uuidv7()}, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN identity.rate_limits.last_request <= ${now - windowMs} THEN 1
                   ELSE identity.rate_limits.count + 1 END,
      last_request = CASE WHEN identity.rate_limits.last_request <= ${now - windowMs} THEN ${now}
                          ELSE identity.rate_limits.last_request END
    RETURNING count, last_request
  `);

  const row = result.rows[0];
  if (!row || row.count <= rule.max) return { limited: false };
  const windowStart = Number(row.last_request);
  return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
}

/**
 * The client address. Behind a proxy, x-forwarded-for is only trustworthy if the
 * proxy overwrites it; that is a deployment requirement, recorded in the README.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** Checks every key; the request is limited if any one of them is over its rule. */
export async function limit(checks: { key: string; rule: Rule }[]): Promise<RateLimitResult> {
  let worst: RateLimitResult = { limited: false };
  for (const { key, rule } of checks) {
    const result = await hit(`action:${key}`, rule);
    if (result.limited && (!worst.limited || result.retryAfterSeconds > worst.retryAfterSeconds)) worst = result;
  }
  return worst;
}

/** Whether a key is currently over its rule, without counting this request. */
export async function isLimited(key: string, rule: Rule): Promise<boolean> {
  const result = await db.execute<{ count: number; last_request: string }>(sql`
    SELECT count, last_request FROM identity.rate_limits WHERE key = ${`action:${key}`}`);
  const row = result.rows[0];
  if (!row) return false;
  return Number(row.last_request) > Date.now() - rule.windowSeconds * 1000 && row.count >= rule.max;
}

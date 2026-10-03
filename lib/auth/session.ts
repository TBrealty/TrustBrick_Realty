import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

/** The current session, read once per request however many components ask. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** For pages that need a signed-in user. Sends everyone else to log in, then back. */
export async function requireSession(returnTo: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/**
 * Only same-site relative paths are allowed as post-login destinations.
 * Rejects `//evil.com` and `/\evil.com`, which browsers treat as other origins.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

/** Better Auth's error code from a failed `auth.api.*` call, as the website's auth actions read it. */
export function authErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as { body?: { code?: string }; status?: string; statusCode?: number };
  if (e.statusCode === 429 || e.status === "TOO_MANY_REQUESTS") return "TOO_MANY_REQUESTS";
  return e.body?.code;
}

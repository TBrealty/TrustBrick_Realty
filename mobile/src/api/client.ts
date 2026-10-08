import { API_ORIGIN } from "@/config";

/**
 * The one way the app talks to Trustbrick: /api/v1 on the website's server (see
 * docs/mobile-api.md in the repository). Adds the session token, unwraps `{ data }`, and turns
 * `{ error }` into an ApiError the screens can show.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly reason?: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

let token: string | null = null;
let workspace: string | null = null;
let onSignedOut: (() => void) | null = null;

export function setSessionToken(value: string | null) {
  token = value;
}

/** In partner mode, the workspace (membership ID) every request acts in. */
export function setWorkspace(membershipId: string | null) {
  workspace = membershipId;
}
export const hasSession = () => token !== null;

/** Called when the server says the session is over (expired, signed out elsewhere, revoked). */
export function onSessionEnded(handler: () => void) {
  onSignedOut = handler;
}

/** Headers for requests outside api(): images and files under /media that need the session. */
export const authHeaders = (): Record<string, string> => ({
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...(workspace ? { "x-trustbrick-workspace": workspace } : {}),
});

/** A path from the API (photo, media file) as a full URL. */
export const assetUrl = (path: string | null | undefined): string | undefined =>
  !path ? undefined : /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;

type Options = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const sentToken = token;
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(sentToken ? { authorization: `Bearer ${sentToken}` } : {}),
        ...(workspace ? { "x-trustbrick-workspace": workspace } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK", "Can't reach Trustbrick. Check your connection and try again.");
  }

  let json: { data?: T; error?: { code?: string; message?: string; reason?: string; fieldErrors?: Record<string, string> } };
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, "INTERNAL_ERROR", "Something went wrong on our side. Please try again.");
  }
  if (!response.ok) {
    const e = json.error ?? {};
    // Only a token we sent can have ended; a wrong password on sign-in is also a 401.
    if (response.status === 401 && sentToken && sentToken === token) onSignedOut?.();
    throw new ApiError(response.status, e.code ?? "INTERNAL_ERROR", e.message ?? "Something went wrong. Please try again.", e.reason, e.fieldErrors);
  }
  return json.data as T;
}

/** Query string from an object; arrays repeat the key, empty values are left out. */
export function query(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => q.append(key, v));
    else q.set(key, value === true ? "1" : String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

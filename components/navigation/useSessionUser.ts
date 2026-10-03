"use client";

import { useEffect, useState } from "react";

export type SessionUser = { name: string; email: string; hasWorkspace?: boolean };

export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

/**
 * The logged-in user, checked in the browser so the landing page can stay
 * statically prerendered. While loading, the header shows the logged-out state,
 * which is right for most visitors and avoids a flash.
 *
 * A plain fetch rather than the Better Auth client keeps auth code out of the
 * landing page bundle.
 */
export function useSessionUser(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { name?: string; email?: string }; hasWorkspace?: boolean } | null) => {
        const user = data?.user;
        setState(
          user?.email ? { status: "authenticated", user: { name: user.name ?? "", email: user.email, hasWorkspace: Boolean(data?.hasWorkspace) } } : { status: "anonymous" },
        );
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name !== "AbortError") setState({ status: "anonymous" });
      });
    return () => controller.abort();
  }, []);

  return state;
}

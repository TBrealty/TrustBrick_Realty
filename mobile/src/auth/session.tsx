import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, onSessionEnded, setSessionToken, setWorkspace } from "@/api/client";
import type { Me, SignInResult } from "@/api/types";
import { registerForPush, unregisterPush } from "@/push";
import { prefs, tokenStore } from "./storage";

type Status = "loading" | "signedOut" | "signedIn";
export type Mode = "customer" | "partner";

type Session = {
  status: Status;
  me: Me | undefined;
  /** Customer (browsing, booking) or partner (an agent's or host's work, in a workspace). */
  mode: Mode;
  /** The workspace partner mode acts in (a membership ID). */
  workspace: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => void;
  switchMode: (mode: Mode, workspace?: string | null) => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);
const MODE_KEY = "mode";

/**
 * Who is signed in, and which side of the app they're using. The token and the mode are read
 * from secure storage once at start; `me` (profile, plan, workspaces, unread counts) comes from /me.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("customer");
  const [workspace, setWorkspaceState] = useState<string | null>(null);

  const applyMode = useCallback(async (next: Mode, membershipId: string | null) => {
    setWorkspace(next === "partner" ? membershipId : null);
    setWorkspaceState(next === "partner" ? membershipId : null);
    setMode(next);
    if (next === "partner") await prefs.set(MODE_KEY, JSON.stringify({ mode: next, workspace: membershipId }));
    else await prefs.clear(MODE_KEY);
  }, []);

  const forget = useCallback(async () => {
    setSessionToken(null);
    await tokenStore.clear();
    await applyMode("customer", null);
    queryClient.clear();
    setStatus("signedOut");
  }, [queryClient, applyMode]);

  useEffect(() => {
    onSessionEnded(() => void forget());
    (async () => {
      const [token, saved] = await Promise.all([tokenStore.get(), prefs.get(MODE_KEY)]);
      setSessionToken(token);
      if (token && saved) {
        try {
          const m = JSON.parse(saved) as { mode: Mode; workspace: string | null };
          if (m.mode === "partner") {
            setWorkspace(m.workspace);
            setWorkspaceState(m.workspace);
            setMode("partner");
          }
        } catch {}
      }
      setStatus(token ? "signedIn" : "signedOut");
      if (token) void registerForPush();
    })();
  }, [forget]);

  const meQuery = useQuery({ queryKey: ["me", workspace], queryFn: () => api<Me>("/me"), enabled: status === "signedIn", staleTime: 30_000 });

  // If the remembered workspace is gone (membership ended), the app is back in customer mode.
  const me = meQuery.data;
  const effectiveMode: Mode = mode === "partner" && me && !me.workspaces.some((w) => w.membershipId === workspace) ? "customer" : mode;

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api<SignInResult>("/auth/sign-in", { method: "POST", body: { email, password } });
      setSessionToken(result.token);
      await tokenStore.set(result.token);
      queryClient.clear();
      setStatus("signedIn");
      void registerForPush();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await unregisterPush();
    try {
      await api("/auth/sign-out", { method: "POST" });
    } catch {}
    await forget();
  }, [forget]);

  const switchMode = useCallback(
    async (next: Mode, membershipId: string | null = null) => {
      await applyMode(next, membershipId);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [applyMode, queryClient],
  );

  const value = useMemo<Session>(
    () => ({ status, me, mode: effectiveMode, workspace, signIn, signOut, switchMode, refreshMe: () => void meQuery.refetch() }),
    [status, me, effectiveMode, workspace, signIn, signOut, switchMode, meQuery],
  );
  // Screens wait for the saved session (a quick read), so nothing loads signed-out by mistake.
  return <SessionContext.Provider value={value}>{status === "loading" ? null : children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

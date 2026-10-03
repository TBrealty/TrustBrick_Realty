"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useTransition } from "react";

type Ctx = { pending: boolean; navigate: (params: URLSearchParams) => void };

const BrowseContext = createContext<Ctx | null>(null);

/**
 * Filters and sorting both change the URL. Sharing one transition lets the results
 * dim while the next set loads, instead of the page appearing frozen.
 */
export function BrowseTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (params: URLSearchParams) => {
      params.delete("cursor");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  return <BrowseContext.Provider value={{ pending, navigate }}>{children}</BrowseContext.Provider>;
}

export function useBrowse() {
  const ctx = useContext(BrowseContext);
  if (!ctx) throw new Error("useBrowse must be used inside <BrowseTransition>");
  return ctx;
}

export function PendingResults({ children }: { children: React.ReactNode }) {
  const { pending } = useBrowse();
  return (
    <div aria-busy={pending} className={`transition-opacity duration-300 ${pending ? "pointer-events-none opacity-50" : "opacity-100"}`}>
      {children}
    </div>
  );
}

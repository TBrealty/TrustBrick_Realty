import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/authz/session";
import { ROLES } from "@/lib/authz/catalog";
import { safeRedirectPath } from "@/lib/auth/session";
import { chooseWorkspaceAction } from "./actions";

export const metadata: Metadata = { title: "Choose a workspace · Trustbrick", robots: { index: false } };

/**
 * People with more than one membership pick where to work. Deliberately outside the
 * workspace route group, whose layout sends undecided users here.
 */
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await getWorkspaceContext();
  const next = safeRedirectPath((await searchParams).next);
  if (ctx.state === "anonymous") redirect(`/login?next=${encodeURIComponent("/workspaces")}`);
  if (ctx.state === "customer") redirect("/account/profile");
  const current = ctx.state === "ready" ? ctx.actor.membershipId : null;

  return (
    <main className="grid grid-cols-1 min-h-svh place-items-center bg-paper px-4 py-16 text-ink">
      <div className="w-full max-w-lg">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Choose a workspace</h1>
        <p className="mt-2 text-[0.875rem] text-stone-deep">You belong to more than one. You can switch any time from the menu.</p>
        <ul className="mt-6 space-y-3">
          {ctx.workspaces.map((w) => (
            <li key={w.membershipId}>
              <form action={chooseWorkspaceAction}>
                <input type="hidden" name="membershipId" value={w.membershipId} />
                <input type="hidden" name="next" value={next} />
                <button type="submit" className="wcard flex w-full items-center justify-between gap-4 p-4 text-left hover:border-ink/40">
                  <span>
                    <span className="block text-[0.9375rem] font-medium">{w.organization.name}</span>
                    <span className="block text-[0.8125rem] text-stone-deep">
                      {w.kind === "platform" ? "Platform workspace" : "Professional workspace"} · {w.roles.map((r) => ROLES[r]?.name ?? r).join(", ")}
                    </span>
                  </span>
                  <span className="text-[0.8125rem] text-stone-deep">{w.membershipId === current ? "Current" : "Open →"}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

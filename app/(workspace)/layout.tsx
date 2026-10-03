import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/workspace/icons";
import { cookies } from "next/headers";
import { SIDEBAR_COOKIE, Shell } from "@/components/workspace/Shell";
import { can } from "@/lib/authz";
import { ROLES } from "@/lib/authz/catalog";
import { getWorkspaceContext, requireActor } from "@/lib/authz/session";
import { unreadCount } from "@/lib/services/notifications";
import { navigationFor } from "@/lib/workspace/nav";

export const metadata: Metadata = {
  title: { template: "%s · Trustbrick workspace", default: "Trustbrick workspace" },
  robots: { index: false, follow: false },
};

/**
 * Every authenticated workspace page lives in this route group, so no role name ever
 * appears in a URL. Which workspace renders is decided here, on the server, from the
 * session and live memberships. Each page still checks its own permission.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("/dashboard");
  const ctx = await getWorkspaceContext();
  const [sections, unread, jar] = await Promise.all([navigationFor(actor), unreadCount(actor.userId), cookies()]);
  const roleLabel = actor.staff ? (actor.staff.level === "superadmin" ? "SuperAdmin" : "Admin") : (ROLES[actor.roles[0]]?.name ?? "Member");
  const platformSearch = actor.workspace === "platform" && (can(actor, "users.view", "platform") || can(actor, "listings.view", "platform"));

  return (
    <Shell
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "1"}
      sections={sections}
      user={{ name: actor.name, email: actor.email, referenceId: actor.staff?.referenceId ?? actor.agent?.referenceId ?? actor.userReferenceId, roleLabel }}
      workspace={{ organization: actor.organization.name, kind: actor.workspace, canSwitch: ctx.state === "ready" && ctx.workspaces.length > 1 }}
      topbar={
        <>
          {platformSearch ? (
            <form action="/search" role="search" className="relative w-full max-w-md">
              <label htmlFor="global-search" className="sr-only">
                Search by reference ID, name, email or phone
              </label>
              <span className="pointer-events-none absolute inset-y-0 left-3 grid grid-cols-1 place-items-center text-stone-deep">
                <Icon name="search" className="size-4" />
              </span>
              <input id="global-search" name="q" type="search" placeholder="Search PRP-, AGT-, names, emails…" className="winput pl-9" autoComplete="off" />
            </form>
          ) : (
            <p className="hidden truncate text-[0.8125rem] text-stone-deep sm:block">{actor.organization.name}</p>
          )}
          <Link
            href="/notifications"
            className="relative ml-auto grid grid-cols-1 size-10 shrink-0 place-items-center rounded-[3px] text-graphite hover:bg-ink/5"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Icon name="bell" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-brick px-1 text-center text-[0.625rem] leading-4 font-semibold text-white" aria-hidden>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </>
      }
    >
      {children}
    </Shell>
  );
}

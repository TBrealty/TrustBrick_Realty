"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { LogoMark } from "@/components/brand/Logo";
import type { NavSection } from "@/lib/workspace/nav";
import { Icon } from "./icons";

type ShellUser = { name: string; email: string; referenceId: string; roleLabel: string };
type ShellWorkspace = { organization: string; kind: "platform" | "professional"; canSwitch: boolean };

type Props = {
  sections: NavSection[];
  user: ShellUser;
  workspace: ShellWorkspace;
  topbar: React.ReactNode;
  initialCollapsed: boolean;
  children: React.ReactNode;
};

/** Read by the workspace layout on the server, so a collapsed sidebar never flashes open. */
export const SIDEBAR_COOKIE = "tb_sidebar";

/**
 * The authenticated application frame shared by every workspace. The navigation it renders
 * was already filtered on the server by permission; nothing here decides what anyone may see.
 */
export function Shell({ sections, user, workspace, topbar, initialCollapsed, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Close the mobile drawer on navigation (state adjusted during render, not in an effect).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const opener = openerRef.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [drawerOpen]);

  return (
    // "theme-light" pins the workspace to the light palette until it gets its own dark pass.
    <div className="theme-light min-h-svh bg-paper text-ink lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={`surface-dark sticky top-0 hidden h-svh shrink-0 flex-col border-r border-line-dark bg-ink text-paper transition-[width] duration-200 lg:flex ${collapsed ? "w-[4.25rem]" : "w-64"}`}
        aria-label="Workspace"
      >
        <SidebarContent sections={sections} workspace={workspace} collapsed={collapsed} pathname={pathname} />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex h-11 items-center gap-3 border-t border-line-dark px-5 text-[0.8125rem] text-paper/60 hover:text-paper"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} className="size-4" />
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} />
          <div ref={drawerRef} className="surface-dark absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-ink text-paper shadow-xl">
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={() => setDrawerOpen(false)} className="grid grid-cols-1 size-10 place-items-center text-paper/70 hover:text-paper" aria-label="Close navigation">
                <Icon name="close" />
              </button>
            </div>
            <SidebarContent sections={sections} workspace={workspace} collapsed={false} pathname={pathname} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line-light bg-paper/95 px-3 backdrop-blur-sm sm:px-5 lg:px-8">
          <button
            ref={openerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="grid grid-cols-1 size-10 place-items-center rounded-[3px] text-graphite hover:bg-ink/5 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Icon name="menu" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">{topbar}</div>
          <UserMenu user={user} workspace={workspace} />
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || (pathname.startsWith(`${href}/`) && !(href === "/properties" && pathname === "/properties/new"));
}

function SidebarContent({ sections, workspace, collapsed, pathname }: { sections: NavSection[]; workspace: ShellWorkspace; collapsed: boolean; pathname: string }) {
  return (
    <>
      <div className={`flex h-14 shrink-0 items-center ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <Link href="/dashboard" aria-label="Trustbrick dashboard" className="text-paper">
          <span className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            {!collapsed && (
              <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">
                Trust<span className="text-brick-bright">brick</span>
              </span>
            )}
          </span>
        </Link>
      </div>
      {!collapsed && (
        <div className="mx-3 mb-2 rounded-[3px] bg-paper/6 px-3 py-2.5">
          <p className="text-[0.6875rem] tracking-wide text-paper/50 uppercase">{workspace.kind === "platform" ? "Platform workspace" : "Workspace"}</p>
          <p className="mt-0.5 truncate text-[0.8125rem] font-medium text-paper">{workspace.organization}</p>
          {workspace.canSwitch && (
            <Link href="/workspaces" className="mt-1.5 inline-flex items-center gap-1.5 text-[0.75rem] text-brick-bright hover:underline">
              <Icon name="swap" className="size-3.5" /> Switch workspace
            </Link>
          )}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Main">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className="mt-3 first:mt-1">
            {section.label && !collapsed && <p className="px-3 pb-1 text-[0.6875rem] font-medium tracking-wider text-paper/40 uppercase">{section.label}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={`group flex h-9 items-center gap-3 rounded-[3px] text-[0.8125rem] transition-colors ${collapsed ? "justify-center px-0" : "px-3"} ${
                        active ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/6 hover:text-paper"
                      }`}
                    >
                      <span className={`relative ${active ? "text-brick-bright" : ""}`}>
                        <Icon name={item.icon} />
                        {collapsed && item.badge ? <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-brick-bright" aria-hidden /> : null}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.badge ? (
                        <span className="min-w-5 rounded-full bg-brick px-1.5 py-0.5 text-center text-[0.6875rem] leading-none font-semibold text-paper tabular-nums">
                          {item.badge > 99 ? "99+" : item.badge}
                          <span className="sr-only"> waiting</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

function UserMenu({ user, workspace }: { user: ShellUser; workspace: ShellWorkspace }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const item = "flex w-full items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-[0.8125rem] text-graphite hover:bg-paper hover:text-ink";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-2 rounded-[3px] py-1 pr-1 pl-1 hover:bg-ink/5 sm:pr-2.5"
      >
        <span className="grid grid-cols-1 size-8 place-items-center rounded-full bg-ink text-[0.75rem] font-semibold text-paper" aria-hidden>
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-[0.8125rem] leading-tight font-medium">{user.name}</span>
          <span className="block text-[0.6875rem] leading-tight text-stone-deep">{user.roleLabel}</span>
        </span>
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div id={id} className="wcard absolute top-full right-0 z-50 mt-2 w-72 p-1.5 shadow-lg">
          <div className="border-b border-line-light px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-[0.875rem] font-medium">{user.name}</p>
            <p className="truncate text-[0.75rem] text-stone-deep">{user.email}</p>
            <p className="mt-1 font-mono text-[0.6875rem] text-stone-deep">{user.referenceId}</p>
          </div>
          <div className="py-1">
            <Link href="/profile" className={item} onClick={close}>
              <Icon name="user" className="size-4" /> Profile & security
            </Link>
            <Link href="/notifications" className={item} onClick={close}>
              <Icon name="bell" className="size-4" /> Notifications
            </Link>
            {workspace.canSwitch && (
              <Link href="/workspaces" className={item} onClick={close}>
                <Icon name="swap" className="size-4" /> Switch workspace
              </Link>
            )}
            <Link href="/" className={item} onClick={close}>
              <Icon name="home" className="size-4" /> Trustbrick website
            </Link>
          </div>
          <form action={signOutAction} className="border-t border-line-light pt-1">
            <button type="submit" className={item}>
              <Icon name="logout" className="size-4" /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

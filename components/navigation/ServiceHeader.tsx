import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { UnreadBadge } from "@/components/messages/UnreadBadge";
import { getSession } from "@/lib/auth/session";
import { guestUnreadCount } from "@/lib/services/stays/messages";
import type { ServiceLink, ServiceShell } from "@/lib/listings/services";
import { site } from "@/lib/site";
import { HeaderAccount } from "./HeaderAccount";
import { SectionRow } from "./SectionRow";

/**
 * The header inside a dedicated service. The bar names the service; the row under it
 * holds the service's own sections, then its tools and guides. Nothing links to another
 * service: the logo is the way home, where the other services are.
 */
export async function ServiceHeader({ shell, current }: { shell: ServiceShell; current?: string }) {
  // Home Stay's Messages carries the guest's unread count, as the account area's did.
  const session = shell.kind === "stay" && shell.tools.some((t) => t.key === "messages") ? await getSession() : null;
  const unread = session ? await guestUnreadCount(session.user.id) : null;

  const item = (s: ServiceLink) => (
    <Link
      key={s.key}
      href={s.href}
      aria-current={current === s.key ? "page" : undefined}
      className={`relative flex h-11 shrink-0 items-center whitespace-nowrap text-[0.9375rem] transition-colors duration-200 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:transition-colors ${
        current === s.key ? "font-medium text-ink after:bg-ink" : "text-stone-deep after:bg-transparent hover:text-ink"
      }`}
    >
      {s.label}
      {s.key === "messages" && unread !== null && <UnreadBadge initial={unread} />}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line-light bg-ivory/95 text-ink backdrop-blur-[6px]">
      <div className="shell flex h-(--header-h) items-center gap-3 sm:gap-6">
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* On a phone the mark alone, so the service's name and the account both fit. */}
          <Link href="/" aria-label={`${site.name} — home`} className="-m-2 p-2">
            <LogoMark className="size-7 sm:hidden" />
            <span className="hidden sm:block">
              <Logo tone="brand" markClassName="size-7" />
            </span>
          </Link>
          <span aria-hidden className="h-6 w-px bg-line-light" />
          <Link href={shell.sections[0].href} className="eyebrow text-brick hover:text-ink">
            {shell.label}
          </Link>
        </div>
        <HeaderAccount compact />
      </div>

      <SectionRow
        label={`${shell.label} sections`}
        className="shell flex items-center gap-6 overflow-x-auto border-t border-line-light [scrollbar-width:none] lg:gap-7"
      >
        {shell.sections.map(item)}
        {shell.tools.length > 0 && (
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-line-light lg:ml-auto" />
            {shell.tools.map(item)}
          </>
        )}
      </SectionRow>
    </header>
  );
}

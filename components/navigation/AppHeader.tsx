import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { KIND_META, LISTING_KINDS, type ListingKind } from "@/lib/listings/filters";
import { site } from "@/lib/site";
import { HeaderAccount } from "./HeaderAccount";

/**
 * Header for pages outside the landing page that don't belong to a dedicated service:
 * the services without their own shell yet, the account area, about and contact.
 * Dedicated services (lib/listings/services.ts) use ServiceHeader instead.
 */
export function AppHeader({ active }: { active?: ListingKind }) {
  const nav = LISTING_KINDS.map((kind) => (
    <Link
      key={kind}
      href={KIND_META[kind].path}
      aria-current={active === kind ? "page" : undefined}
      className={`relative whitespace-nowrap py-2 text-[0.9375rem] transition-colors duration-200 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:transition-colors ${
        active === kind ? "font-medium text-ink after:bg-ink" : "text-stone-deep after:bg-transparent hover:text-ink"
      }`}
    >
      {KIND_META[kind].navLabel}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-40 border-b border-line-light bg-ivory/95 text-ink backdrop-blur-[6px]">
      <div className="shell flex h-(--header-h) items-center gap-8">
        <Link href="/" aria-label={`${site.name} — home`} className="-m-2 shrink-0 p-2">
          <Logo tone="brand" markClassName="size-7" />
        </Link>

        <nav aria-label="Browse" className="hidden items-center gap-7 md:flex">
          {nav}
        </nav>

        <HeaderAccount />
      </div>

      {/* On small screens the browse links become a scrollable row under the bar. */}
      <nav aria-label="Browse" className="shell -mt-1 flex gap-6 overflow-x-auto border-t border-line-light [scrollbar-width:none] md:hidden">
        {nav}
      </nav>
    </header>
  );
}

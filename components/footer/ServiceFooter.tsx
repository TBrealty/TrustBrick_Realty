import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeChoicePicker } from "@/components/theme/ThemeChoice";
import { type ServiceShell, otherServices } from "@/lib/listings/services";
import { links, site } from "@/lib/site";

/**
 * The footer inside a dedicated service: the service's own sections and searches first,
 * and, last, one quiet row of the other services — the only way across from here.
 */
export function ServiceFooter({ shell }: { shell: ServiceShell }) {
  const year = new Date().getFullYear();
  const others = otherServices(shell.kind);

  return (
    <footer data-nav="dark" className="surface-dark bg-contrast text-on-contrast">
      <div className="shell pt-14 pb-8 sm:pt-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Link href="/" aria-label={`${site.name} — home`} className="inline-block">
              <Logo tone="brand" markClassName="size-8" />
            </Link>
            <p className="eyebrow mt-6 text-brick-bright">{shell.label}</p>
            <p className="mt-3 max-w-[34ch] text-[0.9375rem] leading-relaxed text-on-contrast/75">{shell.strapline}</p>
          </div>

          <nav aria-label={`${shell.label} sections`} className="lg:col-span-2 lg:col-start-6">
            <p className="eyebrow text-on-contrast/60">{shell.label}</p>
            <ul className="mt-5 space-y-2.5 text-[0.9375rem]">
              {[...shell.sections, ...shell.tools].map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={shell.quickSearchesLabel ?? "Popular searches"} className="lg:col-span-3">
            <p className="eyebrow text-on-contrast/60">{shell.quickSearchesLabel ?? "Popular searches"}</p>
            <ul className="mt-5 space-y-2.5 text-[0.9375rem]">
              {shell.quickSearches.slice(0, 6).map((s) => (
                <li key={s.key}>
                  <Link href={s.href} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Trustbrick" className="lg:col-span-2">
            <p className="eyebrow text-on-contrast/60">Trustbrick</p>
            <ul className="mt-5 space-y-2.5 text-[0.9375rem]">
              <li>
                <Link href={links.about} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                  About us
                </Link>
              </li>
              <li>
                <Link href={links.contact} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                  Contact us
                </Link>
              </li>
              <li>
                <Link href="/" className="link-rule text-on-contrast/80 hover:text-on-contrast">
                  Home
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-line-dark pt-7 lg:flex-row lg:items-end lg:justify-between">
          <nav aria-label="Other services">
            <p className="eyebrow text-on-contrast/60">Other services</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]">
              {others.map((o) => (
                <li key={o.key}>
                  <Link href={o.href} className="link-rule text-on-contrast/70 hover:text-on-contrast">
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeChoicePicker className="text-on-contrast/70" />
        </div>
        <p className="mt-8 text-[0.8125rem] text-on-contrast/60">
          © {year} {site.legalName} All rights reserved.
        </p>
      </div>
    </footer>
  );
}

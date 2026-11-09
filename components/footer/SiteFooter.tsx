import { LogoLockup } from "@/components/brand/LogoLockup";
import { ThemeChoicePicker } from "@/components/theme/ThemeChoice";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { footerNav, links, site } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer id="contact" data-nav="dark" className="relative overflow-hidden border-t border-line-dark bg-contrast text-on-contrast">
      {/* Signature: the word as the footer's background, behind everything else. The content above
          lets the pointer through except on its links and controls, so the hover glow follows the
          pointer across the footer's empty space. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 px-(--gutter) pb-4 sm:pb-6">
        <TextHoverEffect text="Trustbrick" viewBox="0 0 364 96" y={50} fontSize={100} />
      </div>

      <div className="shell pointer-events-none relative z-10 pt-20 sm:pt-28 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_label]:pointer-events-auto [&_select]:pointer-events-auto">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <LogoLockup />
            <p className="display mt-10 max-w-[14ch] text-[clamp(2.25rem,4vw,3.5rem)] leading-[0.95]">
              Real estate, <em>built on trust.</em>
            </p>
            <p className="mt-6 text-[0.875rem] text-on-contrast/55">{site.legalName}</p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7">
            <nav aria-label="Footer">
              <p className="eyebrow text-on-contrast/60">Navigate</p>
              <ul className="mt-6 space-y-3 text-[0.9375rem]">
                {footerNav.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="eyebrow text-on-contrast/60">Legal</p>
              <ul className="mt-6 space-y-3 text-[0.9375rem]">
                <li>
                  <a href={links.privacy} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href={links.terms} className="link-rule text-on-contrast/80 hover:text-on-contrast">
                    Terms
                  </a>
                </li>
              </ul>
            </nav>
            <div className="col-span-2 sm:col-span-1">
              <p className="eyebrow text-on-contrast/60">Follow</p>
              <p className="mt-6 max-w-[22ch] text-[0.9375rem] text-on-contrast/55">Social channels will be announced at launch.</p>
            </div>
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-6 border-t border-line-dark py-7 text-[0.8125rem] text-on-contrast/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.legalName} All rights reserved.
          </p>
          <ThemeChoicePicker className="text-on-contrast/70" />
        </div>
      </div>
    </footer>
  );
}

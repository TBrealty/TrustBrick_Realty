import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogoLockup } from "@/components/brand/LogoLockup";
import { images } from "@/lib/images";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-ivory text-ink lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Pinned to the viewport so the brand panel stays in view while a long form scrolls. */}
      <aside className="surface-dark relative hidden overflow-hidden bg-contrast text-on-contrast lg:sticky lg:top-0 lg:block lg:h-svh lg:self-start">
        <Image src={images.ideaPrimary.src} alt="" fill preload sizes="42vw" placeholder="blur" className="object-cover opacity-70" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-contrast via-contrast/40 to-contrast/10" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <LogoLockup />
          <p className="display mt-10 max-w-[14ch] text-[clamp(2.25rem,3.4vw,3.25rem)] leading-[0.95]">
            Real estate, <em>built on trust.</em>
          </p>
        </div>
      </aside>

      <div className="flex min-h-svh flex-col px-(--gutter) py-6 sm:py-8 lg:px-16 lg:py-10">
        <header className="flex items-center justify-between gap-6">
          <Link href="/" aria-label={`${site.name} — home`} className="-m-2 p-2">
            <Logo tone="brand" markClassName="size-7" />
          </Link>
          <div className="flex items-center gap-5">
            <ThemeToggle />
            <Link href="/" className="link-rule text-[0.875rem] text-stone-deep hover:text-ink">
              Back to home
            </Link>
          </div>
        </header>

        <main className="page-in mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-center py-12 lg:mx-0 lg:py-16">{children}</main>

        <footer className="text-[0.75rem] text-stone-deep">{site.legalName}</footer>
      </div>
    </div>
  );
}

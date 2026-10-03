import { LogoMark } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/buttons/ButtonLink";
import { Lines } from "@/components/typography/Lines";
import { links } from "@/lib/site";

export function FinalCta() {
  return (
    <section id="get-started" aria-labelledby="cta-title" className="relative bg-ivory py-28 text-ink sm:py-36 lg:py-52">
      <div className="shell grid gap-12 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <div data-reveal className="mb-10 text-ink">
            <LogoMark className="size-11" />
          </div>
          <h2 id="cta-title" data-reveal="lines" className="display text-[clamp(3rem,8vw,9rem)]">
            <Lines lines={["Your next property", <>decision <em>starts here.</em></>]} step={130} />
          </h2>
        </div>
        <div data-reveal className="lg:col-span-4 lg:pb-4">
          <p className="max-w-[34ch] text-[1.125rem] leading-relaxed text-graphite">
            Trustbrick is building a smarter, more connected way to experience real estate.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={links.signup} variant="dark" arrow>
              Get Started
            </ButtonLink>
            <ButtonLink href={links.contact} variant="ghost-dark">
              Talk to Trustbrick
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

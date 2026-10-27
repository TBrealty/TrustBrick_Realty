import { ButtonLink } from "@/components/buttons/ButtonLink";
import { Lines } from "@/components/typography/Lines";

const FOR_YOU = ["360° virtual tours and 3D views of homes", "AI locality insights for any property", "Price-drop alerts on homes you've saved", "Money off Legal Verification"];
const FOR_PARTNERS = ["AI locality insights to share with clients", "Featured listings, shown first in search", "Advanced performance analytics"];

/**
 * The plans, advertised on the home page. Static copy (no prices): the plans page has the live
 * figures, so this page never waits on the database.
 */
export function PlansAd() {
  return (
    <section id="plans" aria-labelledby="plans-ad-title" className="surface-dark relative overflow-hidden bg-contrast py-20 text-on-contrast sm:py-24">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-brick/20 blur-3xl" />
      <div className="shell relative grid gap-12 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-6">
          <p data-reveal className="eyebrow flex items-center gap-3 text-brick-bright">
            <span aria-hidden className="h-px w-8 bg-current" />
            Trustbrick plans
          </p>
          <h2 id="plans-ad-title" data-reveal="lines" className="display mt-6 text-[clamp(2.5rem,5.4vw,5rem)]">
            <Lines lines={["See the neighbourhood", <>before <em>you visit.</em></>]} step={130} />
          </h2>
          <p data-reveal className="mt-6 max-w-[44ch] text-[1.0625rem] leading-relaxed text-on-contrast/75">
            AI-powered locality insights and more, for people finding a home and for the agents and hosts who list them. Every paid plan starts with a free trial.
          </p>
          <div data-reveal className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/plans" variant="light" arrow>
              See plans
            </ButtonLink>
            <ButtonLink href="/plans?for=partners" variant="ghost-light">
              For agents & hosts
            </ButtonLink>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-6">
          {[
            { title: "Plus", who: "For you", items: FOR_YOU, href: "/plans?for=you" },
            { title: "Pro & Business", who: "For agents & hosts", items: FOR_PARTNERS, href: "/plans?for=partners" },
          ].map((card) => (
            <a
              key={card.title}
              href={card.href}
              data-reveal
              className="group block rounded-[4px] border border-on-contrast/15 bg-on-contrast/[0.04] p-6 transition-colors hover:border-on-contrast/40"
            >
              <p className="text-[0.75rem] tracking-wide text-on-contrast/60 uppercase">{card.who}</p>
              <p className="mt-1 text-[1.375rem] font-semibold">{card.title}</p>
              <ul className="mt-4 space-y-2 text-[0.9375rem] text-on-contrast/80">
                {card.items.map((i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="text-brick-bright">
                      ✦
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[0.875rem] font-medium">
                Free trial <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

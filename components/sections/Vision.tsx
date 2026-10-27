import { LogoMark } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/buttons/ButtonLink";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";

const PARTICIPANTS = ["Homebuyers", "Renters", "Sellers", "Agents", "Brokers", "Developers", "Property managers", "Investors"];

const ROAD = [
  { name: "Discovery", note: "Find property with information you can act on.", stage: "Live" },
  { name: "Professionals", note: "The agents, brokers and hosts who make it happen.", stage: "Live" },
  { name: "Intelligence", note: "Scores, records and context before you commit.", stage: "Coming soon" },
  { name: "Transactions", note: "Offers, agreements and paperwork in one place.", stage: "Later" },
  { name: "Management", note: "Tenancies, upkeep and portfolios after the move.", stage: "Later" },
  { name: "Finance", note: "The capital that lets real estate move.", stage: "Later" },
] as const;

/**
 * Where Trustbrick is going, in one screen: the idea, who it's for, the road from search to
 * finance (what's live, what's next), and the way in. It replaces the landing page's earlier
 * "idea", "ecosystem" and "road ahead" sections and its closing call to action.
 */
export function Vision() {
  return (
    <section id="vision" aria-labelledby="vision-title" className="relative bg-ivory py-20 text-ink sm:py-24 lg:py-28">
      <div className="shell">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionLabel index="04" className="mb-8 text-stone-deep">
              Where we&rsquo;re going
            </SectionLabel>
            <h2 id="vision-title" data-reveal="lines" className="display text-[clamp(2.5rem,5.4vw,5.75rem)]">
              <Lines lines={["One platform for", <em key="e">the whole journey.</em>]} step={120} />
            </h2>
          </div>
          <div data-reveal className="lg:col-span-5 lg:pb-3">
            <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-graphite">
              A home is a question of people and place; a purchase, of value and trust. Today those pieces live in different
              hands, so big decisions are made with a partial picture. Trustbrick brings them together, from the first search
              to the keys, the tenancy and the financing behind it.
            </p>
            <ul aria-label="Who Trustbrick is for" className="mt-6 flex flex-wrap gap-2">
              {PARTICIPANTS.map((p) => (
                <li key={p} className="rounded-full border border-line-light px-3 py-1 text-[0.8125rem] text-stone-deep">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ol data-reveal className="mt-12 grid gap-px overflow-hidden border border-line-light bg-line-light sm:mt-16 sm:grid-cols-2 lg:grid-cols-6">
          {ROAD.map((step, i) => (
            <li key={step.name} className="bg-ivory p-5 sm:p-6">
              <p className="flex items-center justify-between gap-3">
                <span className="eyebrow tabular-nums text-stone-deep">0{i + 1}</span>
                <span
                  className={`eyebrow flex items-center gap-1.5 ${step.stage === "Live" ? "text-sage" : step.stage === "Coming soon" ? "text-brick" : "text-stone-deep"}`}
                >
                  <span aria-hidden className={`size-1.5 rounded-full ${step.stage === "Later" ? "border border-current" : "bg-current"}`} />
                  {step.stage}
                </span>
              </p>
              <h3 className="display mt-4 text-[1.75rem] leading-none">{step.name}</h3>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-stone-deep">{step.note}</p>
            </li>
          ))}
        </ol>

        <div id="get-started" className="mt-16 grid gap-8 border-t border-line-light pt-12 sm:mt-20 lg:grid-cols-12 lg:items-end">
          <div className="flex items-center gap-5 lg:col-span-7">
            <LogoMark className="size-10 shrink-0" />
            <p data-reveal="lines" className="display text-[clamp(2rem,4vw,3.75rem)] leading-[0.98]">
              <Lines lines={["Your next property", <>decision <em>starts here.</em></>]} step={110} />
            </p>
          </div>
          <div data-reveal className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <ButtonLink href="#top" variant="dark" arrow>
              Search homes
            </ButtonLink>
            <ButtonLink href="/become-an-agent" variant="ghost-dark">
              Become an agent
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

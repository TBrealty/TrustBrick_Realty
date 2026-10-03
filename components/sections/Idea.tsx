import Image from "next/image";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import { images } from "@/lib/images";

const facets = [
  { term: "People", note: "Buyers, owners, tenants, agents and advisors — every decision passes through someone." },
  { term: "Place", note: "The street, the neighborhood and the city that surround an address." },
  { term: "Value", note: "What a property is worth today, and what it could be worth tomorrow." },
  { term: "Trust", note: "Confidence that what you are told is accurate, complete and current." },
  { term: "Information", note: "Records, documents and data that are usually scattered and hard to verify." },
  { term: "Transactions", note: "Agreements, payments and paperwork that have to hold up." },
];

export function Idea() {
  return (
    <section id="idea" aria-labelledby="idea-title" className="relative bg-ivory py-24 text-ink sm:py-32 lg:py-44">
      <div className="shell">
        <div className="grid gap-y-10 lg:grid-cols-12">
          <SectionLabel index="01" className="text-stone-deep lg:col-span-3 lg:pt-5">
            The idea
          </SectionLabel>
          <h2 id="idea-title" data-reveal="lines" className="display text-[clamp(2.9rem,7.4vw,8.25rem)] lg:col-span-9">
            <Lines lines={["Real estate is more", <>than a <em>property.</em></>]} step={120} />
          </h2>
        </div>

        <div className="mt-16 grid gap-12 sm:mt-24 lg:mt-32 lg:grid-cols-12 lg:gap-x-8">
          {/* Tall architectural plate */}
          <figure className="lg:col-span-5">
            <div data-reveal="image" className="relative aspect-4/5 overflow-hidden bg-sand lg:sticky lg:top-28">
              <div data-parallax="0.06" className="absolute -inset-y-[6%] inset-x-0">
                <Image
                  src={images.ideaPrimary.src}
                  alt={images.ideaPrimary.alt}
                  fill
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  placeholder="blur"
                  className="object-cover grayscale-[0.2]"
                />
              </div>
            </div>
          </figure>

          <div className="lg:col-span-6 lg:col-start-7">
            <p data-reveal className="max-w-[36ch] text-[1.25rem] leading-[1.55] tracking-[-0.01em] text-graphite sm:text-[1.5rem]">
              A home is a question of people and place. A purchase is a question of value and trust. And every step
              depends on information you can rely on, and transactions that hold.
            </p>
            <p data-reveal className="mt-6 max-w-[48ch] text-stone-deep" style={{ "--d": "80ms" } as React.CSSProperties}>
              Today those pieces live in different hands, formats and places. Decisions that shape years of someone&rsquo;s
              life are made with a partial picture.
            </p>

            <ol className="mt-14 border-t border-line-light sm:mt-20">
              {facets.map((facet, i) => (
                <li
                  key={facet.term}
                  data-reveal
                  style={{ "--d": `${i * 60}ms` } as React.CSSProperties}
                  className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 border-b border-line-light py-6 sm:grid-cols-[3rem_minmax(0,14rem)_1fr] sm:gap-x-6 sm:py-7"
                >
                  <span className="eyebrow tabular-nums text-stone-deep">0{i + 1}</span>
                  <span className="display flex items-baseline gap-3 text-[2.25rem] leading-none sm:text-[2.75rem]">
                    <span className="transition-transform duration-700 ease-(--ease-out) group-hover:translate-x-2">{facet.term}</span>
                  </span>
                  <span className="col-start-2 mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed text-stone-deep sm:col-start-3 sm:mt-0">
                    {facet.note}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Resolution */}
        <div className="mt-24 grid items-end gap-10 sm:mt-32 lg:mt-44 lg:grid-cols-12 lg:gap-x-8">
          <figure className="order-2 w-2/3 sm:w-1/2 lg:order-1 lg:col-span-3 lg:w-auto">
            <div data-reveal="image" className="relative aspect-3/4 overflow-hidden bg-sand">
              <Image
                src={images.ideaSecondary.src}
                alt={images.ideaSecondary.alt}
                fill
                sizes="(min-width: 1024px) 22vw, 60vw"
                placeholder="blur"
                className="object-cover"
              />
            </div>
          </figure>
          <div className="order-1 lg:order-2 lg:col-span-8 lg:col-start-5">
            <p data-reveal className="eyebrow mb-8 flex items-center gap-3 text-brick">
              <span aria-hidden className="h-px w-8 bg-current" />
              Trustbrick
            </p>
            <p data-reveal="lines" className="display text-[clamp(2.25rem,4.8vw,5.25rem)] leading-[0.98]">
              <Lines
                lines={[
                  "Trustbrick brings these pieces",
                  "together, so every decision",
                  <>rests on <em className="text-brick">something solid.</em></>,
                ]}
              />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import { images } from "@/lib/images";

const stages = [
  { name: "Discovery", note: "Find property with information you can act on." },
  { name: "Intelligence", note: "Scores, records and context before you commit." },
  { name: "Professionals", note: "The agents, brokers and developers who make it happen." },
  { name: "Transactions", note: "Offers, agreements and paperwork in one place." },
  { name: "Management", note: "Tenancies, upkeep and portfolios after the move." },
  { name: "Finance", note: "The capital that lets real estate move." },
];

export function Future() {
  return (
    <section id="future" data-nav="dark" aria-labelledby="future-title" className="relative isolate overflow-hidden bg-contrast text-on-contrast">
      <div className="absolute inset-0 -z-10">
        <div data-parallax="0.1" className="absolute -inset-y-[12%] inset-x-0">
          <Image src={images.future.src} alt="" fill sizes="100vw" quality={70} placeholder="blur" className="object-cover object-[50%_40%]" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-contrast/60" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-contrast via-contrast/30 to-contrast" />
      </div>

      <div className="shell py-28 sm:py-36 lg:py-52">
        <SectionLabel index="05" className="mb-10 text-on-contrast/60">
          The road ahead
        </SectionLabel>
        <h2 id="future-title" data-reveal="lines" className="display max-w-[20ch] text-[clamp(2.6rem,6vw,7rem)] leading-[0.95]">
          <Lines
            lines={["We’re building the infrastructure", "behind the next generation", <em key="e">of real estate.</em>]}
            step={130}
          />
        </h2>

        <div className="mt-12 grid gap-8 sm:mt-16 lg:grid-cols-12">
          <p data-reveal className="max-w-[46ch] text-[1.125rem] leading-relaxed text-on-contrast/75 lg:col-span-5 lg:col-start-8">
            A listing is where most property platforms stop. Trustbrick is being designed to carry a decision all the way
            through, from the first search to the keys, the tenancy, the upkeep and the financing behind it.
          </p>
        </div>

        <div data-reveal="fade" className="relative mt-20 sm:mt-28 lg:mt-36">
          {/* the route */}
          <span aria-hidden className="absolute top-1 bottom-1 left-[5px] w-px bg-on-contrast/20 lg:top-[5px] lg:right-0 lg:bottom-auto lg:left-0 lg:h-px lg:w-auto">
            <span className="route-fill absolute inset-0 bg-brick-bright" />
          </span>
          <ol className="relative grid gap-10 lg:grid-cols-6 lg:gap-6">
            {stages.map((stage, i) => (
              <li key={stage.name} className="grid grid-cols-[11px_1fr] gap-x-6 lg:block">
                <span
                  aria-hidden
                  className="mt-1 block size-[11px] border border-on-contrast/60 bg-contrast transition-colors duration-700 lg:mt-0 [.is-in_&]:border-brick-bright [.is-in_&]:bg-brick-bright"
                  style={{ transitionDelay: `${300 + i * 320}ms` }}
                />
                <div className="lg:mt-8 lg:pr-4">
                  <p className="eyebrow tabular-nums text-on-contrast/50">0{i + 1}</p>
                  <h3 className="display mt-3 text-[2.25rem] leading-none lg:text-[clamp(1.75rem,2.4vw,2.5rem)]">{stage.name}</h3>
                  <p className="mt-3 max-w-[30ch] text-[0.9375rem] leading-relaxed text-on-contrast/65">{stage.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

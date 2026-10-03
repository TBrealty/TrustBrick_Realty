import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import { BrickBond } from "@/components/visualizations/BrickBond";

export function Ecosystem() {
  return (
    <section id="ecosystem" aria-labelledby="ecosystem-title" className="relative bg-ivory py-24 text-ink sm:py-32 lg:py-44">
      <div className="shell">
        <SectionLabel index="04" className="mb-10 text-stone-deep">
          The ecosystem
        </SectionLabel>
        <h2 id="ecosystem-title" data-reveal="lines" className="display text-[clamp(3rem,8.4vw,9.5rem)]">
          <Lines
            lines={["One platform.", <em key="e" className="text-stone-deep">An entire real-estate ecosystem.</em>]}
            step={140}
          />
        </h2>

        <div className="mt-12 grid gap-8 sm:mt-16 lg:grid-cols-12">
          <p data-reveal className="max-w-[44ch] text-[1.125rem] leading-relaxed text-graphite lg:col-span-5 lg:col-start-8">
            Real estate works when everyone involved can rely on one another. Trustbrick is being built as common ground
            for all of them: eight kinds of participant, one shared standard of information.
          </p>
        </div>

        <div className="mt-14 sm:mt-20">
          <BrickBond />
          <p className="eyebrow mt-5 flex items-center gap-3 text-stone-deep">
            <span aria-hidden className="h-px w-10 bg-linear-to-r from-transparent via-brick-bright to-transparent" />
            Every participant a brick. Trust, the mortar.
          </p>
        </div>
      </div>
    </section>
  );
}

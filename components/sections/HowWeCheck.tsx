import Link from "next/link";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";

/** Only what Trustbrick actually does today: each step matches a check in the product. */
const STEPS = [
  {
    title: "Approved agents and hosts",
    body: "Agents, brokerages and hosts apply to join. Our team reviews every application, and organizations give their GST and company details, before anyone can list.",
  },
  {
    title: "Every listing reviewed",
    body: "Before a listing goes live, our team checks it: the photos, the location pin, a price that's out of line, a missing RERA number, or a photo or description already used elsewhere.",
  },
  {
    title: "Kept honest once live",
    body: "Anyone can report a listing, and every report is reviewed. A change to a live listing's virtual tour is checked again too.",
  },
];

/** "Built on trust", made concrete: how a listing gets onto Trustbrick. */
export function HowWeCheck() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="relative bg-ivory py-20 text-ink sm:py-24 lg:py-28">
      <div className="shell">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionLabel index="03" className="mb-8 text-stone-deep">
              How we check
            </SectionLabel>
            <h2 id="trust-title" data-reveal="lines" className="display text-[clamp(2.5rem,5.4vw,5.75rem)]">
              <Lines lines={["Trust, checked", <em key="e">at every step.</em>]} step={120} />
            </h2>
          </div>
          <p data-reveal className="max-w-[42ch] text-[1.0625rem] leading-relaxed text-graphite lg:col-span-5 lg:pb-3">
            Every listing on Trustbrick comes from someone we&rsquo;ve approved, and is reviewed by a person before you see it.
          </p>
        </div>

        <ol className="mt-10 grid gap-px overflow-hidden border border-line-light bg-line-light sm:mt-14 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="relative bg-ivory p-6 sm:p-8">
              <span aria-hidden className="display block text-[4rem] leading-none text-brick/80">{i + 1}</span>
              <h3 className="display mt-6 text-[clamp(1.75rem,2.6vw,2.25rem)] leading-none">{step.title}</h3>
              <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-stone-deep">{step.body}</p>
            </li>
          ))}
        </ol>

        <p data-reveal className="mt-8 text-[0.9375rem] text-graphite">
          Want more certainty before you buy?{" "}
          <Link href="/legal-verification" className="link-rule text-brick">
            Get the papers checked with Legal Verification →
          </Link>
        </p>
      </div>
    </section>
  );
}

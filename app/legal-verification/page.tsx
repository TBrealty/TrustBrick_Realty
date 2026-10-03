import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { Steps } from "@/components/tools/guide";
import { LEGAL_SERVICE_INFO } from "@/lib/legal/services";
import { LEGAL_SHELL } from "@/lib/listings/services";
import type { LegalService } from "@/lib/vocab";

export const metadata: Metadata = {
  title: "Legal Verification: legal opinions and property documents — Trustbrick",
  description:
    "Have a property's documents verified, or get a title search and legal opinion from an independent advocate, before you buy. Telangana, Karnataka, Maharashtra and Goa.",
};

const SERVICES = Object.entries(LEGAL_SERVICE_INFO) as [LegalService, (typeof LEGAL_SERVICE_INFO)[LegalService]][];

const HOW: [string, React.ReactNode][] = [
  ["Apply online", <>Tell us about the property and what you need. About two minutes. <Link href="/legal-verification/apply" className="underline">Apply</Link></>],
  ["We call you", "To understand the property, agree the scope and give you the fee in writing. Nothing is charged until you accept."],
  ["You share the documents", "Copies go to the advocate taking on your request. The Documents guide says what to gather."],
  ["The advocate checks", "The documents and, for a title search, the records at the Sub-Registrar, the revenue office and the courts."],
  ["You get a signed report", "What's clear, what's missing, and what to ask the seller or put in the agreement before you pay."],
];

const WHY = [
  ["Before the money moves", "Most of what goes wrong with a property purchase is on paper long before it's on the ground, and it's cheapest to find before you pay."],
  ["Your advocate, not the bank's", "A lender's legal check protects the lender, and you may never see it. This one is written for you."],
  ["Plain answers", "A report that says what's clear and what isn't, in words you can act on, not only a list of documents."],
] as const;

const FAQ: [string, React.ReactNode][] = [
  [
    "Who does the work?",
    "Independent advocates enrolled with the Bar Council who practise property law in the state where the property is. Trustbrick arranges it and keeps you posted; the opinion is the advocate's, and signed by them.",
  ],
  [
    "How much does it cost?",
    "It depends on the property, the state and how many years of records have to be searched, so the team quotes after the first call. You'll have the fee in writing before any work starts, and nothing is charged online.",
  ],
  [
    "The bank is checking it for my loan. Isn't that enough?",
    "The bank's advocate works for the bank, checks what the bank needs to lend safely, and the report usually stays with the bank. It helps, but it isn't advice to you.",
  ],
  [
    "Does a clear report guarantee the property?",
    "No one can promise that. A report is only as good as the records and documents available; it shows what they say and where the risks are, so you can decide with your eyes open.",
  ],
  [
    "Can I use this for a property that isn't on Trustbrick?",
    "Yes. Any home, plot or commercial property in Telangana, Karnataka, Maharashtra or Goa, whether you found it here or not.",
  ],
  [
    "What happens to my documents?",
    "They go only to the advocate handling your request, and are used only for it. Don't send Aadhaar, PAN or bank details through the form; the advocate asks for what they need.",
  ],
];

export default function LegalVerificationPage() {
  return (
    <ServicePage shell={LEGAL_SHELL} current="overview">
      <section className="shell grid grid-cols-1 gap-10 border-b border-line-light pt-10 pb-14 sm:pt-14 lg:grid-cols-12 lg:gap-14 lg:pt-20 lg:pb-20">
        <div className="lg:col-span-7">
          <p className="eyebrow flex items-center gap-3 text-brick">
            <span aria-hidden className="h-px w-8 bg-current" />
            Legal Verification
          </p>
          <h1 className="display mt-5 max-w-[16ch] text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.95]">
            Check the title <em>before you pay.</em>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[1.0625rem] leading-relaxed text-graphite">
            Legal opinions and document verification by independent advocates, for homes, plots and commercial property in Telangana, Karnataka, Maharashtra and Goa.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/legal-verification/apply" className="btn btn-dark">
              <span>Apply for verification</span>
            </Link>
            <Link href="/legal-verification/documents" className="btn btn-ghost-dark">
              <span>What gets checked</span>
            </Link>
          </div>
        </div>
        <ul className="self-end border border-line-light bg-card lg:col-span-5">
          {[
            ["Signed by an advocate", "Enrolled with the Bar Council, practising in the property's state."],
            ["Searched at the source", "Sub-Registrar, revenue and court records, not only the seller's copies."],
            ["The fee before the work", "Agreed in writing after a call. Nothing charged online."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3 border-b border-line-light p-5 last:border-b-0">
              <span aria-hidden className="mt-0.5 font-medium text-sage">
                ✓
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="mt-0.5 block text-[0.875rem] leading-relaxed text-graphite">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="services" aria-labelledby="services-title" className="shell scroll-mt-[calc(var(--sticky-top)+1rem)] py-14 sm:py-20">
        <h2 id="services-title" className="display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1]">
          What you can ask for
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {SERVICES.map(([key, s]) => (
            <li key={key} className="flex flex-col border border-line-light bg-card p-6 sm:p-7">
              <h3 className="text-[1.1875rem] font-medium">{s.label}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">{s.summary}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-[0.9375rem]">
                {s.covers.map((c) => (
                  <li key={c} className="flex gap-2.5">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brick" />
                    {c}
                  </li>
                ))}
              </ul>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line-light pt-4 text-[0.8125rem]">
                <div>
                  <dt className="text-stone-deep">You get</dt>
                  <dd className="mt-0.5 text-ink">{s.outcome}</dd>
                </div>
                <div>
                  <dt className="text-stone-deep">Time</dt>
                  <dd className="mt-0.5 text-ink">{s.typical}</dd>
                </div>
              </dl>
              <Link href={`/legal-verification/apply?service=${key}`} className="link-rule mt-5 self-start text-[0.9375rem] font-medium">
                Apply for this →
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.8125rem] text-stone-deep">Times run from when the advocate has your documents, and depend on the government offices involved.</p>
      </section>

      <section aria-labelledby="how-title" className="border-y border-line-light bg-paper">
        <div className="shell grid grid-cols-1 gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-4">
            <h2 id="how-title" className="display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1]">
              How it works
            </h2>
            <p className="mt-4 max-w-[36ch] text-[0.9375rem] leading-relaxed text-graphite">From your application to a signed report, with a person from the team to call at every step.</p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <Steps steps={HOW} />
          </div>
        </div>
      </section>

      <section aria-labelledby="why-title" className="shell py-14 sm:py-20">
        <h2 id="why-title" className="sr-only">
          Why verify
        </h2>
        <ul className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
          {WHY.map(([title, body]) => (
            <li key={title} className="border-t-2 border-ink pt-5">
              <p className="text-[1.0625rem] font-medium">{title}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-title" className="border-t border-line-light">
        <div className="shell grid grid-cols-1 gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
          <h2 id="faq-title" className="display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1] lg:col-span-4">
            Questions
          </h2>
          <div className="divide-y divide-line-light border-y border-line-light lg:col-span-7 lg:col-start-6">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[1rem] font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden className="text-[1.25rem] leading-none text-stone-deep transition-transform duration-300 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-5 text-[0.9375rem] leading-relaxed text-graphite">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Apply" className="border-t border-line-light bg-paper">
        <div className="shell flex flex-col items-start justify-between gap-6 py-14 sm:flex-row sm:items-center">
          <div>
            <p className="display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.05]">Found the one? Check it first.</p>
            <p className="mt-2 text-[0.9375rem] text-graphite">Apply now; we&apos;ll call you to agree the scope and the fee.</p>
          </div>
          <Link href="/legal-verification/apply" className="btn btn-dark shrink-0">
            <span>Apply for verification</span>
          </Link>
        </div>
        <p className="shell pb-8 text-[0.8125rem] leading-relaxed text-stone-deep">
          Trustbrick is not a law firm and doesn&apos;t give legal advice itself: opinions and reports are the advocates&apos; own.
        </p>
      </section>
    </ServicePage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AreaConverter } from "@/components/buy/AreaConverter";
import { DocList, GuideLayout, GuideSection as Section, RedFlags, ReraPortals, Steps } from "@/components/tools/guide";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Buying guide: steps, documents and RERA checks — Trustbrick",
  description: "How buying a home or plot works in India, step by step: the documents to check, how to verify RERA, area units, TDS and the red flags to watch for.",
};

const shell = SERVICE_SHELLS.buy!;

const CONTENTS = [
  ["steps", "The steps"],
  ["documents", "Documents to check"],
  ["rera", "Checking RERA"],
  ["area", "Carpet, built-up and plot area"],
  ["money", "Money matters"],
  ["red-flags", "Red flags"],
] as const;

const STEPS: [string, React.ReactNode][] = [
  ["Set your budget", <>Work out the EMI you can carry and add stamp duty, registration and other costs to the price. <Link href="/buy/emi-calculator" className="underline">EMI calculator</Link> · <Link href="/buy/costs" className="underline">Buying costs</Link></>],
  ["Get the loan approved in principle", "A sanction letter tells you what a bank will lend before you commit, and makes your offer stronger."],
  ["Shortlist and visit", <>Filter by locality, budget and size, then visit at different times of day. <Link href="/buy" className="underline">Browse homes and plots</Link></>],
  ["Check the documents", <>Have a property lawyer check the title and approvals before you pay anything more than a small, refundable token. The list is below. <Link href="/legal-verification" className="underline">Legal Verification</Link></>],
  ["Agree the terms in writing", "Record the price, what's included, the payment schedule, the possession date and the penalty for delay in an agreement for sale."],
  ["Pay and register", "Pay stamp duty, sign the sale deed at the Sub-Registrar's office with two witnesses, and pay the balance as agreed, by bank transfer."],
  ["Take possession and transfer the records", "Collect the keys and original documents, then move the property tax account, electricity and water connections, and society membership into your name."],
];

const DOCS_ALL: [string, string][] = [
  ["Title deed and the chain of ownership", "The seller's sale deed and the previous deeds, ideally going back 30 years, showing each transfer was clean."],
  ["Encumbrance certificate (EC)", "From the Sub-Registrar, for the last 13 to 30 years: shows whether the property is mortgaged or has other claims against it."],
  ["Approved building plan", "Sanctioned by the local authority. The flat you're buying should match it."],
  ["Occupancy or completion certificate", "For a ready home: confirms it was built as approved and is fit to live in. Without it, loans, GST treatment and utility connections can be affected."],
  ["Property tax receipts and khata / mutation", "Show the seller is the recorded owner and there are no dues."],
  ["No-dues or NOC from the society and the bank", "A society NOC for resale flats, and the bank's release if the seller still has a loan on it."],
];

const DOCS_NEW: [string, string][] = [
  ["RERA registration", "Every project above the size limits must be registered. Check the number and the promised completion date on the state portal."],
  ["Builder–buyer agreement and allotment letter", "Must follow the RERA model agreement: carpet area, price, payment plan and possession date."],
  ["Land title and development agreement", "Shows the builder has the right to build on the land."],
];

const DOCS_PLOT: [string, string][] = [
  ["Layout approval", "From the development authority (for example HMDA, BDA or PMRDA) or DTCP. An unapproved layout can't be regularised easily."],
  ["Land-use conversion", "Farmland must be converted to non-agricultural use before homes can be built."],
  ["Survey sketch and boundaries", "Match the plot on the ground to the survey number and the layout plan."],
];

const RED_FLAGS = [
  "Pressure to pay a large advance in cash, or before you've seen the documents.",
  "An under-construction project with no RERA number, or one different from what's on the portal.",
  "The seller's name not matching the title deed, EC or tax records.",
  "Loans or other entries on the encumbrance certificate that the seller can't explain.",
  "A price far below similar homes nearby.",
  "A power of attorney sale where the owner can't be met, or a plot on unconverted farmland.",
];

export default function BuyingGuidePage() {
  return (
    <ServicePage shell={shell} current="guide" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Buying guide" title={<>Buying a home, <em>step by step.</em></>}>
        What happens between &ldquo;I like this one&rdquo; and the keys, what to check along the way, and what to be wary of. General guidance, not legal advice: have a property
        lawyer check the title before you pay.
      </ToolIntro>

      <GuideLayout contents={CONTENTS}>
        <Section id="steps" title="The steps">
          <Steps steps={STEPS} />
        </Section>

        <Section id="documents" title="Documents to check">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">Ask for copies early, and see the originals before registration.</p>
          <h3 className="mt-6 text-[1.0625rem] font-medium">For every home</h3>
          <DocList items={DOCS_ALL} />
          <h3 className="mt-8 text-[1.0625rem] font-medium">Also, for a new or under-construction home</h3>
          <DocList items={DOCS_NEW} />
          <h3 className="mt-8 text-[1.0625rem] font-medium">Also, for a plot</h3>
          <DocList items={DOCS_PLOT} />
        </Section>

        <Section id="rera" title="Checking RERA">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">
            Under the Real Estate (Regulation and Development) Act, 2016, projects above a size limit must be registered with the state&apos;s RERA before they&apos;re sold. On
            the portal, search the project&apos;s registration number and check the builder&apos;s name, the approved plans, the promised completion date, progress updates, and
            any complaints.
          </p>
          <ReraPortals />
          <p className="mt-4 text-[0.875rem] text-stone-deep">Every Trustbrick listing in an under-construction project shows its RERA number, where the lister has given one.</p>
        </Section>

        <Section id="area" title="Carpet, built-up and plot area">
          <dl className="space-y-4">
            {[
              ["Carpet area", "The usable floor area inside the walls of the flat. Under RERA, a flat's price must be quoted on its carpet area. This is what Trustbrick's size filter uses for homes."],
              ["Built-up area", "Carpet area plus the thickness of the walls and, usually, balconies. Typically 10–15% more than carpet."],
              ["Super built-up area", "Built-up area plus a share of the common areas: lobbies, stairs, lifts, the clubhouse. Often 25–35% more than carpet."],
              ["Plot area", "The land itself, usually sold in square yards (gaj). This is what the size filter uses for plots."],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-medium">{term}</dt>
                <dd className="mt-0.5 text-[0.9375rem] leading-relaxed text-graphite">{def}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8">
            <AreaConverter />
          </div>
        </Section>

        <Section id="money" title="Money matters">
          <ul className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <li>
              <strong className="font-medium text-ink">Stamp duty and registration</strong> are paid on top of the price, on the higher of the agreed price and the
              government&apos;s guidance value. <Link href="/buy/costs" className="underline">See the figures for your city</Link>.
            </li>
            <li>
              <strong className="font-medium text-ink">GST</strong> applies only to homes still under construction: 5%, or 1% for affordable housing. There&apos;s no GST on
              a ready home with a completion certificate, or on a resale.
            </li>
            <li>
              <strong className="font-medium text-ink">TDS:</strong> if the price is ₹50 lakh or more, you deduct 1% from the payment to the seller and deposit it with the
              Income Tax Department using Form 141 (Form 26QB before April 2026).
            </li>
            <li>
              <strong className="font-medium text-ink">Pay by bank transfer</strong>, to the account named in the agreement, and keep every receipt.
            </li>
          </ul>
        </Section>

        <Section id="red-flags" title="Red flags">
          <RedFlags flags={RED_FLAGS} />
          <p className="mt-6 text-[0.9375rem] text-graphite">
            Something about a listing on Trustbrick doesn&apos;t add up? Use <strong className="font-medium text-ink">Report this listing</strong> on its page, or{" "}
            <Link href="/contact?topic=problem" className="underline">
              tell us
            </Link>
            .
          </p>
        </Section>
      </GuideLayout>
    </ServicePage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { DocList, GuideDisclaimer, GuideLayout, GuideSection, RedFlags, ReraPortals } from "@/components/tools/guide";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Investing guide: yields, new launches and tax — Trustbrick",
  description: "How property investment works in India: homes, commercial space and land compared, reading rental yields, checking new launches, and the tax basics.",
};

const shell = SERVICE_SHELLS.invest!;

const CONTENTS = [
  ["kinds", "Kinds of investment"],
  ["yields", "Reading a yield"],
  ["new-launches", "New launches"],
  ["commercial", "Commercial property"],
  ["tax", "Tax basics"],
  ["red-flags", "Red flags"],
] as const;

const KINDS: [string, string][] = [
  ["A home to let", "The easiest to buy, finance and rent out. Yields on homes in large Indian cities are often modest, so returns tend to lean on the price rising over time."],
  ["Commercial space", "Offices and shops usually rent for more against their price, on longer leases with yearly increases, but cost more to enter and can stand empty longer between tenants."],
  ["Land and plots", "No rent and no upkeep, so any return is the price rising. Title, approvals and access matter more than anywhere else."],
  ["A new launch", "Bought before or during construction, often at a lower price, in exchange for waiting and the risk of delay."],
];

const NEW_LAUNCH: [string, React.ReactNode][] = [
  ["RERA registration", "Check the project on the state's RERA portal (below): the builder, approved plans, promised completion date and any complaints."],
  ["The payment plan", "Prefer a construction-linked plan, where you pay as stages are finished, over large payments up front."],
  ["The builder's record", "Look at their finished projects: were they delivered on time, and as promised?"],
  ["What delay would cost you", "Rent or EMIs you'd pay while you wait, and what the agreement says the builder pays you for a late handover."],
];

const COMMERCIAL: [string, string][] = [
  ["The lease", "Its length, the lock-in period, how often and by how much the rent rises, and who pays maintenance."],
  ["The tenant", "A well-established tenant on a long lease is worth more than a higher rent on a short one."],
  ["GST on the rent", "Rent from commercial property can attract GST, depending on the owner's turnover. Ask a tax adviser before you buy."],
];

const RED_FLAGS = [
  "Returns described as 'assured' or 'guaranteed', especially paid by the seller for a few years.",
  "A new launch with no RERA number, or details that differ from the portal.",
  "A declared rent far above similar properties nearby.",
  "Pressure to decide or pay quickly to 'lock in' a price.",
  "Land without clear title, conversion or layout approval.",
];

export default function InvestingGuidePage() {
  return (
    <ServicePage shell={shell} current="guide" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Investing guide" title={<>Investing in property, <em>with clear eyes.</em></>}>
        What each kind of property investment offers, how to read the numbers you&apos;re shown, and the tax basics. General information, not investment advice: Trustbrick
        isn&apos;t an investment adviser.
      </ToolIntro>

      <GuideLayout contents={CONTENTS}>
        <GuideSection id="kinds" title="Kinds of investment">
          <DocList items={KINDS} />
        </GuideSection>

        <GuideSection id="yields" title="Reading a yield">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <p>
              <strong className="font-medium text-ink">Gross yield</strong> is a year&apos;s rent divided by the price. It&apos;s the figure most listings quote, and the one
              Trustbrick shows as the <em>declared rent yield</em>, worked out from the rent the seller declares, never an estimate of ours.
            </p>
            <p>
              <strong className="font-medium text-ink">Net yield</strong> is what&apos;s left after the months it stands empty and the costs an owner pays, over what the property
              really costs you, including stamp duty and registration. It&apos;s always lower.
            </p>
            <p>
              <Link href="/invest/yield-calculator" className="font-medium underline">
                Work out a net yield
              </Link>
            </p>
          </div>
        </GuideSection>

        <GuideSection id="new-launches" title="New launches">
          <DocList items={NEW_LAUNCH} />
          <ReraPortals />
        </GuideSection>

        <GuideSection id="commercial" title="Commercial property">
          <DocList items={COMMERCIAL} />
        </GuideSection>

        <GuideSection id="tax" title="Tax basics">
          <ul className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <li>
              <strong className="font-medium text-ink">Rental income</strong> is taxed at your slab rate, after deducting municipal taxes you&apos;ve paid and a standard deduction
              of 30%.
            </li>
            <li>
              <strong className="font-medium text-ink">Selling after more than two years</strong> is a long-term gain, taxed at 12.5% without indexation. For property bought
              before 23 July 2024, resident individuals can instead choose 20% with indexation.
            </li>
            <li>
              <strong className="font-medium text-ink">Selling within two years</strong> is a short-term gain, taxed at your slab rate.
            </li>
            <li>
              <strong className="font-medium text-ink">Buying for ₹50 lakh or more:</strong> you deduct 1% TDS from the payment to the seller.
            </li>
          </ul>
          <p className="mt-4 text-[0.875rem] text-stone-deep">
            Since April 2026 these rules sit in the Income-tax Act, 2025. Tax depends on your circumstances; check with a tax adviser.
          </p>
        </GuideSection>

        <GuideSection id="red-flags" title="Red flags">
          <RedFlags flags={RED_FLAGS}>
            Something about a listing on Trustbrick doesn&apos;t add up? Use <strong className="font-medium text-ink">Report this listing</strong> on its page, or{" "}
            <Link href="/contact?topic=problem" className="underline">
              tell us
            </Link>
            .
          </RedFlags>
        </GuideSection>

        <GuideDisclaimer>
          Property prices can fall as well as rise, and rent isn&apos;t guaranteed. This guide is general information, not a recommendation to buy any property.
        </GuideDisclaimer>
      </GuideLayout>
    </ServicePage>
  );
}

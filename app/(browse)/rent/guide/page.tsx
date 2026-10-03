import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { DocList, GuideDisclaimer, GuideLayout, GuideSection, RedFlags, Steps } from "@/components/tools/guide";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Renting guide: agreements, deposits and documents — Trustbrick",
  description: "How renting a home works in India: the steps, what to put in the rental agreement, deposits, documents, tenant verification, tax on rent and the red flags.",
};

const shell = SERVICE_SHELLS.rent!;

const CONTENTS = [
  ["steps", "The steps"],
  ["agreement", "The rental agreement"],
  ["deposit", "The security deposit"],
  ["documents", "Documents"],
  ["moving-in", "Moving in"],
  ["tax", "Rent and tax"],
  ["red-flags", "Red flags"],
] as const;

const STEPS: [string, React.ReactNode][] = [
  ["Set your budget", <>Count the deposit, advance and brokerage as well as the rent. <Link href="/rent/move-in-costs" className="underline">Move-in costs</Link></>],
  ["Shortlist and visit", <>Filter by locality, rent and furnishing, then visit in daylight and after dark. <Link href="/rent" className="underline">Browse rentals</Link></>],
  ["Meet the owner", "Or their authorised agent. Ask to see proof that they own the home, and meet the society if there is one."],
  ["Agree the terms", "Rent, deposit, maintenance, the yearly increase, any lock-in and the notice period, before any money changes hands."],
  ["Sign the agreement", "On stamp paper, signed by both of you with two witnesses, and registered where the law or its length requires. What to include is below."],
  ["Get verified", "Many city police forces ask landlords to register their tenants. It's usually done online, with your ID and a photograph."],
  ["Move in with a record", "Photograph every room, note the meter readings and list what's provided, signed by both of you."],
];

const AGREEMENT: [string, string][] = [
  ["Rent, and when and how it's paid", "The amount, the due date, and a bank account or UPI ID for payment."],
  ["The yearly increase", "Commonly around 5–10% at renewal. Agree the figure now rather than at the end."],
  ["Deposit and its refund", "The amount, when it's returned after you leave, and exactly what can be deducted."],
  ["Maintenance and bills", "Who pays society maintenance, electricity, water and gas."],
  ["Lock-in and notice", "How long neither side can end the agreement, and the notice after that, usually one or two months."],
  ["Repairs", "Who fixes what: small repairs are usually the tenant's, structural ones the owner's."],
  ["What's provided", "An inventory of furniture and appliances, and their condition."],
  ["House rules", "Pets, guests, subletting and any society rules you're agreeing to."],
];

const DOCS: [string, string][] = [
  ["From you", "Photo ID (Aadhaar, passport or driving licence), passport photographs, and often proof of work or study."],
  ["From the owner", "ID, and proof they own the home: a recent property-tax receipt or a copy of the sale deed. Ask for the society's no-objection if it needs one."],
  ["For both of you", "The signed agreement, the police verification acknowledgement, and a receipt for every payment."],
];

const RED_FLAGS = [
  "Being asked for a deposit or 'token' before you've seen the home or met the owner.",
  "No proof of ownership, or the owner's name not matching the tax receipt.",
  "A refusal to put the terms in a written agreement.",
  "Cash only, with no receipts.",
  "A tenant offering to sublet, without the owner's written consent.",
  "A rent far below similar homes nearby.",
];

export default function RentingGuidePage() {
  return (
    <ServicePage shell={shell} current="guide" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Renting guide" title={<>Renting a home, <em>without surprises.</em></>}>
        From the first visit to the day you move in: what to agree, what to sign, and what to watch for. General guidance, not legal advice.
      </ToolIntro>

      <GuideLayout contents={CONTENTS}>
        <GuideSection id="steps" title="The steps">
          <Steps steps={STEPS} />
        </GuideSection>

        <GuideSection id="agreement" title="The rental agreement">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">
            Most rentals use an 11-month agreement, because a lease of a year or more has to be registered under the Registration Act. In Maharashtra every leave-and-licence
            agreement must be registered, whatever its length; it can be done online. Whatever the length, put these in writing:
          </p>
          <DocList items={AGREEMENT} />
        </GuideSection>

        <GuideSection id="deposit" title="The security deposit">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <p>
              The deposit is refundable, and customs vary: often two or three months&apos; rent in Hyderabad, Mumbai and Pune, and more in Bengaluru. The central Model Tenancy
              Act suggests a cap of two months for homes, but it applies only where a state has adopted it, so what you agree in writing is what counts.
            </p>
            <p>
              Pay it by bank transfer, get a receipt, and make sure the agreement says when it comes back and what can be deducted. Your move-in photographs are your best evidence
              when you leave.
            </p>
          </div>
        </GuideSection>

        <GuideSection id="documents" title="Documents">
          <DocList items={DOCS} />
        </GuideSection>

        <GuideSection id="moving-in" title="Moving in">
          <DocList
            items={[
              ["Photographs", "Every room, walls, floors, fittings and appliances, with the date."],
              ["Meter readings", "Electricity, water and gas, noted in writing."],
              ["Keys and access cards", "How many you've been given; you'll return the same."],
              ["What doesn't work", "Tell the owner in writing in the first week, so it isn't taken from your deposit later."],
            ]}
          />
        </GuideSection>

        <GuideSection id="tax" title="Rent and tax">
          <ul className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <li>
              <strong className="font-medium text-ink">Claiming HRA:</strong> keep rent receipts, and get your landlord&apos;s PAN if the year&apos;s rent is more than ₹1 lakh.
            </li>
            <li>
              <strong className="font-medium text-ink">Rent above ₹50,000 a month:</strong> an individual tenant deducts 2% TDS from the rent and deposits it with the Income Tax
              Department using Form 141 (Form 26QC before April 2026).
            </li>
          </ul>
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

        <GuideDisclaimer>Rules differ by state and change over time. For anything contentious, ask a lawyer before you sign.</GuideDisclaimer>
      </GuideLayout>
    </ServicePage>
  );
}

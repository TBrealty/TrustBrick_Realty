import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { DocList, GuideDisclaimer, GuideLayout, GuideSection, RedFlags, ReraPortals } from "@/components/tools/guide";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { LEGAL_SHELL } from "@/lib/listings/services";

export const metadata: Metadata = {
  title: "Property documents guide: what an advocate checks — Trustbrick",
  description:
    "The documents a property's title rests on, the state records for Telangana, Karnataka, Maharashtra and Goa, the extra papers for new projects and plots, and the red flags.",
};

const CONTENTS = [
  ["every-property", "For every property"],
  ["by-state", "State records"],
  ["new-projects", "New projects"],
  ["plots", "Plots and land"],
  ["red-flags", "Red flags"],
  ["portals", "Check it yourself"],
] as const;

const EVERY: [string, React.ReactNode][] = [
  ["Title deed and the chain before it", "The seller's registered sale deed, and the deeds before it (link or mother deeds), usually for 30 years, so every transfer is accounted for."],
  [
    "Encumbrance certificate (EC)",
    "From the Sub-Registrar: every registered sale, mortgage or gift on the property for the years searched. It shows only registered documents, which is why a court-case search matters too.",
  ],
  ["Property tax receipts, and khata or mutation", "The seller should be the owner on the municipal and revenue records, with no dues."],
  ["Approved building plan and occupancy certificate", "The home should match the sanctioned plan; the occupancy or completion certificate says it was built as approved."],
  [
    "Who can sign",
    "Every owner, or every legal heir of a family property, must sign the sale. A power of attorney must be registered and still in force, and it doesn't make the holder the owner.",
  ],
  ["Loans and no-dues", "If the seller has a home loan on it, the bank's no-objection and a release when it's paid off. For a resale flat, the society's NOC."],
];

const STATES: { name: string; records: [string, string][] }[] = [
  {
    name: "Telangana",
    records: [
      ["Encumbrance and certified copies", "From the Registration and Stamps department (IGRS Telangana), online or at the Sub-Registrar."],
      ["Land records on Bhu Bharati", "The pattadar passbook and pahani. Bhu Bharati replaced Dharani in 2025."],
      ["Approvals", "GHMC or municipal building permission and occupancy; HMDA or DTCP layout approval for plots, or LRS regularisation."],
    ],
  },
  {
    name: "Karnataka",
    records: [
      ["Encumbrance and registered deeds", "Through Kaveri, the Registration department's online service."],
      ["RTC (pahani) on Bhoomi", "For land: who holds it, and how it's classified."],
      ["Khata", "In Bengaluru, the e-khata. An A-khata is for a regular property; a B-khata marks an irregularity, and banks are wary of it."],
      ["Conversion and layout", "The conversion order for non-agricultural use, and BDA, BMRDA or local planning approval for plots."],
    ],
  },
  {
    name: "Maharashtra",
    records: [
      ["Index II", "The registration record of each transaction, from IGR Maharashtra."],
      ["7/12 extract and 8A", "For land: the holder, the area and any rights or loans recorded."],
      ["Property card", "In city survey areas, in place of the 7/12."],
      ["Society papers", "For a flat: the share certificate and the society's NOC. For plots, the non-agricultural (NA) order."],
    ],
  },
  {
    name: "Goa",
    records: [
      ["Form I and XIV", "The land record: the holder, the area and the tenants or mundkars recorded on it."],
      ["Conversion sanad", "Permission to use the land for non-agricultural purposes."],
      ["Approvals", "Town and Country Planning, and the panchayat or municipal licence and occupancy certificate."],
      ["Comunidade and tenancy claims", "Check the land isn't comunidade land and has no tenant or mundkar claims."],
    ],
  },
];

const NEW_PROJECTS: [string, string][] = [
  ["RERA registration", "The number, the promised completion date and the approvals on the state RERA portal."],
  ["Land title and development agreement", "The builder's right to build on the land, and the landowner's share if it's a joint development."],
  ["Commencement certificate and sanctioned plan", "Construction must have been permitted before it began."],
  ["The agreement for sale", "It should follow the state's RERA model agreement: carpet area, price, payment plan, possession date and penalties."],
];

const PLOTS: [string, string][] = [
  ["Layout approval", "From the development authority or DTCP. An unapproved layout can leave you unable to build or get a loan."],
  ["Land-use conversion", "Agricultural land must be converted to non-agricultural use before homes can be built on it."],
  ["Survey sketch and boundaries", "The plot on the ground should match its survey number and the layout plan."],
  ["Agricultural land", "Some states limit who may buy it. The advocate will check whether you can."],
];

const RED_FLAGS = [
  "The seller holds only a power of attorney or an agreement of sale, not a registered sale deed.",
  "A gap in the chain of deeds, or a deed in the chain that was never registered.",
  "A mortgage on the EC with no release, or a charge on CERSAI.",
  "Names or areas that don't match between the deed, the EC, the tax records and the land records.",
  "A family property where not every legal heir is signing.",
  "Original documents said to be lost, with no police complaint or public notice about them.",
  "Farmland sold as house plots without a conversion order or layout approval.",
];

const PORTALS: [string, string][] = [
  ["IGRS Telangana: EC and certified copies", "https://registration.telangana.gov.in"],
  ["Bhu Bharati: Telangana land records", "https://bhubharati.telangana.gov.in"],
  ["Kaveri: Karnataka registration and EC", "https://kaveri.karnataka.gov.in"],
  ["Bhoomi: Karnataka RTC", "https://landrecords.karnataka.gov.in"],
  ["IGR Maharashtra: Index II and search", "https://igrmaharashtra.gov.in"],
  ["Mahabhumi: 7/12 and property cards", "https://mahabhumi.gov.in"],
  ["eCourts: search court cases", "https://services.ecourts.gov.in"],
  ["CERSAI: loans against a property", "https://www.cersai.org.in"],
];

export default function DocumentsGuidePage() {
  return (
    <ServicePage shell={LEGAL_SHELL} current="documents" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Documents guide" title={<>The papers a title <em>rests on.</em></>}>
        What an advocate asks for and checks before you buy, state by state, and the signs that something isn&apos;t right. Use it to gather what you have before you apply.
      </ToolIntro>

      <GuideLayout contents={CONTENTS}>
        <GuideSection id="every-property" title="For every property">
          <DocList items={EVERY} />
        </GuideSection>

        <GuideSection id="by-state" title="State records">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">Each state keeps land and registration records its own way. These are the ones for the states Trustbrick covers.</p>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {STATES.map((s) => (
              <section key={s.name} aria-labelledby={`state-${s.name}`} className="border border-line-light bg-card p-5">
                <h3 id={`state-${s.name}`} className="font-medium">
                  {s.name}
                </h3>
                <dl className="mt-3 space-y-3">
                  {s.records.map(([title, body]) => (
                    <div key={title}>
                      <dt className="text-[0.9375rem] font-medium">{title}</dt>
                      <dd className="mt-0.5 text-[0.875rem] leading-relaxed text-graphite">{body}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </GuideSection>

        <GuideSection id="new-projects" title="New projects">
          <DocList items={NEW_PROJECTS} />
          <p className="mt-6 text-[0.9375rem] text-graphite">Check the RERA number on the official portal:</p>
          <ReraPortals />
        </GuideSection>

        <GuideSection id="plots" title="Plots and land">
          <DocList items={PLOTS} />
        </GuideSection>

        <GuideSection id="red-flags" title="Red flags">
          <RedFlags flags={RED_FLAGS}>
            Seen one of these? Don&apos;t pay more than a small, refundable token.{" "}
            <Link href="/legal-verification/apply?service=title_opinion" className="font-medium underline">
              Ask an advocate to look
            </Link>
            .
          </RedFlags>
        </GuideSection>

        <GuideSection id="portals" title="Check it yourself">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">
            Much of this is on official portals. A search is a good first look; it doesn&apos;t replace an advocate reading the documents and the records together.
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PORTALS.map(([name, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer" className="flex h-full items-center justify-between gap-3 border border-line-light bg-card px-4 py-3 text-[0.9375rem] hover:border-ink">
                  {name}
                  <span aria-hidden>↗</span>
                  <span className="sr-only">(opens the official portal in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </GuideSection>

        <GuideDisclaimer>
          General information, not legal advice. Records, portals and rules change, and every property is different: for a decision, rely on an advocate&apos;s opinion on your
          property&apos;s own documents.
        </GuideDisclaimer>
      </GuideLayout>
    </ServicePage>
  );
}

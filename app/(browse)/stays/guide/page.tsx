import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { DocList, GuideDisclaimer, GuideLayout, GuideSection, RedFlags, Steps } from "@/components/tools/guide";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { CANCELLATION_LABELS, REQUEST_HOURS } from "@/lib/stays/labels";

export const metadata: Metadata = {
  title: "Stay guide: booking, cancellations and checking in — Trustbrick",
  description: "How booking a home stay on Trustbrick works: requests and instant book, paying at the property, cancellation policies, checking in, and the red flags.",
};

const shell = SERVICE_SHELLS.stay!;

const CONTENTS = [
  ["booking", "How booking works"],
  ["cancellation", "Cancellation policies"],
  ["before", "Before you book"],
  ["check-in", "Checking in"],
  ["during", "During your stay"],
  ["red-flags", "Red flags"],
  ["hosting", "Thinking of hosting?"],
] as const;

// The steps describe how Trustbrick's own booking works, so they come from the same rules.
const BOOKING: [string, React.ReactNode][] = [
  ["Choose your dates and guests", <>The price is worked out night by night: weekend and festival nights can cost more, plus any cleaning fee. <Link href="/stays" className="underline">Find a stay</Link></>],
  ["Ask the host anything", "Message the host from the stay's page before you book. The conversation is saved in Messages."],
  ["Request to book, or book instantly", `Most stays ask the host to accept: they have ${REQUEST_HOURS} hours, or until the end of the check-in day if that's sooner, before the request expires. Stays marked Instant book are confirmed straight away.`],
  ["Get the address", "The exact address and the host's phone number appear in Your trips once the booking is confirmed, never before."],
  ["Pay at the property", "You pay the host when you arrive, as agreed. Trustbrick charges nothing online and never asks you to pay in advance."],
];

const BEFORE: [string, string][] = [
  ["House rules", "Quiet hours, guests, smoking, parties and pets. They're part of what you agree to."],
  ["Space and beds", "Whether it's the entire home or a private room, how many it sleeps, and the beds."],
  ["Check-in and check-out times", "And whether the host can be flexible, if your travel needs it."],
  ["The cancellation policy", "Which of the three it uses, below."],
  ["Where it is", "The locality is on the page; ask the host about the walk to shops, transport and the beach."],
];

const CHECK_IN: [string, string][] = [
  ["Photo ID for every adult", "Hosts usually ask to see it. Bring the original."],
  ["Foreign nationals", "Bring your passport and visa. Hosts must report a foreign guest's stay to the authorities (Form C), usually within a day of arrival."],
  ["The agreed payment", "In the way you agreed with the host, and ask for a receipt."],
  ["A quick walk-through", "Note anything broken or missing and tell the host in Messages straight away, so it's on record."],
];

const RED_FLAGS = [
  "A request to pay in advance by link, UPI or bank transfer. Trustbrick stays are paid at the property.",
  "Being asked to move the conversation or the booking off Trustbrick.",
  "An address or home that doesn't match the listing when you arrive.",
  "A host asking for your passwords, OTPs or card details. Never share them.",
];

export default function StayGuidePage() {
  return (
    <ServicePage shell={shell} current="guide" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Stay guide" title={<>Booking a home stay, <em>start to finish.</em></>}>
        How booking works on Trustbrick, what to check first, and what to expect when you arrive.
      </ToolIntro>

      <GuideLayout contents={CONTENTS}>
        <GuideSection id="booking" title="How booking works">
          <Steps steps={BOOKING} />
        </GuideSection>

        <GuideSection id="cancellation" title="Cancellation policies">
          <p className="text-[0.9375rem] leading-relaxed text-graphite">Each host picks one. It&apos;s shown on the stay&apos;s page and in your trip.</p>
          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.values(CANCELLATION_LABELS).map((c) => (
              <div key={c.label} className="border border-line-light bg-card p-4">
                <dt className="font-medium">{c.label}</dt>
                <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-graphite">{c.rule}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[0.875rem] text-stone-deep">
            You cancel from your trip in Your trips. As you pay at the property, a later cancellation isn&apos;t charged online, but do tell the host why.
          </p>
        </GuideSection>

        <GuideSection id="before" title="Before you book">
          <DocList items={BEFORE} />
        </GuideSection>

        <GuideSection id="check-in" title="Checking in">
          <DocList items={CHECK_IN} />
        </GuideSection>

        <GuideSection id="during" title="During your stay">
          <ul className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <li>Keep to the house rules and the quiet hours; neighbours are part of the stay.</li>
            <li>Tell the host about any problem in Messages, so there&apos;s a record for both of you.</li>
            <li>
              In an emergency, call <strong className="font-medium text-ink">112</strong>, India&apos;s number for police, fire and ambulance.
            </li>
          </ul>
        </GuideSection>

        <GuideSection id="red-flags" title="Red flags">
          <RedFlags flags={RED_FLAGS}>
            Something wrong with a stay or a host? Use <strong className="font-medium text-ink">Report this listing</strong> on its page, or{" "}
            <Link href="/contact?topic=problem" className="underline">
              tell us
            </Link>
            .
          </RedFlags>
        </GuideSection>

        <GuideSection id="hosting" title="Thinking of hosting?">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-graphite">
            <p>
              Trustbrick checks every host before they can list. You set your own nightly and weekend prices, dates, house rules and cancellation policy, and guests pay you at
              the property.
            </p>
            <p>
              Some states ask homestays to register with their tourism department, Goa among them, and hosting income is taxable. Check what applies where your home is.
            </p>
            <p>
              <Link href="/become-a-host" className="font-medium underline">
                Host your home
              </Link>
            </p>
          </div>
        </GuideSection>

        <GuideDisclaimer>General guidance. Local rules differ; for anything specific, ask the host or the local authorities.</GuideDisclaimer>
      </GuideLayout>
    </ServicePage>
  );
}

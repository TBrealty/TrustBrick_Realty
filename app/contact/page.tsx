import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact/ContactForm";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { getSession } from "@/lib/auth/session";
import { CONTACT_TOPICS } from "@/lib/db/schema/platform";
import { CONTACT_TOPIC_LABELS } from "@/lib/services/contact";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us — Trustbrick",
  description: "Questions about buying, renting, stays, listing a property or your account. Write to the Trustbrick team.",
};

const SHORTCUTS = [
  { title: "List your home as a stay", body: "Apply to host; the team checks your details and approves you.", href: "/become-a-host", cta: "Become a host" },
  { title: "Work with us as an agent", body: "Apply for an agent workspace to onboard properties and manage enquiries.", href: "/become-an-agent", cta: "Become an agent" },
  { title: "A problem with a listing", body: "Use “Report this listing” on the listing's page, so it reaches the moderators with the details attached.", href: "/buy", cta: "Browse listings" },
  { title: "A stay you've booked", body: "Your trip page has the host's phone number once the booking is confirmed, and lets you cancel.", href: "/account/trips", cta: "Your trips" },
];

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const [session, { topic }] = await Promise.all([getSession(), searchParams]);
  const topics = CONTACT_TOPICS.map((t) => [t, CONTACT_TOPIC_LABELS[t]] as [string, string]);

  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main>
        <section className="shell grid grid-cols-1 gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-12 lg:gap-16 lg:pt-20 lg:pb-28">
          <div className="lg:col-span-5">
            <p className="eyebrow flex items-center gap-3 text-brick">
              <span aria-hidden className="h-px w-8 bg-current" />
              Contact us
            </p>
            <h1 className="display mt-6 text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.95]">
              Talk to <em>Trustbrick.</em>
            </h1>
            <p className="mt-6 max-w-[42ch] text-[1.0625rem] leading-relaxed text-graphite">
              Questions about a home, a stay, listing a property or your account: write to us and a person from the team will reply by email.
            </p>
            <dl className="mt-10 space-y-5 border-t border-line-light pt-8 text-[0.9375rem]">
              <div>
                <dt className="eyebrow text-stone-deep">Replies</dt>
                <dd className="mt-1.5 text-graphite">By email, to the address you give us.</dd>
              </div>
              <div>
                <dt className="eyebrow text-stone-deep">Company</dt>
                <dd className="mt-1.5 text-graphite">{site.legalName}</dd>
              </div>
            </dl>
          </div>
          <div className="lg:col-span-7">
            <ContactForm
              topics={topics}
              defaultName={session?.user.name ?? ""}
              defaultEmail={session?.user.email ?? ""}
              defaultTopic={CONTACT_TOPICS.find((t) => t === topic)}
            />
          </div>
        </section>

        <section className="border-t border-line-light bg-paper">
          <div className="shell py-16 sm:py-20">
            <h2 className="text-[1.25rem] font-medium">Often quicker</h2>
            <ul className="mt-8 grid grid-cols-1 gap-px bg-line-light sm:grid-cols-2 lg:grid-cols-4">
              {SHORTCUTS.map((s) => (
                <li key={s.title} className="flex flex-col bg-paper p-6">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-graphite">{s.body}</p>
                  <Link href={s.href} className="link-rule mt-5 self-start text-[0.875rem] font-medium">
                    {s.cta} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

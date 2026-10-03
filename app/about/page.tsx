import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { images } from "@/lib/images";
import { FOR_OWNERS, LEGAL_VERIFICATION, SERVICES, links, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us — Trustbrick",
  description: "Trustbrick is building a more trustworthy way to find, rent, stay in and invest in property in India.",
};

// What a property decision depends on: the landing page's six pillars, in brief.
const PILLARS = [
  ["People", "Buyers, owners, tenants, agents and advisors: every decision passes through someone."],
  ["Place", "The street, the neighbourhood and the city around an address."],
  ["Value", "What a property is worth today, and what it could be worth tomorrow."],
  ["Trust", "Confidence that what you're told is accurate, complete and current."],
  ["Records", "Documents and data that are usually scattered and hard to verify."],
  ["Transactions", "Agreements, payments and paperwork that have to hold up."],
];

// How the product earns trust today. Each of these is how Trustbrick actually works.
const PRACTICES = [
  ["People are checked", "Every agent and every host is approved by a person on the Trustbrick team before they can list anything."],
  ["Listings are reviewed", "New listings are checked for missing details and possible duplicates before they appear, and anyone can report one that looks wrong."],
  ["Everything has a reference", "Each property, listing, booking and enquiry has its own reference, like LST-7K4M9Q2X, so there's never doubt about what you're talking about."],
  ["Your details stay yours", "A stay's exact address is shared only once your booking is confirmed, and your phone number only with the agent or host you contact."],
  ["Numbers are honest", "Prices and rents are the lister's own. Where we show a rent yield, it's worked out from the rent the seller declares, never a guess of ours."],
  ["Changes leave a trail", "Price changes, approvals and suspensions are recorded, so what happened to a listing can always be traced."],
];

const CITIES = ["Hyderabad", "Bengaluru", "Pune", "Mumbai", "North Goa"];

export default function AboutPage() {
  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main>
        <section className="shell grid grid-cols-1 gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-12 lg:items-end lg:gap-16 lg:pt-20 lg:pb-24">
          <div className="lg:col-span-7">
            <p className="eyebrow flex items-center gap-3 text-brick">
              <span aria-hidden className="h-px w-8 bg-current" />
              About us
            </p>
            <h1 className="display mt-6 text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.92]">
              Real estate, <em>built on trust.</em>
            </h1>
          </div>
          <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-graphite lg:col-span-5">
            Trustbrick is building a smarter, more connected way to discover, evaluate and experience real estate: one place to buy, rent, stay and invest, with the
            checks that make it safe to act on what you see.
          </p>
        </section>

        <div className="shell">
          <div className="relative aspect-[21/9] overflow-hidden bg-sand">
            <Image src={images.ideaPrimary.src} alt={images.ideaPrimary.alt} fill sizes="(min-width: 1280px) 1200px, 100vw" placeholder="blur" className="object-cover" />
          </div>
        </div>

        <section className="shell grid grid-cols-1 gap-10 py-20 sm:py-28 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="eyebrow text-stone-deep">Why we exist</p>
            <h2 className="display mt-4 text-[clamp(2rem,4vw,3rem)] leading-[1]">
              A property decision rests on more than a <em>listing.</em>
            </h2>
            <p className="mt-6 text-[1rem] leading-relaxed text-graphite">
              Buying, renting or investing touches six things at once. Today they live in different places, with different people, and little of it can be checked.
              Trustbrick brings them together.
            </p>
          </div>
          <dl className="grid grid-cols-1 gap-px bg-line-light sm:grid-cols-2 lg:col-span-8">
            {PILLARS.map(([title, body], i) => (
              <div key={title} className="bg-ivory p-6">
                <dt className="flex items-baseline gap-3">
                  <span className="font-mono text-[0.75rem] text-stone-deep">0{i + 1}</span>
                  <span className="text-[1.0625rem] font-medium">{title}</span>
                </dt>
                <dd className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-contrast text-on-contrast" data-nav="dark">
          <div className="shell py-20 sm:py-28">
            <p className="eyebrow text-on-contrast/50">What you can do today</p>
            <h2 className="display mt-4 max-w-[18ch] text-[clamp(2rem,4vw,3rem)] leading-[1]">
              One place to find, list and <em>live.</em>
            </h2>
            <ul className="mt-12 grid grid-cols-1 gap-px bg-line-dark sm:grid-cols-2 lg:grid-cols-4">
              {[...SERVICES, LEGAL_VERIFICATION, ...FOR_OWNERS, { href: links.contact, label: "Talk to us", hint: "Questions, partnerships or feedback" }].map((s) => (
                <li key={s.href} className="bg-contrast">
                  <Link href={s.href} className="group flex h-full flex-col p-6 transition-colors hover:bg-on-contrast/[0.04]">
                    <span className="flex items-center justify-between text-[1.125rem] font-medium">
                      {s.label}
                      <span aria-hidden className="text-brick-bright transition-transform duration-300 group-hover:translate-x-1">
                        →
                      </span>
                    </span>
                    <span className="mt-2 text-[0.9375rem] leading-relaxed text-on-contrast/65">{s.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[0.9375rem] text-on-contrast/60">Available today in {CITIES.slice(0, -1).join(", ")} and {CITIES.at(-1)}.</p>
          </div>
        </section>

        <section className="shell py-20 sm:py-28">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <p className="eyebrow text-stone-deep">How we build trust</p>
              <h2 className="display mt-4 text-[clamp(2rem,4vw,3rem)] leading-[1]">
                Not a promise. <em>How it works.</em>
              </h2>
            </div>
            <ul className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:col-span-8">
              {PRACTICES.map(([title, body]) => (
                <li key={title} className="border-t border-ink pt-5">
                  <p className="text-[1.0625rem] font-medium">{title}</p>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-line-light bg-paper">
          <div className="shell flex flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow text-stone-deep">The company</p>
              <p className="display mt-4 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.05]">{site.legalName}</p>
              <p className="mt-3 max-w-[52ch] text-[0.9375rem] text-graphite">
                We&apos;re early, and building in the open with the people who use Trustbrick. If something could be better, tell us.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={links.contact} className="btn btn-dark">
                <span>Contact us</span>
              </Link>
              <Link href="/stays" className="btn btn-ghost-dark">
                <span>Explore Home Stay</span>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

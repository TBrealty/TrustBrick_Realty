import { ButtonLink } from "@/components/buttons/ButtonLink";
import { Lines } from "@/components/typography/Lines";

const BENEFITS = [
  { title: "Free to start", body: "List properties, take enquiries and accept bookings on the free plan. Pro and Business add more as you grow, each with a free trial." },
  { title: "One workspace", body: "Listings, leads, site visits, bookings and your hosting calendar in one place, with every enquiry tracked from first message to close." },
  { title: "Tours that sell", body: "Add 360° photos, a 3D model or a Matterport tour to any listing. The Trustbrick app's guided camera makes a 360° photo from your phone (app coming soon)." },
];

/** For the people who list: agents, brokerages, developers and hosts. */
export function ForPartners() {
  return (
    <section id="partners" aria-labelledby="partners-title" data-nav="dark" className="surface-dark relative overflow-hidden bg-contrast py-20 text-on-contrast sm:py-24 lg:py-28">
      <div aria-hidden className="pointer-events-none absolute -bottom-48 left-[-10%] size-[34rem] rounded-full bg-brick/20 blur-3xl" />
      <div className="shell relative">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p data-reveal className="eyebrow flex items-center gap-3 text-brick-bright">
              <span aria-hidden className="h-px w-8 bg-current" />
              For agents, brokers and hosts
            </p>
            <h2 id="partners-title" data-reveal="lines" className="display mt-6 text-[clamp(2.5rem,5.4vw,5.75rem)]">
              <Lines lines={["List on Trustbrick.", <em key="e">Be found for the right reasons.</em>]} step={120} />
            </h2>
          </div>
          <div data-reveal className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end lg:pb-3">
            <ButtonLink href="/become-an-agent" variant="light" arrow>
              Become an agent
            </ButtonLink>
            <ButtonLink href="/become-a-host" variant="ghost-light">
              Host your home
            </ButtonLink>
          </div>
        </div>

        <ul className="mt-10 grid gap-px overflow-hidden border border-line-dark bg-line-dark sm:mt-14 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <li key={b.title} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="bg-contrast p-6 sm:p-8">
              <h3 className="display text-[clamp(1.75rem,2.6vw,2.25rem)] leading-none">{b.title}</h3>
              <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-on-contrast/70">{b.body}</p>
            </li>
          ))}
        </ul>

        <p data-reveal className="mt-8 text-[0.9375rem] text-on-contrast/70">
          Selling your own home?{" "}
          <a href="/contact?topic=listing_hosting" className="text-on-contrast underline decoration-on-contrast/40 underline-offset-4 transition-colors hover:decoration-on-contrast">
            Talk to us →
          </a>
        </p>
      </div>
    </section>
  );
}

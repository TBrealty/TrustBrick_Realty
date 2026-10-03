"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Arrow } from "@/components/buttons/ButtonLink";
import { INTENT_EVENT, type Intent } from "@/components/hero/IntentSelector";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { Lines } from "@/components/typography/Lines";
import { images } from "@/lib/images";

const paths = [
  {
    id: "home",
    intents: ["buy", "rent", "pg_men", "pg_women"],
    title: "Find a home",
    line: "Buy or rent with better information.",
    audience: "Homebuyers · Renters",
    body: "See the property, the paperwork and the place around it before you commit to a visit, a deposit or a decision.",
    image: images.pathHome,
    href: "/buy",
  },
  {
    id: "stay",
    intents: ["stay"],
    title: "Home Stay or host",
    line: "Homes by the night, from checked hosts.",
    audience: "Travellers · Hosts",
    body: "Book a whole home or a private room with the price clear night by night, or open your own home to guests and set your dates, rates and rules.",
    image: images.pathStay,
    href: "/stays",
  },
  {
    id: "sell",
    intents: ["sell"],
    title: "Sell property",
    line: "Reach serious buyers and simplify the journey.",
    audience: "Owners · Sellers",
    body: "Present your property with the details serious buyers look for, and move from interest to agreement with less friction.",
    image: images.pathSell,
    // Owners can't list for themselves yet, so selling starts with a conversation.
    href: "/contact?topic=listing_hosting",
  },
  {
    id: "business",
    intents: [],
    title: "Build your business",
    line: "Power for agents, brokers and developers.",
    audience: "Agents · Brokers · Developers",
    body: "Tools shaped around how real-estate professionals actually work, from the first enquiry to the final handover.",
    image: images.pathBuild,
    href: "/become-an-agent",
  },
  {
    id: "invest",
    intents: ["invest"],
    title: "Invest smarter",
    line: "Better data for better real-estate decisions.",
    audience: "Investors",
    body: "Read value, demand and neighborhood context with clearer data, so capital follows evidence rather than noise.",
    image: images.pathInvest,
    href: "/invest",
  },
] as const;

export function Paths() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onIntent = (event: Event) => {
      const intent = (event as CustomEvent<Intent>).detail;
      const index = paths.findIndex((p) => (p.intents as readonly string[]).includes(intent));
      if (index >= 0) setActive(index);
    };
    window.addEventListener(INTENT_EVENT, onIntent);
    return () => window.removeEventListener(INTENT_EVENT, onIntent);
  }, []);

  return (
    <section id="paths" aria-labelledby="paths-title" className="relative bg-paper py-24 text-ink sm:py-32 lg:py-44">
      <div className="shell">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <SectionLabel index="02" className="mb-10 text-stone-deep">
              Five paths
            </SectionLabel>
            <h2 id="paths-title" data-reveal="lines" className="display text-[clamp(2.75rem,6.2vw,6.75rem)]">
              <Lines lines={["Wherever you stand,", <em key="e">there&rsquo;s a way through.</em>]} />
            </h2>
          </div>
          <p data-reveal className="max-w-[40ch] text-[1.0625rem] leading-relaxed text-stone-deep lg:col-span-4 lg:col-start-9 lg:pb-3">
            Moving in, staying a while, moving on, building a business or building wealth. Trustbrick is being designed around each
            of these journeys, with one standard of information underneath all of them.
          </p>
        </div>

        <div className="mt-16 grid gap-x-8 sm:mt-24 lg:grid-cols-12">
          <ul className="border-t border-line-light lg:col-span-7">
            {paths.map((path, i) => {
              const isActive = i === active;
              return (
                <li key={path.id} id={`path-${path.id}`} data-reveal style={{ "--d": `${i * 70}ms` } as React.CSSProperties} className="border-b border-line-light">
                  <Link
                    href={path.href}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    aria-describedby={`path-${path.id}-line`}
                    className="group block py-8 sm:py-10 lg:py-9"
                  >
                    {/* Mobile & tablet carry their own image */}
                    <div className="relative mb-6 aspect-4/3 overflow-hidden bg-sand sm:aspect-16/9 lg:hidden">
                      <Image src={path.image.src} alt={path.image.alt} fill sizes="100vw" placeholder="blur" className="object-cover" />
                    </div>

                    <div className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-x-3 sm:grid-cols-[3.5rem_1fr_auto]">
                      <span className="eyebrow tabular-nums text-stone-deep">0{i + 1}</span>
                      <h3
                        className={`display text-[clamp(2.4rem,5.4vw,5.5rem)] leading-[0.95] transition-[color,transform] duration-500 ease-(--ease-smooth) ${
                          isActive ? "text-ink lg:translate-x-3" : "text-ink lg:text-[color-mix(in_oklab,var(--ink)_42%,var(--paper))]"
                        }`}
                      >
                        {path.title}
                      </h3>
                      <span
                        aria-hidden
                        className={`grid size-10 place-items-center self-center rounded-full border transition-[background-color,border-color,color,transform] duration-500 ease-(--ease-smooth) sm:size-12 ${
                          isActive ? "border-ink bg-ink text-paper lg:-rotate-45" : "border-line-light text-ink"
                        }`}
                      >
                        <Arrow className="size-4" />
                      </span>
                    </div>

                    <div
                      className={`grid grid-cols-[2.25rem_1fr] gap-x-3 transition-transform duration-500 ease-(--ease-smooth) sm:grid-cols-[3.5rem_1fr] ${
                        isActive ? "lg:translate-x-3" : ""
                      }`}
                    >
                      <p id={`path-${path.id}-line`} className="col-start-2 mt-3 text-[1.0625rem] text-graphite sm:text-[1.1875rem]">
                        {path.line}
                      </p>
                      <div
                        className={`col-start-2 grid transition-[grid-template-rows,opacity] duration-500 ease-(--ease-smooth) max-lg:grid-rows-[1fr] ${
                          isActive ? "opacity-100 lg:grid-rows-[1fr]" : "lg:grid-rows-[0fr] lg:opacity-0"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <p className="max-w-[46ch] pt-4 text-[0.9375rem] leading-relaxed text-stone-deep">{path.body}</p>
                          <p className="eyebrow pt-5 text-brick">{path.audience}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop stage: one frame, one photograph per path */}
          <div className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-28">
              <div data-reveal="image" className="relative aspect-4/5 overflow-hidden bg-contrast">
                {paths.map((path, i) => (
                  <Image
                    key={path.id}
                    src={path.image.src}
                    alt={i === active ? path.image.alt : ""}
                    aria-hidden={i !== active}
                    fill
                    sizes="40vw"
                    placeholder="blur"
                    className={`object-cover transition-[opacity,transform] duration-900 ease-(--ease-smooth) ${
                      i === active ? "scale-100 opacity-100" : "scale-[1.06] opacity-0"
                    }`}
                  />
                ))}
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-contrast/70 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-on-contrast" aria-live="polite">
                  <p className="eyebrow">{paths[active].audience}</p>
                  <p className="eyebrow tabular-nums text-on-contrast/70">
                    0{active + 1} / {String(paths.length).padStart(2, "0")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

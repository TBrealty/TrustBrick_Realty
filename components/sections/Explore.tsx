import Link from "next/link";
import { Arrow } from "@/components/buttons/ButtonLink";
import { ListingCard } from "@/components/listings/ListingCard";
import { SectionLabel } from "@/components/typography/SectionLabel";
import { getSession } from "@/lib/auth/session";
import type { HomeRow } from "@/lib/listings/home";
import { savedPropertyIds } from "@/lib/listings/queries";

const WAYS_IN = [
  { label: "Buy", note: "Homes and plots for sale", href: "/buy" },
  { label: "Rent", note: "Homes to rent", href: "/rent" },
  { label: "PG", note: "Rooms and beds, by the month", href: "/pg" },
  { label: "Stay", note: "Homestays by the night", href: "/stays" },
  { label: "Invest", note: "Yield, growth and new launches", href: "/invest" },
];

/**
 * Straight after the hero: ways into each kind of search, then real listings in rows (homes with
 * tours, the newest, homestays). A row appears only once it has something in it.
 */
export async function Explore({ rows }: { rows: HomeRow[] }) {
  const session = rows.length ? await getSession() : null;
  const saved = session ? await savedPropertyIds(session.user.id, rows.flatMap((r) => r.items.map((l) => l.propertyId))) : new Set<string>();

  return (
    <section id="explore" aria-labelledby="explore-title" className="relative bg-ivory py-16 text-ink sm:py-20 lg:py-24">
      <div className="shell">
        <SectionLabel index="01" className="mb-6 text-stone-deep">
          Explore
        </SectionLabel>
        <h2 id="explore-title" className="sr-only">
          Explore Trustbrick
        </h2>

        <ul data-reveal className="grid grid-cols-2 gap-px overflow-hidden border border-line-light bg-line-light md:grid-cols-5">
          {WAYS_IN.map((w) => (
            <li key={w.href} className="bg-ivory last:col-span-2 md:last:col-span-1">
              <Link href={w.href} className="group flex h-full flex-col justify-between gap-6 p-5 transition-colors duration-300 hover:bg-paper sm:p-6">
                <span className="flex items-center justify-between">
                  <span className="display text-[2rem] leading-none sm:text-[2.25rem]">{w.label}</span>
                  <Arrow className="size-4 text-stone-deep transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ink" />
                </span>
                <span className="text-[0.875rem] leading-snug text-stone-deep">{w.note}</span>
              </Link>
            </li>
          ))}
        </ul>

        {rows.map((row) => (
          <div key={row.id} data-reveal className="mt-14 sm:mt-16">
            <div className="mb-5 flex items-end justify-between gap-6">
              <div>
                <h3 className="display text-[clamp(1.9rem,3.2vw,2.75rem)] leading-none">{row.title}</h3>
                <p className="mt-2 text-[0.9375rem] text-stone-deep">{row.subtitle}</p>
              </div>
              <Link href={row.href} className="link-rule shrink-0 text-[0.9375rem] text-brick">
                See all →
              </Link>
            </div>
            <ul className="-mx-(--gutter) flex snap-x snap-mandatory scroll-px-(--gutter) gap-5 overflow-x-auto px-(--gutter) pb-2 [scrollbar-width:thin]">
              {row.items.map((listing) => (
                <li key={listing.id} className="w-[78%] shrink-0 snap-start sm:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]">
                  <ListingCard listing={listing} kind={row.kind} saved={saved.has(listing.propertyId)} isLoggedIn={Boolean(session)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

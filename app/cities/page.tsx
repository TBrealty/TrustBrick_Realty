import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { getBrowseOptions } from "@/lib/listings/queries";
import { KIND_LINK, KIND_ORDER, placePath } from "@/lib/listings/places";

export const metadata: Metadata = {
  title: "Browse by city — Trustbrick",
  description: "Homes for sale and rent, PGs, homestays and investment properties on Trustbrick, city by city.",
};

/** Every city Trustbrick covers, each with its pages for buying, renting, PGs, homestays and investing. */
export default async function CitiesPage() {
  await connection();
  const cities = await getBrowseOptions("rent")
    .then((o) => o.cities)
    .catch(() => []);

  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main className="shell pt-12 pb-24 sm:pt-16">
        <p className="eyebrow flex items-center gap-3 text-brick">
          <span aria-hidden className="h-px w-8 bg-current" />
          Cities
        </p>
        <h1 className="display mt-4 text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95]">Browse by city</h1>
        <p className="mt-4 max-w-[56ch] text-[1.0625rem] text-graphite">Pick a city to see what&rsquo;s there to buy, rent or stay in, and its localities.</p>

        {cities.length === 0 ? (
          <p className="mt-12 text-stone-deep">Cities will appear here shortly.</p>
        ) : (
          <ul className="mt-12 grid gap-px overflow-hidden border border-line-light bg-line-light sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((city) => (
              <li key={city.slug} className="bg-ivory p-6 sm:p-8">
                <h2 className="display text-[2.25rem] leading-none">{city.name}</h2>
                <p className="mt-2 text-[0.875rem] text-stone-deep">
                  {city.localities.length} {city.localities.length === 1 ? "locality" : "localities"}
                </p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {KIND_ORDER.map((kind) => (
                    <li key={kind}>
                      <Link
                        href={placePath(kind, city.slug)}
                        className="inline-flex h-9 items-center rounded-full border border-line-light bg-paper px-4 text-[0.875rem] text-graphite transition-colors hover:border-ink hover:text-ink"
                      >
                        {KIND_LINK[kind]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

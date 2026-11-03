import Link from "next/link";
import { notFound } from "next/navigation";
import { ServicePage } from "@/components/navigation/ServicePage";
import { KIND_META, type ListingKind, parseFilters, type RawSearchParams } from "@/lib/listings/filters";
import { KIND_LINK, KIND_ORDER, findPlace, placeIntro, placePath, placeTitle } from "@/lib/listings/places";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { site } from "@/lib/site";
import { BrowsePage } from "./BrowsePage";

/**
 * A city or locality landing page: the kind's search narrowed to the place, a heading and intro
 * about what's there, links to its busiest localities and to the place's other kinds, and
 * breadcrumbs (also as structured data, for search results).
 */
export async function PlacePage({
  kind,
  params,
  searchParams,
}: {
  kind: ListingKind;
  params: Promise<{ city: string; locality?: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { city, locality } = await params;
  const place = await findPlace(kind, city, locality);
  if (!place) notFound();

  // The place goes into the search; anything else in the address (sort, filters, a page cursor) stays.
  const query = await searchParams;
  const narrowed = Promise.resolve({ ...query, city: place.city.slug, ...(place.locality ? { locality: place.locality.slug } : {}) });
  const shell = SERVICE_SHELLS[kind]!;
  const current = shell.sectionFor(parseFilters(kind, await narrowed));
  const meta = KIND_META[kind];

  const crumbs = [
    { label: "Trustbrick", href: "/" },
    { label: meta.navLabel, href: meta.path },
    { label: place.city.name, href: placePath(kind, place.city.slug) },
    ...(place.locality ? [{ label: place.locality.name, href: place.path }] : []),
  ];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${site.url}${c.href}` })),
  };

  // Localities with listings come first; the rest of the city's localities after, so every
  // locality page is reachable from its city's page.
  const busy = place.locality ? [] : place.stats.localities;
  const quiet = place.locality ? [] : place.cityLocalities.filter((l) => !busy.some((b) => b.slug === l.slug));
  const siblings = place.locality ? place.cityLocalities.filter((l) => l.slug !== place.locality!.slug) : [];

  return (
    <ServicePage shell={shell} current={current}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\u003c") }} />
      <BrowsePage
        kind={kind}
        searchParams={narrowed}
        breadcrumbs={crumbs.slice(1)}
        heading={{ eyebrow: meta.eyebrow, title: placeTitle(kind, place.name), intro: placeIntro(place) }}
      >
        <div className="mt-16 grid gap-10 border-t border-line-light pt-10 lg:grid-cols-2">
          {(busy.length > 0 || quiet.length > 0) && (
            <nav aria-label={`Localities in ${place.city.name}`}>
              <h2 className="display text-[1.75rem] leading-none">Localities in {place.city.name}</h2>
              <ul className="mt-5 flex flex-wrap gap-2">
                {[...busy, ...quiet.map((l) => ({ ...l, count: 0 }))].map((l) => (
                  <li key={l.slug}>
                    <Link
                      href={placePath(kind, place.city.slug, l.slug)}
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-line-light bg-paper px-4 text-[0.875rem] text-graphite transition-colors hover:border-ink hover:text-ink"
                    >
                      {l.name}
                      {l.count > 0 && <span className="text-stone-deep">{l.count}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {siblings.length > 0 && (
            <nav aria-label={`Nearby in ${place.city.name}`}>
              <h2 className="display text-[1.75rem] leading-none">More of {place.city.name}</h2>
              <ul className="mt-5 flex flex-wrap gap-2">
                {siblings.map((l) => (
                  <li key={l.slug}>
                    <Link
                      href={placePath(kind, place.city.slug, l.slug)}
                      className="inline-flex h-9 items-center rounded-full border border-line-light bg-paper px-4 text-[0.875rem] text-graphite transition-colors hover:border-ink hover:text-ink"
                    >
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <nav aria-label={`More in ${place.name}`}>
            <h2 className="display text-[1.75rem] leading-none">Also in {place.name}</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {KIND_ORDER.filter((k) => k !== kind).map((k) => (
                <li key={k}>
                  <Link
                    href={placePath(k, place.city.slug, place.locality?.slug)}
                    className="inline-flex h-9 items-center rounded-full border border-line-light bg-paper px-4 text-[0.875rem] text-graphite transition-colors hover:border-ink hover:text-ink"
                  >
                    {KIND_LINK[k]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </BrowsePage>
    </ServicePage>
  );
}

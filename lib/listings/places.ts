import "server-only";
import { cache } from "react";
import { formatPrice } from "@/lib/format";
import { KIND_META, type ListingKind, parseFilters } from "@/lib/listings/filters";
import { getBrowseOptions, type PlaceStats, placeStats } from "@/lib/listings/queries";
import { site } from "@/lib/site";

/**
 * City and locality landing pages: /rent/hyderabad, /rent/hyderabad/kondapur and so on for every
 * kind. Each is the kind's search, already narrowed to the place, with its own title,
 * description and canonical address, for people who search "flats for rent in Kondapur".
 */

export type Place = {
  kind: ListingKind;
  city: { slug: string; name: string };
  locality: { slug: string; name: string } | null;
  /** "Kondapur, Hyderabad" or "Hyderabad". */
  name: string;
  path: string;
  stats: PlaceStats;
  /** The city's other localities, for links. */
  cityLocalities: { slug: string; name: string }[];
};

export const KIND_ORDER: ListingKind[] = ["buy", "rent", "pg", "stay", "invest"];

/** What a place page is called, per kind: "Homes for rent in Kondapur, Hyderabad". */
export function placeTitle(kind: ListingKind, name: string): string {
  switch (kind) {
    case "buy":
      return `Homes and plots for sale in ${name}`;
    case "rent":
      return `Homes for rent in ${name}`;
    case "pg":
      return `PGs and co-living in ${name}`;
    case "stay":
      return `Homestays in ${name}`;
    case "invest":
      return `Properties to invest in around ${name}`;
  }
}

/** A short name for the kind, for links to a place's other pages. */
export const KIND_LINK: Record<ListingKind, string> = { buy: "Buy", rent: "Rent", pg: "PGs", stay: "Homestays", invest: "Invest" };

const NOUN: Record<ListingKind, [string, string]> = {
  buy: ["home or plot for sale", "homes and plots for sale"],
  rent: ["home for rent", "homes for rent"],
  pg: ["PG", "PGs and co-living spaces"],
  stay: ["homestay", "homestays"],
  invest: ["property to invest in", "properties to invest in"],
};

export const placePath = (kind: ListingKind, city: string, locality?: string | null) => `${KIND_META[kind].path}/${city}${locality ? `/${locality}` : ""}`;

/** The place for a URL, or null when the city or locality isn't one Trustbrick knows. */
export const findPlace = cache(async (kind: ListingKind, citySlug: string, localitySlug?: string): Promise<Place | null> => {
  const options = await getBrowseOptions(kind);
  const city = options.cities.find((c) => c.slug === citySlug);
  if (!city) return null;
  const locality = localitySlug ? (city.localities.find((l) => l.slug === localitySlug) ?? null) : null;
  if (localitySlug && !locality) return null;
  const stats = await placeStats(kind, parseFilters(kind, { city: city.slug, ...(locality ? { locality: locality.slug } : {}) }));
  return {
    kind,
    city: { slug: city.slug, name: city.name },
    locality: locality ? { slug: locality.slug, name: locality.name } : null,
    name: locality ? `${locality.name}, ${city.name}` : city.name,
    path: placePath(kind, city.slug, locality?.slug),
    stats,
    cityLocalities: city.localities,
  };
});

/**
 * A sentence that says something true about the place's listings right now. The page shows the
 * count beside it already; search results (`withCount`) need it in the sentence.
 */
export function placeIntro(place: Place, { withCount = false } = {}): string {
  const { kind, stats } = place;
  const [one, many] = NOUN[kind];
  if (stats.total === 0) return `No ${many} in ${place.name} on Trustbrick yet. ${KIND_META[kind].intro}`;
  const count = withCount ? `${stats.total} ${stats.total === 1 ? one : many} in ${place.name}` : `${many.charAt(0).toUpperCase()}${many.slice(1)} in ${place.name}`;
  const suffix = KIND_META[kind].priceSuffix ?? "";
  const range =
    stats.minPrice && stats.maxPrice
      ? stats.minPrice === stats.maxPrice
        ? `, at ${formatPrice(stats.minPrice)}${suffix}`
        : `, from ${formatPrice(stats.minPrice)} to ${formatPrice(stats.maxPrice)}${suffix}`
      : "";
  return `${count}${range}, from agents and hosts Trustbrick has approved.`;
}

export function placeMetadata(place: Place) {
  const title = `${placeTitle(place.kind, place.name)} — Trustbrick`;
  const description = `${placeIntro(place, { withCount: true })} See photos, prices and virtual tours, and contact the agent or host directly.`;
  const url = `${site.url}${place.path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" as const },
    // A page with nothing on it helps no one who finds it in a search: keep it out of the index
    // until it has listings (its links still count).
    robots: place.stats.total === 0 ? { index: false, follow: true } : undefined,
  };
}

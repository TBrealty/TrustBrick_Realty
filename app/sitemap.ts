import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { KIND_ORDER, placePath } from "@/lib/listings/places";
import { placesWithListings } from "@/lib/listings/queries";
import { site } from "@/lib/site";

/**
 * The site's pages for search engines, including every city and locality landing page that has
 * listings right now (empty ones are left out, and marked noindex). Built per request, so new
 * places appear as soon as they have a listing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const fixed: MetadataRoute.Sitemap = [
    { url: site.url, changeFrequency: "daily", priority: 1 },
    ...["/buy", "/rent", "/pg", "/stays", "/invest"].map((path) => ({ url: `${site.url}${path}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...["/buy/guide", "/buy/emi-calculator", "/buy/costs", "/rent/guide", "/rent/move-in-costs", "/pg/checklist", "/pg/compare", "/invest/yield-calculator", "/invest/guide", "/stays/guide", "/stays/split-cost", "/legal-verification", "/legal-verification/apply", "/legal-verification/documents"].map((path) => ({ url: `${site.url}${path}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${site.url}/cities`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site.url}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${site.url}/contact`, changeFrequency: "yearly", priority: 0.4 },
  ];

  let places: MetadataRoute.Sitemap = [];
  try {
    const perKind = await Promise.all(KIND_ORDER.map(async (kind) => ({ kind, rows: await placesWithListings(kind) })));
    const seen = new Set<string>();
    for (const { kind, rows } of perKind) {
      for (const r of rows) {
        for (const path of [placePath(kind, r.city), placePath(kind, r.city, r.locality)]) {
          if (seen.has(path)) continue;
          seen.add(path);
          places.push({ url: `${site.url}${path}`, changeFrequency: "daily", priority: path.split("/").length === 3 ? 0.7 : 0.6 });
        }
      }
    }
  } catch (error) {
    // The fixed pages still go out if the database can't be reached.
    console.error("[sitemap] couldn't list place pages:", error instanceof Error ? error.message : error);
    places = [];
  }
  return [...fixed, ...places];
}

import type { ListingSummary } from "@/api/types";
import type { SearchState } from "@/hooks/use-search";
import { createLocalStore } from "@/storage/local";

/** The city the home screen is about (a slug and its name), chosen once and remembered. */
export const cityStore = createLocalStore<{ slug: string; name: string } | null>("home-city", null);

/** The last homes the person opened, newest first, for "Recently viewed". */
export const recentStore = createLocalStore<ListingSummary[]>("recently-viewed", []);

/** The last search the person ran, for "Continue your search". */
export const lastSearchStore = createLocalStore<(SearchState & { label: string }) | null>("last-search", null);

const SUMMARY_KEYS = [
  "id", "referenceId", "propertyId", "title", "transactionType", "status", "price", "priceNegotiable", "offer",
  "depositAmount", "declaredMonthlyRent", "availableFrom", "isSample", "publishedAt", "typeCode", "typeName",
  "category", "locality", "city", "carpetAreaSqft", "plotAreaSqyd", "lifecycleStatus", "bedrooms", "bathrooms",
  "furnishing", "projectName", "projectStatus", "possessionDate", "genderPolicy", "meals", "foodPreference",
  "occupancies", "image", "tour", "stay",
] as const satisfies readonly (keyof ListingSummary)[];

/** Remembers a listing the person opened (only what a card needs), keeping the last 12. */
export function rememberViewed(listing: ListingSummary) {
  const summary = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, listing[k]])) as unknown as ListingSummary;
  recentStore.set((list) => [summary, ...list.filter((l) => l.referenceId !== listing.referenceId)].slice(0, 12));
}

/** A greeting for the time of day, in India. */
export function greeting(now = new Date()): string {
  const hour = (now.getUTCHours() + 5.5) % 24;
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

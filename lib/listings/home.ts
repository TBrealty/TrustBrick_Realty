import "server-only";
import { after } from "next/server";
import { parseFilters, type ListingKind } from "@/lib/listings/filters";
import { getBrowseOptions, searchListings } from "@/lib/listings/queries";
import type { ListingSummary } from "@/lib/listings/types";

/**
 * What the landing page shows from the live catalogue: a few rows of real listings, the same
 * ones the app's home screen has, and the locations for the hero's search.
 *
 * Shared by every visitor and refreshed at most once a minute, in the background: a visitor is
 * served the last good copy straight away and never waits for the database (except the very
 * first view after the server starts, which the deploy script makes itself). If the database
 * can't be reached, the last good copy stays; with none yet, the rows are simply empty: the
 * landing page must load whatever happens behind it.
 */

export type HomeRow = { id: "tours" | "fresh" | "stays"; title: string; subtitle: string; kind: ListingKind; href: string; items: ListingSummary[] };
export type HomeData = { rows: HomeRow[]; locations: { slug: string; name: string }[] };

const TTL_MS = 60_000;
const ROW_SIZE = 8;
let fresh: { at: number; data: HomeData } | null = null;
let loading: Promise<HomeData> | null = null;

/** Newest first across several kinds, without repeats. */
function merge(lists: ListingSummary[][]): ListingSummary[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, ROW_SIZE);
}

const search = async (kind: ListingKind, params: Record<string, string> = {}) => (await searchListings(kind, parseFilters(kind, params))).items;

async function load(): Promise<HomeData> {
  const [tourRent, tourBuy, freshRent, freshBuy, stays, options] = await Promise.all([
    search("rent", { tour: "1" }),
    search("buy", { tour: "1" }),
    search("rent"),
    search("buy"),
    search("stay"),
    getBrowseOptions("rent"),
  ]);
  const rows: HomeRow[] = [
    { id: "tours", title: "Walk through in 3D", subtitle: "Tour these homes from your sofa", kind: "rent", href: "/rent?tour=1", items: merge([tourRent, tourBuy]) },
    { id: "fresh", title: "Fresh on Trustbrick", subtitle: "The newest homes to rent and buy", kind: "rent", href: "/rent", items: merge([freshRent, freshBuy]) },
    { id: "stays", title: "Homestays", subtitle: "Whole homes and rooms by the night", kind: "stay", href: "/stays", items: stays.slice(0, ROW_SIZE) },
  ];
  return { rows: rows.filter((r) => r.items.length > 0), locations: options.cities.map((c) => ({ slug: c.slug, name: c.name })) };
}

/** Loads the rows once, however many views ask at the same time. */
function refresh(): Promise<HomeData> {
  loading ??= load()
    .then((data) => {
      fresh = { at: Date.now(), data };
      return data;
    })
    .catch((error) => {
      console.error("[home] couldn't load the landing page's listings:", error instanceof Error ? error.message : error);
      // Keep what we had; the next view tries again.
      return fresh?.data ?? { rows: [], locations: [] };
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

const stale = () => !fresh || Date.now() - fresh.at > TTL_MS;

/**
 * Refreshes once the response has gone, so the refresh never slows the visitor who noticed the
 * copy was old. Outside a request (tests, scripts) there's no response to wait for.
 */
function refreshLater() {
  const run = () => (stale() ? refresh() : undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

export function homeData(): Promise<HomeData> {
  if (!fresh) return refresh();
  if (stale()) refreshLater();
  return Promise.resolve(fresh.data);
}

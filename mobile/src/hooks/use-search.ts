import { useSyncExternalStore } from "react";
import type { ListingKind, Sort } from "@/lib/listings/filters";

/**
 * What the person is searching for, shared by Explore and the Filters screen. Sent to
 * /listings with the website's own parameter names, so filters mean the same everywhere.
 */
export type SearchState = {
  kind: ListingKind;
  q: string;
  city: string | null;
  localities: string[];
  min: number | null;
  max: number | null;
  bhk: string[];
  furnishing: string[];
  types: string[];
  tour: boolean;
  sort: Sort;
};

export const EMPTY_FILTERS: Omit<SearchState, "kind" | "q"> = {
  city: null,
  localities: [],
  min: null,
  max: null,
  bhk: [],
  furnishing: [],
  types: [],
  tour: false,
  sort: "newest",
};

let state: SearchState = { kind: "rent", q: "", ...EMPTY_FILTERS };
const listeners = new Set<() => void>();

export function setSearch(patch: Partial<SearchState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSearch(): SearchState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** The search as /listings query parameters. */
export function searchParams(s: SearchState): Record<string, string | string[] | number | boolean | null> {
  return {
    kind: s.kind,
    q: s.q.trim() || null,
    city: s.city,
    locality: s.localities,
    min: s.min,
    max: s.max,
    bhk: s.kind === "buy" || s.kind === "rent" ? s.bhk : [],
    furnishing: s.kind === "buy" || s.kind === "rent" ? s.furnishing : [],
    type: s.types,
    tour: s.tour,
    sort: s.sort === "newest" ? null : s.sort,
  };
}

export function activeFilters(s: SearchState): number {
  return (
    Number(Boolean(s.city)) +
    s.localities.length +
    Number(Boolean(s.min || s.max)) +
    s.bhk.length +
    s.furnishing.length +
    s.types.length +
    Number(s.tour) +
    Number(s.sort !== "newest")
  );
}

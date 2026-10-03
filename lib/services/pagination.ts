/**
 * Page-number pagination for workspace tables: a page is always bounded, so no table ever
 * loads a whole collection. Deep pages cost more with OFFSET; tables whose working set grows
 * past a few thousand pages should move to the keyset pattern used by the public browse pages.
 */
export const PAGE_SIZE = 25;
export const MAX_PAGE = 2000;

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export function parsePage(value: unknown): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1;
}

export function pageParams(page: number, pageSize = PAGE_SIZE) {
  const safe = Math.min(Math.max(1, Math.floor(page)), MAX_PAGE);
  return { limit: pageSize, offset: (safe - 1) * pageSize };
}

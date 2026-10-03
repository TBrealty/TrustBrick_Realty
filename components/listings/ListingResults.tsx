"use client";

import { useState, useTransition } from "react";
import { loadMoreListingsAction } from "@/app/(browse)/actions";
import type { ListingKind } from "@/lib/listings/filters";
import type { ListingSummary } from "@/lib/listings/queries";
import { ListingCard } from "./ListingCard";

/** Stays carry the chosen dates and guests through to the booking panel. */
function stayDetailQuery(query: string): string {
  const from = new URLSearchParams(query);
  const to = new URLSearchParams();
  for (const key of ["check_in", "check_out", "guests"]) {
    const v = from.get(key);
    if (v) to.set(key, v);
  }
  const qs = to.toString();
  return qs ? `?${qs}` : "";
}

type Props = {
  kind: ListingKind;
  /** The current filters as a query string, without the cursor. */
  query: string;
  initialItems: ListingSummary[];
  initialCursor: string | null;
  initialSavedIds: string[];
  isLoggedIn: boolean;
  total: number;
};

/**
 * Keyset-paginated results. "Show more" appends the next page in place; without
 * JavaScript the same control is an ordinary link to the next page.
 */
export function ListingResults({ kind, query, initialItems, initialCursor, initialSavedIds, isLoggedIn, total }: Props) {
  const detailQuery = kind === "stay" ? stayDetailQuery(query) : "";
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [saved, setSaved] = useState(() => new Set(initialSavedIds));
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const loadMore = (event: React.MouseEvent) => {
    if (!cursor) return;
    event.preventDefault();
    setFailed(false);
    startTransition(async () => {
      try {
        const next = await loadMoreListingsAction(kind, query, cursor);
        setItems((current) => {
          const seen = new Set(current.map((i) => i.id));
          return [...current, ...next.items.filter((i) => !seen.has(i.id))];
        });
        setSaved((current) => new Set([...current, ...next.savedIds]));
        setCursor(next.nextCursor);
      } catch {
        setFailed(true);
      }
    });
  };

  const nextHref = cursor ? `?${new URLSearchParams([...new URLSearchParams(query), ["cursor", cursor]])}` : null;

  return (
    <>
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((listing, i) => (
          <li key={listing.id}>
            <ListingCard listing={listing} kind={kind} saved={saved.has(listing.propertyId)} isLoggedIn={isLoggedIn} priority={i < 3} detailQuery={detailQuery} />
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-col items-center gap-3">
        <p className="text-[0.875rem] text-stone-deep" aria-live="polite">
          Showing {items.length} of {total}
        </p>
        {nextHref && (
          <a href={nextHref} onClick={loadMore} aria-disabled={pending} className={`btn btn-ghost-dark ${pending ? "pointer-events-none opacity-60" : ""}`}>
            <span>{pending ? "Loading…" : "Show more"}</span>
          </a>
        )}
        {failed && (
          <p role="alert" className="text-[0.875rem] text-brick">
            Could not load more results. Please try again.
          </p>
        )}
      </div>
    </>
  );
}

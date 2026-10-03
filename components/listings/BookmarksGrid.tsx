"use client";

import Link from "next/link";
import { useState } from "react";
import { kindOf } from "@/lib/listings/describe";
import type { ListingSummary } from "@/lib/listings/queries";
import { ListingCard } from "./ListingCard";

/** Saved properties. Removing a bookmark takes the card off the page straight away. */
export function BookmarksGrid({ initialItems }: { initialItems: ListingSummary[] }) {
  const [items, setItems] = useState(initialItems);

  if (!items.length) {
    return (
      <div className="border border-dashed border-line-light px-6 py-14 text-center sm:px-12">
        <h2 className="text-[1.25rem] font-medium">No bookmarks yet</h2>
        <p className="mx-auto mt-3 max-w-[42ch] text-[0.9375rem] leading-relaxed text-graphite">
          Tap the bookmark on any property to keep it here, so you can compare your shortlist and come back to it any time.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/buy" className="btn btn-dark">
            <span>Browse homes for sale</span>
          </Link>
          <Link href="/rent" className="btn btn-ghost-dark">
            <span>Homes for rent</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="mb-6 text-[0.9375rem] text-stone-deep" aria-live="polite">
        {items.length} saved {items.length === 1 ? "property" : "properties"}
      </p>
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((listing) => (
          <li key={listing.propertyId}>
            <ListingCard
              listing={listing}
              kind={kindOf(listing)}
              saved
              isLoggedIn
              onBookmarkChange={(saved) => {
                if (!saved) setItems((current) => current.filter((i) => i.propertyId !== listing.propertyId));
              }}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

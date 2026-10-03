import Image from "next/image";
import Link from "next/link";
import type { ListingKind } from "@/lib/listings/filters";
import { keyFacts, priceParts, secondaryLine } from "@/lib/listings/describe";
import type { ListingSummary } from "@/lib/listings/queries";
import { BookmarkButton } from "./BookmarkButton";

type Props = {
  listing: ListingSummary;
  kind: ListingKind;
  saved: boolean;
  isLoggedIn: boolean;
  priority?: boolean;
  onBookmarkChange?: (saved: boolean) => void;
  /** Appended to the listing link, e.g. a stay's chosen dates. */
  detailQuery?: string;
};

export function ListingCard({ listing, kind, saved, isLoggedIn, priority = false, onBookmarkChange, detailQuery = "" }: Props) {
  const price = priceParts(listing);
  const facts = keyFacts(listing);
  const extra = secondaryLine(listing, kind);
  const inactive = listing.status !== "published";

  return (
    <article className={`group relative flex flex-col ${inactive ? "opacity-70" : ""}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        {listing.image ? (
          <Image
            src={listing.image}
            alt=""
            fill
            preload={priority}
            sizes="(min-width: 1536px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className="object-cover transition-transform duration-700 ease-(--ease-smooth) group-hover:scale-[1.03]"
          />
        ) : null}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5">
          {listing.isSample && <span className="eyebrow bg-contrast/85 px-2 py-1.5 text-on-contrast">Sample</span>}
          {inactive && <span className="eyebrow bg-paper px-2 py-1.5 text-ink">No longer listed</span>}
          {!inactive && listing.offer && <span className="eyebrow bg-brick px-2 py-1.5 text-on-contrast">Offer</span>}
        </div>
        {/* Above the card's stretched link, so it stays clickable. */}
        <div className="absolute top-3 right-3 z-10">
          <BookmarkButton propertyId={listing.propertyId} initialSaved={saved} isLoggedIn={isLoggedIn} onChange={onBookmarkChange} />
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          {price.prefix && <span className="text-[0.8125rem] text-stone-deep">{price.prefix}</span>}
          <span className="display text-[1.75rem] leading-none">{price.amount}</span>
          {price.suffix && <span className="text-[0.8125rem] text-stone-deep">{price.suffix}</span>}
          {listing.priceNegotiable && <span className="text-[0.75rem] text-stone-deep">· Negotiable</span>}
        </p>

        {!inactive && listing.offer && <p className="mt-2 text-[0.8125rem] font-medium text-brick">{listing.offer.title}</p>}

        <h3 className="mt-2.5 text-[0.9375rem] leading-snug font-medium">
          {/* One link per card, stretched over the whole card. */}
          <Link href={`/listings/${listing.referenceId}${detailQuery}`} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {listing.title}
          </Link>
        </h3>
        <p className="mt-1 text-[0.875rem] text-stone-deep">
          {listing.locality}
          {listing.city ? `, ${listing.city}` : ""}
        </p>

        {facts.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-2 border-t border-line-light pt-3 text-[0.8125rem] text-graphite">
            {facts.map((fact, i) => (
              <span key={fact} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="text-stone">
                    ·
                  </span>
                )}
                {fact}
              </span>
            ))}
          </p>
        )}
        {extra && <p className="mt-1.5 text-[0.8125rem] text-stone-deep">{extra}</p>}
      </div>
    </article>
  );
}

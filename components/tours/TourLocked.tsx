import Link from "next/link";
import { type TourSummary, describeTour } from "@/lib/tours/terms";

/**
 * What someone without Plus sees where the tour would be: what the tour has, and the way in.
 * Nothing from the tour itself (not even a thumbnail) is sent to them.
 */
export function TourLocked({
  tour,
  signedIn,
  returnTo,
  stay = false,
  compact = false,
}: {
  tour: TourSummary;
  signedIn: boolean;
  returnTo: string;
  stay?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[4px] bg-contrast text-on-contrast ${compact ? "p-6" : "px-6 py-14 sm:px-12 sm:py-20"}`}>
      <div aria-hidden className="pointer-events-none absolute -top-24 right-[-10%] size-80 rounded-full bg-brick/25 blur-3xl" />
      <div className="relative max-w-[46ch]">
        <p className="flex items-center gap-2 text-[0.75rem] tracking-wide text-on-contrast/70 uppercase">
          <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
            <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
          </svg>
          Trustbrick Plus
        </p>
        <p className={`mt-3 font-semibold ${compact ? "text-[1.125rem]" : "text-[clamp(1.5rem,3vw,2rem)] leading-tight"}`}>
          {stay ? "Look around this stay before you book." : "Walk through this home before you visit."}
        </p>
        <p className="mt-2 text-[0.9375rem] text-on-contrast/75">
          This {stay ? "stay" : "property"} has a {describeTour(tour)}. Virtual tours and 3D views are included with Plus, and Plus starts with a free trial.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {signedIn ? (
            <Link href="/account/subscription#plans" className="btn btn-light btn-compact">
              <span>Unlock with Plus</span>
            </Link>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="btn btn-light btn-compact">
                <span>Sign in to continue</span>
              </Link>
              <Link href="/plans?for=you" className="btn btn-ghost-light btn-compact">
                <span>See Plus</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

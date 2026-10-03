import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { formatDay, formatPrice } from "@/lib/format";
import { todayInIndia } from "@/lib/stays/booking-lifecycle";
import {
  activeFilterCount,
  BHK_OPTIONS,
  FOOD_OPTIONS,
  FURNISHING_OPTIONS,
  GENDER_OPTIONS,
  INVEST_CATEGORY_OPTIONS,
  KIND_META,
  type ListingFilters,
  type ListingKind,
  OCCUPANCY_OPTIONS,
  parseFilters,
  type RawSearchParams,
} from "@/lib/listings/filters";
import { type BrowseOptions, getBrowseOptions, savedPropertyIds, searchListings } from "@/lib/listings/queries";
import { shellFor } from "@/lib/listings/services";
import { BrowseTransition, PendingResults } from "./BrowseTransition";
import { FilterSidebar } from "./FilterSidebar";
import { ListingResults } from "./ListingResults";
import { SortSelect } from "./SortSelect";

type Chip = { label: string; href: string };

/** Links that each remove exactly one applied filter. */
function filterChips(kind: ListingKind, params: RawSearchParams, f: ListingFilters, options: BrowseOptions): Chip[] {
  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "cursor" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) base.append(key, v);
  }
  const without = (key: string, value?: string) => {
    const next = new URLSearchParams(base);
    if (value === undefined) next.delete(key);
    else next.delete(key, value);
    // Removing a city also removes its localities.
    if (key === "city") next.delete("locality");
    const qs = next.toString();
    return `${KIND_META[kind].path}${qs ? `?${qs}` : ""}`;
  };

  const label = (list: readonly { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;
  /** One chip for a min–max pair, removing both ends. */
  const range = (what: string, unit: string, minKey: string, maxKey: string, min?: number, max?: number) => {
    if (!min && !max) return;
    const next = new URLSearchParams(base);
    next.delete(minKey);
    next.delete(maxKey);
    const qs = next.toString();
    const n = (v: number) => v.toLocaleString("en-IN");
    const text = min && max ? `${n(min)}–${n(max)} ${unit}` : min ? `${n(min)}+ ${unit}` : `Up to ${n(max!)} ${unit}`;
    chips.push({ label: `${what} ${text}`, href: `${KIND_META[kind].path}${qs ? `?${qs}` : ""}` });
  };
  const chips: Chip[] = [];
  const city = options.cities.find((c) => c.slug === f.city);

  if (f.q) chips.push({ label: `“${f.q}”`, href: without("q") });
  if (city) chips.push({ label: city.name, href: without("city") });
  for (const l of f.localities) {
    const name = options.cities.flatMap((c) => c.localities).find((x) => x.slug === l)?.name ?? l;
    chips.push({ label: name, href: without("locality", l) });
  }
  if (f.gender) chips.push({ label: label(GENDER_OPTIONS, f.gender), href: without("gender") });
  if (f.minPrice) chips.push({ label: `From ${formatPrice(f.minPrice)}`, href: without("min") });
  if (f.maxPrice) chips.push({ label: `Up to ${formatPrice(f.maxPrice)}`, href: without("max") });
  for (const v of f.category) chips.push({ label: label(INVEST_CATEGORY_OPTIONS, v), href: without("category", v) });
  if (f.minYield) chips.push({ label: `Yield ${f.minYield}%+`, href: without("min_yield") });
  if (f.possessionBy) chips.push({ label: `Possession by ${f.possessionBy}`, href: without("possession_by") });
  for (const v of f.bhk) chips.push({ label: label(BHK_OPTIONS, v), href: without("bhk", v) });
  for (const v of f.types) chips.push({ label: options.types.find((t) => t.code === v)?.name ?? v, href: without("type", v) });
  range("Plot", "sq yd", "sqyd_min", "sqyd_max", f.sqydMin, f.sqydMax);
  range("Carpet", "sq ft", "sqft_min", "sqft_max", f.sqftMin, f.sqftMax);
  if (f.status) chips.push({ label: f.status === "ready" ? "Ready to move" : "Under construction", href: without("status") });
  for (const v of f.furnishing) chips.push({ label: label(FURNISHING_OPTIONS, v), href: without("furnishing", v) });
  if (f.availableNow) chips.push({ label: "Available now", href: without("available_now") });
  for (const v of f.occupancy) chips.push({ label: label(OCCUPANCY_OPTIONS, v), href: without("occupancy", v) });
  if (f.ac) chips.push({ label: "AC room", href: without("ac") });
  if (f.attachedBathroom) chips.push({ label: "Attached bathroom", href: without("attached") });
  if (f.mealsIncluded) chips.push({ label: "Meals included", href: without("meals") });
  if (f.food) chips.push({ label: label(FOOD_OPTIONS, f.food), href: without("food") });
  if (f.checkIn && f.checkOut) {
    const next = new URLSearchParams(base);
    next.delete("check_in");
    next.delete("check_out");
    const qs = next.toString();
    chips.push({ label: `${formatDay(f.checkIn)} – ${formatDay(f.checkOut)}`, href: `${KIND_META[kind].path}${qs ? `?${qs}` : ""}` });
  }
  if (f.guests) chips.push({ label: `${f.guests}+ guests`, href: without("guests") });
  if (f.spaceType) chips.push({ label: f.spaceType === "entire_home" ? "Entire home" : "Private room", href: without("space") });
  if (f.instantBook) chips.push({ label: "Instant book", href: without("instant") });
  if (f.petsAllowed) chips.push({ label: "Pets allowed", href: without("pets") });
  for (const v of f.amenities) chips.push({ label: options.amenities.find((a) => a.code === v)?.name ?? v, href: without("amenity", v) });
  return chips;
}

export async function BrowsePage({ kind, searchParams }: { kind: ListingKind; searchParams: Promise<RawSearchParams> }) {
  const meta = KIND_META[kind];
  const params = await searchParams;
  const filters = parseFilters(kind, params);

  const [options, result, session] = await Promise.all([getBrowseOptions(kind), searchListings(kind, filters), getSession()]);
  const saved = session ? await savedPropertyIds(session.user.id, result.items.map((i) => i.propertyId)) : new Set<string>();

  const activeCount = activeFilterCount(filters);
  const quickSearches = activeCount === 0 && !filters.cursor ? (shellFor(kind)?.quickSearches ?? []) : [];
  const chips = filterChips(kind, params, filters, options);
  const hasSamples = result.items.some((i) => i.isSample);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "cursor" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const queryString = query.toString();

  return (
    <BrowseTransition>
      <div className="shell pt-8 pb-20 sm:pt-12 lg:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-line-light pb-8">
          <div>
            <p className="eyebrow flex items-center gap-3 text-brick">
              <span aria-hidden className="h-px w-8 bg-current" />
              {meta.eyebrow}
            </p>
            <h1 className="display mt-4 text-[clamp(2.25rem,5vw,3.75rem)] leading-[0.95]">{meta.title}</h1>
            <p className="mt-3 text-[0.9375rem] text-stone-deep">
              {meta.intro}{" "}
              <span className="text-ink">
                {result.total} {kind === "stay" ? (result.total === 1 ? "home stay" : "home stays") : result.total === 1 ? "property" : "properties"}
                {kind === "stay" && filters.checkIn && filters.checkOut ? " free for your dates" : ""}
              </span>
            </p>
          </div>
          <SortSelect value={filters.sort} />
        </div>

        {quickSearches.length > 0 && (
          <nav aria-label="Popular searches" className="mt-6">
            <p className="eyebrow mb-3 text-stone-deep">Popular searches</p>
            <ul className="flex flex-wrap gap-2">
              {quickSearches.map((q) => (
                <li key={q.key}>
                  <Link
                    href={q.href}
                    className="inline-flex h-9 items-center rounded-full border border-line-light bg-paper px-4 text-[0.875rem] text-graphite transition-colors hover:border-ink hover:text-ink"
                  >
                    {q.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {hasSamples && (
          <p className="mt-6 flex items-start gap-3 border-l-2 border-brick/50 bg-brick/[0.05] px-4 py-3 text-[0.875rem] leading-relaxed text-graphite">
            <span className="eyebrow mt-0.5 shrink-0 text-brick">Sample data</span>
            These are sample listings for development. They are not real properties, and the prices, organizations and
            RERA numbers are illustrative.
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
          <aside aria-label="Filters" className="lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)] lg:max-h-[calc(100svh-var(--sticky-top,var(--header-h))-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2 lg:[scrollbar-width:thin]">
            <FilterSidebar kind={kind} options={options} filters={filters} activeCount={activeCount} total={result.total} today={todayInIndia()} />
          </aside>

          <section aria-label="Results" className="min-w-0">
            {chips.length > 0 && (
              <div className="mb-8 flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <Link
                    key={`${chip.label}-${chip.href}`}
                    href={chip.href}
                    scroll={false}
                    aria-label={`Remove filter: ${chip.label}`}
                    className="group flex items-center gap-2 rounded-full border border-line-light bg-paper py-1.5 pr-2.5 pl-3.5 text-[0.8125rem] transition-colors hover:border-ink"
                  >
                    {chip.label}
                    <svg viewBox="0 0 12 12" aria-hidden className="size-2.5 text-stone-deep group-hover:text-ink">
                      <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </Link>
                ))}
                <Link href={meta.path} scroll={false} className="link-rule ml-1 text-[0.8125rem] text-stone-deep hover:text-ink">
                  Clear all
                </Link>
              </div>
            )}

            <PendingResults>
              {result.total === 0 ? (
                <div className="border border-dashed border-line-light px-6 py-16 text-center">
                  <h2 className="text-[1.25rem] font-medium">{activeCount ? "No properties match these filters" : "No properties listed yet"}</h2>
                  <p className="mx-auto mt-3 max-w-[40ch] text-[0.9375rem] text-graphite">
                    {activeCount
                      ? "Try removing a filter or widening your budget."
                      : "Listings will appear here as soon as they are published."}
                  </p>
                  {activeCount > 0 && (
                    <Link href={meta.path} className="btn btn-dark mt-6">
                      <span>Clear all filters</span>
                    </Link>
                  )}
                </div>
              ) : (
                <ListingResults
                  key={queryString}
                  kind={kind}
                  query={queryString}
                  initialItems={result.items}
                  initialCursor={result.nextCursor}
                  initialSavedIds={[...saved]}
                  isLoggedIn={Boolean(session)}
                  total={result.total}
                />
              )}
            </PendingResults>
          </section>
        </div>
      </div>
    </BrowseTransition>
  );
}

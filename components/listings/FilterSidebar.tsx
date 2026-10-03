"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  BHK_OPTIONS,
  FOOD_OPTIONS,
  FURNISHING_OPTIONS,
  GENDER_OPTIONS,
  INVEST_CATEGORY_OPTIONS,
  KIND_META,
  type ListingFilters,
  type ListingKind,
  OCCUPANCY_OPTIONS,
  SPACE_OPTIONS,
  SQFT_STEPS,
  SQYD_STEPS,
  isPlotType,
  sizeRangesFor,
} from "@/lib/listings/filters";
import type { BrowseOptions } from "@/lib/listings/queries";
import { useBrowse } from "./BrowseTransition";

type Props = {
  kind: ListingKind;
  options: BrowseOptions;
  filters: ListingFilters;
  activeCount: number;
  total: number;
  /** Today in India, for date pickers (computed on the server). */
  today?: string;
};

const DESKTOP = "(min-width: 1024px)";

/**
 * One form, rendered once: a sticky sidebar on desktop that applies as you change
 * it, and a full-screen drawer on smaller screens that applies on "Show results".
 * It is a plain GET form, so it also works before JavaScript loads.
 */
export function FilterSidebar({
  kind,
  options,
  filters,
  activeCount,
  total,
  today,
}: Props) {
  const meta = KIND_META[kind];
  const { navigate, pending } = useBrowse();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState(filters.city ?? "");
  const [query, setQuery] = useState(filters.q ?? "");
  // The ticked property types, live: a size range opens as soon as its type is chosen,
  // even in the phone drawer, where nothing applies until "Show results".
  const [types, setTypes] = useState<string[]>(filters.types);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);

  // Keep local state in step when the URL changes (a chip removed, the back button),
  // adjusting during render rather than in an effect to avoid an extra render pass.
  const typesKey = filters.types.join(",");
  const [synced, setSynced] = useState({ city: filters.city, q: filters.q, types: typesKey });
  if (synced.city !== filters.city || synced.q !== filters.q || synced.types !== typesKey) {
    setSynced({ city: filters.city, q: filters.q, types: typesKey });
    setCity(filters.city ?? "");
    setQuery(filters.q ?? "");
    setTypes(filters.types);
  }

  const apply = () => {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value !== "") params.append(key, value);
    }
    navigate(params);
  };

  const isDesktop = () =>
    typeof window !== "undefined" && window.matchMedia(DESKTOP).matches;
  const onChange = (event: React.FormEvent<HTMLFormElement>) => {
    // Free text is debounced separately; every other control applies immediately.
    const target = event.target as HTMLInputElement;
    if (target.name === "q") return;
    if (target.name === "type") {
      setTypes([...(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="type"]:checked') ?? [])].map((i) => i.value));
    }
    // Dates apply as a pair: wait until both are chosen.
    if (target.name === "check_in" || target.name === "check_out") {
      const form = formRef.current;
      const other = form?.querySelector<HTMLInputElement>(`input[name="${target.name === "check_in" ? "check_out" : "check_in"}"]`);
      if (!target.value || !other?.value) return;
    }
    if (isDesktop()) apply();
  };

  // Debounce free-text search on desktop.
  useEffect(() => {
    if (!isDesktop() || query === (filters.q ?? "")) return;
    const t = setTimeout(apply, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the live form
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const media = window.matchMedia(DESKTOP);
    const onMedia = () => media.matches && setOpen(false);
    media.addEventListener("change", onMedia);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onMedia);
      opener?.focus();
    };
  }, [open]);

  const localities =
    options.cities.find((c) => c.slug === city)?.localities ?? [];
  const sizes = kind === "buy" ? sizeRangesFor(types) : { sqft: false, sqyd: false };
  // Bedrooms and furnishing describe homes; they step aside when only plots are chosen.
  const onlyPlots = kind === "buy" && types.length > 0 && types.every(isPlotType);

  return (
    <>
      {/* .btn is unlayered, so visibility lives on a wrapper rather than on the button. */}
      <div className="lg:hidden">
        <button
          ref={openerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="btn btn-ghost-dark min-h-11 w-full justify-between px-4"
        >
          <span className="flex items-center gap-2.5">
            <svg viewBox="0 0 20 20" aria-hidden className="size-4">
              <path
                d="M3 5h14M6 10h8M8.5 15h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Filters
          </span>
          {activeCount > 0 && (
            <span className="grid size-6 place-items-center rounded-full bg-ink text-[0.75rem] text-paper">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <div
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={titleId}
        className={`${open ? "fixed inset-0 z-50 flex flex-col bg-ivory" : "hidden"} lg:static lg:z-auto lg:flex lg:flex-col lg:bg-transparent`}
      >
        <div className="flex items-center justify-between border-b border-line-light px-(--gutter) py-4 lg:hidden">
          <h2 id={titleId} className="text-[1.0625rem] font-medium">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="grid size-10 place-items-center"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="size-5">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>

        <form
          ref={formRef}
          method="get"
          action={meta.path}
          onChange={onChange}
          onSubmit={(e) => {
            e.preventDefault();
            apply();
            setOpen(false);
          }}
          className="flex-1 overflow-y-auto px-(--gutter) pb-28 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          <h2 className="sr-only lg:not-sr-only lg:eyebrow lg:mb-2 lg:block lg:text-stone-deep">
            Filters
          </h2>
          <input
            type="hidden"
            name="sort"
            value={filters.sort === "newest" ? "" : filters.sort}
          />

          {kind === "stay" && (
            <Section title="When and who">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-[0.8125rem] text-stone-deep">Check-in</span>
                  <input
                    type="date"
                    name="check_in"
                    min={today}
                    defaultValue={filters.checkIn ?? ""}
                    key={`in-${filters.checkIn ?? ""}`}
                    className="h-11 w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-2 text-[0.875rem] focus:border-ink focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[0.8125rem] text-stone-deep">Check-out</span>
                  <input
                    type="date"
                    name="check_out"
                    min={filters.checkIn ?? today}
                    defaultValue={filters.checkOut ?? ""}
                    key={`out-${filters.checkOut ?? ""}`}
                    className="h-11 w-full min-w-0 rounded-[2px] border border-line-light bg-paper px-2 text-[0.875rem] focus:border-ink focus:outline-none"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[0.8125rem] text-stone-deep">Guests</span>
                <select
                  name="guests"
                  defaultValue={filters.guests ? String(filters.guests) : ""}
                  key={`g-${filters.guests ?? ""}`}
                  className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
                >
                  <option value="">Any number</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                      {n === 12 ? " or more" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-[0.75rem] text-stone-deep">Choose both dates to see only home stays that are free.</p>
            </Section>
          )}

          <Section title="Search">
            <label className="sr-only" htmlFor={`${titleId}-q`}>
              Search by keyword or locality
            </label>
            <input
              id={`${titleId}-q`}
              name="q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Locality or keyword"
              maxLength={80}
              className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
            />
          </Section>

          <Section title="Location">
            <label
              className="mb-1.5 block text-[0.8125rem] text-stone-deep"
              htmlFor={`${titleId}-city`}
            >
              City
            </label>
            <select
              id={`${titleId}-city`}
              name="city"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                // Localities belong to a city; clear them when the city changes.
                formRef.current
                  ?.querySelectorAll<HTMLInputElement>('input[name="locality"]')
                  .forEach((i) => (i.checked = false));
              }}
              className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
            >
              <option value="">All cities</option>
              {options.cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {city ? (
              <fieldset className="mt-4">
                <legend className="mb-2 text-[0.8125rem] text-stone-deep">
                  Localities
                </legend>
                <div className="space-y-1.5">
                  {localities.map((l) => (
                    <Check
                      key={l.slug}
                      name="locality"
                      value={l.slug}
                      label={l.name}
                      checked={filters.localities.includes(l.slug)}
                    />
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="mt-2 text-[0.8125rem] text-stone-deep">
                Choose a city to pick localities.
              </p>
            )}
          </Section>

          {kind === "pg" && (
            <Section title="Who it's for">
              <div className="space-y-1.5">
                <Radio
                  name="gender"
                  value=""
                  label="All PGs"
                  checked={!filters.gender}
                />
                {GENDER_OPTIONS.map((o) => (
                  <Radio
                    key={o.value}
                    name="gender"
                    value={o.value}
                    label={o.label}
                    checked={filters.gender === o.value}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title={meta.priceLabel}>
            <div className="grid grid-cols-2 gap-2">
              <BudgetSelect
                name="min"
                label="Min"
                budgets={meta.budgets}
                value={filters.minPrice}
              />
              <BudgetSelect
                name="max"
                label="Max"
                budgets={meta.budgets}
                value={filters.maxPrice}
              />
            </div>
          </Section>

          {kind === "invest" && (
            <>
              <Section title="Investment type">
                <div className="space-y-1.5">
                  {INVEST_CATEGORY_OPTIONS.map((o) => (
                    <Check
                      key={o.value}
                      name="category"
                      value={o.value}
                      label={o.label}
                      checked={filters.category.includes(o.value)}
                    />
                  ))}
                </div>
              </Section>
              <Section title="Returns and timing">
                <label
                  className="mb-1.5 block text-[0.8125rem] text-stone-deep"
                  htmlFor={`${titleId}-yield`}
                >
                  Minimum declared rent yield
                </label>
                <select
                  id={`${titleId}-yield`}
                  name="min_yield"
                  defaultValue={filters.minYield ?? ""}
                  key={`min_yield-${filters.minYield ?? ""}`}
                  className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
                >
                  <option value="">Any</option>
                  {[3, 4, 5, 6, 7].map((y) => (
                    <option key={y} value={y}>
                      {y}% or more
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[0.75rem] leading-snug text-stone-deep">
                  Based on the rent the seller declares. Not a Trustbrick
                  estimate.
                </p>
                <label
                  className="mt-4 mb-1.5 block text-[0.8125rem] text-stone-deep"
                  htmlFor={`${titleId}-possession`}
                >
                  Possession by
                </label>
                <select
                  id={`${titleId}-possession`}
                  name="possession_by"
                  defaultValue={filters.possessionBy ?? ""}
                  key={`possession_by-${filters.possessionBy ?? ""}`}
                  className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-3 text-[0.9375rem] focus:border-ink focus:outline-none"
                >
                  <option value="">Any time</option>
                  {[2026, 2027, 2028, 2029, 2030].map((y) => (
                    <option key={y} value={y}>
                      End of {y}
                    </option>
                  ))}
                </select>
              </Section>
            </>
          )}

          {(kind === "buy" || kind === "rent") && !onlyPlots && (
            <Section title="Bedrooms">
              <div className="flex flex-wrap gap-2">
                {BHK_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    name="bhk"
                    value={o.value}
                    label={o.label}
                    checked={filters.bhk.includes(o.value)}
                  />
                ))}
              </div>
            </Section>
          )}

          {options.types.length > 0 && (
            <Section title="Property type">
              <div className="space-y-1.5">
                {options.types.map((t) => (
                  <Check
                    key={t.code}
                    name="type"
                    value={t.code}
                    label={t.name}
                    checked={filters.types.includes(t.code)}
                  />
                ))}
              </div>
            </Section>
          )}

          {sizes.sqyd && (
            <Section title="Plot size (sq yd)">
              <div className="grid grid-cols-2 gap-2">
                <SizeSelect name="sqyd_min" label="Min" steps={SQYD_STEPS} unit="sq yd" value={filters.sqydMin} />
                <SizeSelect name="sqyd_max" label="Max" steps={SQYD_STEPS} unit="sq yd" value={filters.sqydMax} />
              </div>
              <p className="mt-1.5 text-[0.75rem] text-stone-deep">Plot area as the seller lists it. 1 sq yd = 9 sq ft.</p>
            </Section>
          )}

          {sizes.sqft && (
            <Section title="Carpet area (sq ft)">
              <div className="grid grid-cols-2 gap-2">
                <SizeSelect name="sqft_min" label="Min" steps={SQFT_STEPS} unit="sq ft" value={filters.sqftMin} />
                <SizeSelect name="sqft_max" label="Max" steps={SQFT_STEPS} unit="sq ft" value={filters.sqftMax} />
              </div>
            </Section>
          )}

          {kind === "buy" && !onlyPlots && (
            <Section title="Construction status">
              <div className="space-y-1.5">
                <Radio
                  name="status"
                  value=""
                  label="Any"
                  checked={!filters.status}
                />
                <Radio
                  name="status"
                  value="ready"
                  label="Ready to move"
                  checked={filters.status === "ready"}
                />
                <Radio
                  name="status"
                  value="under_construction"
                  label="Under construction"
                  checked={filters.status === "under_construction"}
                />
              </div>
            </Section>
          )}

          {(kind === "buy" || kind === "rent") && !onlyPlots && (
            <Section title="Furnishing">
              <div className="space-y-1.5">
                {FURNISHING_OPTIONS.map((o) => (
                  <Check
                    key={o.value}
                    name="furnishing"
                    value={o.value}
                    label={o.label}
                    checked={filters.furnishing.includes(o.value)}
                  />
                ))}
              </div>
            </Section>
          )}

          {kind === "stay" && (
            <>
              <Section title="Type of place">
                <div className="space-y-1.5">
                  <Radio name="space" value="" label="Any type" checked={!filters.spaceType} />
                  {SPACE_OPTIONS.map((o) => (
                    <Radio key={o.value} name="space" value={o.value} label={o.label} checked={filters.spaceType === o.value} />
                  ))}
                </div>
              </Section>
              <Section title="Booking">
                <div className="space-y-1.5">
                  <Check name="instant" value="1" label="Instant book" checked={Boolean(filters.instantBook)} />
                  <Check name="pets" value="1" label="Pets allowed" checked={Boolean(filters.petsAllowed)} />
                </div>
              </Section>
            </>
          )}

          {kind === "rent" && (
            <Section title="Availability">
              <Check
                name="available_now"
                value="1"
                label="Available now"
                checked={Boolean(filters.availableNow)}
              />
            </Section>
          )}

          {kind === "pg" && (
            <>
              <Section title="Room type">
                <div className="space-y-1.5">
                  {OCCUPANCY_OPTIONS.map((o) => (
                    <Check
                      key={o.value}
                      name="occupancy"
                      value={o.value}
                      label={o.label}
                      checked={filters.occupancy.includes(o.value)}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 border-t border-line-light pt-3">
                  <Check
                    name="ac"
                    value="1"
                    label="AC room"
                    checked={Boolean(filters.ac)}
                  />
                  <Check
                    name="attached"
                    value="1"
                    label="Attached bathroom"
                    checked={Boolean(filters.attachedBathroom)}
                  />
                </div>
              </Section>
              <Section title="Food">
                <div className="space-y-1.5">
                  <Check
                    name="meals"
                    value="1"
                    label="Meals included"
                    checked={Boolean(filters.mealsIncluded)}
                  />
                </div>
                <div className="mt-3 space-y-1.5 border-t border-line-light pt-3">
                  <Radio
                    name="food"
                    value=""
                    label="Any food"
                    checked={!filters.food}
                  />
                  {FOOD_OPTIONS.map((o) => (
                    <Radio
                      key={o.value}
                      name="food"
                      value={o.value}
                      label={o.label}
                      checked={filters.food === o.value}
                    />
                  ))}
                </div>
              </Section>
            </>
          )}

          {options.amenities.length > 0 && (
            <Section title="Amenities">
              <div className="space-y-1.5">
                {options.amenities.map((a) => (
                  <Check
                    key={a.code}
                    name="amenity"
                    value={a.code}
                    label={a.name}
                    checked={filters.amenities.includes(a.code)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Desktop applies on change; this button is for no-JS and mirrors the drawer action. */}
          <noscript>
            <button type="submit" className="btn btn-dark mt-6 w-full">
              Apply filters
            </button>
          </noscript>
        </form>

        <div className="fixed inset-x-0 bottom-0 grid grid-cols-2 gap-3 border-t border-line-light bg-ivory px-(--gutter) py-4 lg:hidden">
          <a href={meta.path} className="btn btn-ghost-dark">
            Clear all
          </a>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="btn btn-dark"
            disabled={pending}
          >
            Show results
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {pending ? "Updating results" : `${total} results`}
        </p>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line-light py-5 last:border-b-0">
      <h3 className="mb-3 text-[0.875rem] font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Check({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-0.5 text-[0.9375rem] text-graphite hover:text-ink">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        key={`${name}-${value}-${checked}`}
        className="size-4 accent-ink"
      />
      {label}
    </label>
  );
}

function Radio({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-0.5 text-[0.9375rem] text-graphite hover:text-ink">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        key={`${name}-${value}-${checked}`}
        className="size-4 accent-ink"
      />
      {label}
    </label>
  );
}

function Chip({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="cursor-pointer rounded-[2px] border border-line-light bg-paper px-3 py-1.5 text-[0.875rem] text-graphite transition-colors has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_35%,transparent)]">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        key={`${name}-${value}-${checked}`}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function SizeSelect({ name, label, steps, unit, value }: { name: string; label: string; steps: number[]; unit: string; value?: number }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] text-stone-deep">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        key={`${name}-${value ?? ""}`}
        className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-2 text-[0.9375rem] focus:border-ink focus:outline-none"
      >
        <option value="">{label === "Min" ? "No min" : "No max"}</option>
        {steps.map((s) => (
          <option key={s} value={s}>
            {s.toLocaleString("en-IN")} {unit}
          </option>
        ))}
      </select>
    </div>
  );
}

function BudgetSelect({
  name,
  label,
  budgets,
  value,
}: {
  name: string;
  label: string;
  budgets: number[];
  value?: number;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[0.8125rem] text-stone-deep"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        key={`${name}-${value ?? ""}`}
        className="h-11 w-full rounded-[2px] border border-line-light bg-paper px-2 text-[0.9375rem] focus:border-ink focus:outline-none"
      >
        <option value="">{label === "Min" ? "No min" : "No max"}</option>
        {budgets.map((b) => (
          <option key={b} value={b}>
            {formatPrice(b)}
          </option>
        ))}
      </select>
    </div>
  );
}

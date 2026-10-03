/**
 * Browse page configuration and filter parsing. Shared by the server (queries)
 * and the client (sidebar), so it has no server-only imports.
 *
 * Filters live entirely in the URL: every result set is shareable, bookmarkable
 * and works without JavaScript.
 */

export const LISTING_KINDS = ["buy", "rent", "pg", "stay", "invest"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

export const SORTS = ["newest", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

type KindMeta = {
  path: string;
  navLabel: string;
  eyebrow: string;
  title: string;
  intro: string;
  /** Unit shown after a price on cards. */
  priceSuffix?: string;
  priceLabel: string;
  budgets: number[];
};

export const KIND_META: Record<ListingKind, KindMeta> = {
  buy: {
    path: "/buy",
    navLabel: "Buy",
    eyebrow: "Buy",
    title: "Homes and plots for sale",
    intro: "Apartments, villas, houses and plots, including new launches.",
    priceLabel: "Budget",
    budgets: [2500000, 5000000, 7500000, 10000000, 15000000, 20000000, 30000000, 50000000, 100000000],
  },
  rent: {
    path: "/rent",
    navLabel: "Rent",
    eyebrow: "Rent",
    title: "Homes for rent",
    intro: "Apartments, studios and houses to rent.",
    priceSuffix: "/month",
    priceLabel: "Monthly rent",
    budgets: [5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000],
  },
  pg: {
    path: "/pg",
    navLabel: "PGs",
    eyebrow: "PGs",
    title: "PGs and co-living",
    intro: "Paying-guest rooms, priced per bed.",
    priceSuffix: "/bed per month",
    priceLabel: "Rent per bed",
    budgets: [5000, 7500, 10000, 12500, 15000, 20000],
  },
  stay: {
    path: "/stays",
    navLabel: "Home Stay",
    eyebrow: "Home Stay",
    title: "Home Stay",
    intro: "Whole homes and private rooms by the night, from hosts Trustbrick has checked.",
    priceSuffix: "/night",
    priceLabel: "Price per night",
    budgets: [1500, 2500, 4000, 6000, 8000, 12000, 20000],
  },
  invest: {
    path: "/invest",
    navLabel: "Invest",
    eyebrow: "Invest",
    title: "Properties to invest in",
    intro: "New launches, commercial spaces and plots.",
    priceLabel: "Budget",
    budgets: [2500000, 5000000, 10000000, 20000000, 50000000, 100000000, 200000000],
  },
};

export const BHK_OPTIONS = [
  { value: "1", label: "1 BHK" },
  { value: "2", label: "2 BHK" },
  { value: "3", label: "3 BHK" },
  { value: "4", label: "4+ BHK" },
] as const;

export const FURNISHING_OPTIONS = [
  { value: "furnished", label: "Furnished" },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "unfurnished", label: "Unfurnished" },
] as const;

export const GENDER_OPTIONS = [
  { value: "men", label: "For men" },
  { value: "women", label: "For women" },
  { value: "any", label: "Co-living (any gender)" },
] as const;

export const OCCUPANCY_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "double", label: "Double sharing" },
  { value: "triple", label: "Triple sharing" },
  { value: "quad", label: "Four sharing" },
] as const;

export const FOOD_OPTIONS = [
  { value: "veg", label: "Vegetarian" },
  { value: "non_veg", label: "Non-vegetarian" },
] as const;

/**
 * Plots sold under Buy. Plots are measured the way they're sold in India, in square yards
 * (what agents enter as plot area); homes by carpet area in square feet.
 */
export const PLOT_TYPE_CODES = ["residential_plot", "open_plot"] as const;
export const isPlotType = (code: string) => (PLOT_TYPE_CODES as readonly string[]).includes(code);

/** Steps for the size ranges that open when a plot or a home type is chosen. */
export const SQYD_STEPS = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 5000];
export const SQFT_STEPS = [300, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000];

/** Which size range(s) the chosen property types call for. */
export function sizeRangesFor(types: readonly string[]): { sqft: boolean; sqyd: boolean } {
  return { sqyd: types.some(isPlotType), sqft: types.some((t) => !isPlotType(t)) };
}

export const INVEST_CATEGORY_OPTIONS = [
  { value: "new_launch", label: "New launches" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Plots and land" },
] as const;

export const SPACE_OPTIONS = [
  { value: "entire_home", label: "Entire home" },
  { value: "private_room", label: "Private room" },
] as const;

export type ListingFilters = {
  city?: string;
  localities: string[];
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  types: string[];
  amenities: string[];
  sort: Sort;
  // Buy / rent
  bhk: string[];
  furnishing: string[];
  status?: "ready" | "under_construction";
  availableNow?: boolean;
  /** Carpet area, for homes. Only applies while a home type is chosen. */
  sqftMin?: number;
  sqftMax?: number;
  /** Plot area, for plots. Only applies while a plot type is chosen. */
  sqydMin?: number;
  sqydMax?: number;
  // PG
  gender?: "men" | "women" | "any";
  occupancy: string[];
  mealsIncluded?: boolean;
  food?: "veg" | "non_veg";
  ac?: boolean;
  attachedBathroom?: boolean;
  // Stays
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  spaceType?: "entire_home" | "private_room";
  instantBook?: boolean;
  petsAllowed?: boolean;
  // Invest
  category: string[];
  possessionBy?: number;
  minYield?: number;
  // Paging
  cursor?: string;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9_]{1,60}$/;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const all = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function manyOf(values: string[], allowed: readonly string[]): string[] {
  return [...new Set(values.filter((v) => allowed.includes(v)))];
}

function positiveNumber(value: string | undefined, max: number): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}

function ordered(min: number | undefined, max: number | undefined): [number | undefined, number | undefined] {
  return min && max && min > max ? [max, min] : [min, max];
}

/**
 * Lenient by design: anything malformed or unknown is dropped rather than
 * turned into an error page, because these values come straight from a URL.
 */
export function parseFilters(kind: ListingKind, params: RawSearchParams): ListingFilters {
  const q = first(params.q)?.trim().slice(0, 80);
  const city = first(params.city);
  const flag = (key: string) => first(params[key]) === "1" || undefined;

  const filters: ListingFilters = {
    city: city && SLUG.test(city) ? city : undefined,
    localities: all(params.locality).filter((l) => SLUG.test(l)),
    q: q || undefined,
    minPrice: positiveNumber(first(params.min), 1e11),
    maxPrice: positiveNumber(first(params.max), 1e11),
    types: all(params.type).filter((t) => SLUG.test(t)),
    amenities: all(params.amenity).filter((a) => SLUG.test(a)),
    sort: oneOf(first(params.sort), SORTS) ?? "newest",
    bhk: [],
    furnishing: [],
    occupancy: [],
    category: [],
    cursor: first(params.cursor),
  };

  if (kind === "buy" || kind === "rent") {
    filters.bhk = manyOf(all(params.bhk), BHK_OPTIONS.map((o) => o.value));
    filters.furnishing = manyOf(all(params.furnishing), FURNISHING_OPTIONS.map((o) => o.value));
  }
  if (kind === "buy") {
    filters.status = oneOf(first(params.status), ["ready", "under_construction"] as const);
    // A size range exists only while its kind of property is chosen, so a range left in the
    // URL after its type was unticked never quietly narrows the results.
    const ranges = sizeRangesFor(filters.types);
    if (ranges.sqft) {
      [filters.sqftMin, filters.sqftMax] = ordered(positiveNumber(first(params.sqft_min), 1e6), positiveNumber(first(params.sqft_max), 1e6));
    }
    if (ranges.sqyd) {
      [filters.sqydMin, filters.sqydMax] = ordered(positiveNumber(first(params.sqyd_min), 1e7), positiveNumber(first(params.sqyd_max), 1e7));
    }
  }
  if (kind === "rent") filters.availableNow = flag("available_now");
  if (kind === "pg") {
    filters.gender = oneOf(first(params.gender), ["men", "women", "any"] as const);
    filters.occupancy = manyOf(all(params.occupancy), OCCUPANCY_OPTIONS.map((o) => o.value));
    filters.mealsIncluded = flag("meals");
    filters.food = oneOf(first(params.food), ["veg", "non_veg"] as const);
    filters.ac = flag("ac");
    filters.attachedBathroom = flag("attached");
  }
  if (kind === "stay") {
    const checkIn = first(params.check_in);
    const checkOut = first(params.check_out);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    // Dates come as a pair, in order, and at most 90 nights apart; anything else is ignored.
    if (checkIn && checkOut && iso.test(checkIn) && iso.test(checkOut) && checkOut > checkIn && !Number.isNaN(Date.parse(checkIn)) && !Number.isNaN(Date.parse(checkOut))) {
      if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000 <= 90) {
        filters.checkIn = checkIn;
        filters.checkOut = checkOut;
      }
    }
    const guests = positiveNumber(first(params.guests), 30);
    filters.guests = guests ? Math.floor(guests) : undefined;
    filters.spaceType = oneOf(first(params.space), ["entire_home", "private_room"] as const);
    filters.instantBook = flag("instant");
    filters.petsAllowed = flag("pets");
  }
  if (kind === "invest") {
    filters.category = manyOf(all(params.category), INVEST_CATEGORY_OPTIONS.map((o) => o.value));
    const year = positiveNumber(first(params.possession_by), 2100);
    filters.possessionBy = year && year >= 2025 ? Math.floor(year) : undefined;
    filters.minYield = positiveNumber(first(params.min_yield), 30);
  }
  if (filters.minPrice && filters.maxPrice && filters.minPrice > filters.maxPrice) {
    [filters.minPrice, filters.maxPrice] = [filters.maxPrice, filters.minPrice];
  }
  return filters;
}

/** How many filters the visitor has set, for the mobile "Filters (3)" button. */
export function activeFilterCount(filters: ListingFilters): number {
  return (
    Number(Boolean(filters.city)) +
    filters.localities.length +
    Number(Boolean(filters.q)) +
    Number(Boolean(filters.minPrice || filters.maxPrice)) +
    filters.types.length +
    filters.amenities.length +
    filters.bhk.length +
    filters.furnishing.length +
    Number(Boolean(filters.status)) +
    Number(Boolean(filters.availableNow)) +
    Number(Boolean(filters.sqftMin || filters.sqftMax)) +
    Number(Boolean(filters.sqydMin || filters.sqydMax)) +
    Number(Boolean(filters.gender)) +
    filters.occupancy.length +
    Number(Boolean(filters.mealsIncluded)) +
    Number(Boolean(filters.food)) +
    Number(Boolean(filters.ac)) +
    Number(Boolean(filters.attachedBathroom)) +
    filters.category.length +
    Number(Boolean(filters.possessionBy)) +
    Number(Boolean(filters.minYield)) +
    Number(Boolean(filters.checkIn)) +
    Number(Boolean(filters.guests)) +
    Number(Boolean(filters.spaceType)) +
    Number(Boolean(filters.instantBook)) +
    Number(Boolean(filters.petsAllowed))
  );
}

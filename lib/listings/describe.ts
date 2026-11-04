import { formatArea, formatDate, formatPrice } from "@/lib/format";
import { type ListingKind, isPlotType } from "./filters";
import type { ListingSummary } from "./types";

/** Plain presentation helpers for listings; no server imports, safe in client components. */

export const FURNISHING_LABEL: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

export const GENDER_LABEL: Record<string, string> = {
  men: "For men",
  women: "For women",
  any: "Co-living",
};

export const OCCUPANCY_LABEL: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  quad: "Four sharing",
};

export const MEALS_LABEL: Record<string, string> = {
  none: "No meals",
  breakfast: "Breakfast included",
  two: "2 meals a day",
  three: "3 meals a day",
};

export const FOOD_LABEL: Record<string, string> = {
  veg: "Vegetarian food",
  non_veg: "Non-vegetarian food",
  both: "Veg and non-veg food",
};

/** Which browse page a listing belongs to, e.g. for breadcrumbs. */
export function kindOf(l: Pick<ListingSummary, "transactionType" | "category" | "projectStatus" | "typeCode">): ListingKind {
  if (l.transactionType === "pg") return "pg";
  if (l.transactionType === "stay") return "stay";
  if (l.transactionType === "rent" || l.transactionType === "lease") return "rent";
  // Plots to build a home on belong to Buy; other land and commercial space to Invest.
  if (l.category === "land" && isPlotType(l.typeCode)) return "buy";
  if (l.category === "commercial" || l.category === "land") return "invest";
  return "buy";
}

export function priceParts(l: ListingSummary): { amount: string; suffix: string | null; prefix: string | null } {
  if (l.transactionType === "pg") return { prefix: "From", amount: formatPrice(l.price, { compact: false }), suffix: "/bed per month" };
  if (l.transactionType === "stay") return { prefix: null, amount: formatPrice(l.price, { compact: false }), suffix: "/night" };
  if (l.transactionType === "rent" || l.transactionType === "lease") return { prefix: null, amount: formatPrice(l.price, { compact: false }), suffix: "/month" };
  return { prefix: null, amount: formatPrice(l.price), suffix: null };
}

/** The short facts row under a card title. */
export function keyFacts(l: ListingSummary): string[] {
  if (l.transactionType === "stay" && l.stay) {
    return [
      l.stay.spaceType === "entire_home" ? "Entire home" : "Private room",
      `${l.stay.maxGuests} guests`,
      l.bedrooms ? `${l.bedrooms} bedroom${l.bedrooms === 1 ? "" : "s"}` : null,
      `${l.stay.beds} bed${l.stay.beds === 1 ? "" : "s"}`,
    ].filter(Boolean) as string[];
  }
  if (l.transactionType === "pg") {
    const facts = [GENDER_LABEL[l.genderPolicy ?? ""] ?? "PG"];
    if (l.occupancies.length) {
      const order = ["single", "double", "triple", "quad"];
      facts.push([...l.occupancies].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((o) => OCCUPANCY_LABEL[o]).join(", "));
    }
    if (l.meals) facts.push(MEALS_LABEL[l.meals]);
    return facts;
  }
  if (l.category === "land") {
    return [l.typeName, l.plotAreaSqyd ? `${Math.round(l.plotAreaSqyd).toLocaleString("en-IN")} sq yd` : null].filter(Boolean) as string[];
  }
  if (l.category === "commercial") {
    return [l.typeName, l.carpetAreaSqft ? formatArea(l.carpetAreaSqft) : null].filter(Boolean) as string[];
  }
  const facts: string[] = [];
  if (l.bedrooms !== null) facts.push(l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BHK`);
  if (l.carpetAreaSqft) facts.push(formatArea(l.carpetAreaSqft));
  if (l.furnishing) facts.push(FURNISHING_LABEL[l.furnishing]);
  return facts;
}

/**
 * The labelled facts at the top of a listing page: what someone checks first, by kind of
 * listing. At most four, and only the ones the listing has.
 */
export function keyFactTiles(
  l: ListingSummary & { roadWidthFt?: number | null; facing?: string | null; fitoutStatus?: string | null; workstations?: number | null },
): [string, string][] {
  const tiles: ([string, string] | null)[] = [];
  const available = (from: string | null) => (!from || new Date(from) <= new Date() ? "Now" : formatDate(from, { day: "numeric", month: "short" }));
  if (l.transactionType === "stay" && l.stay) {
    tiles.push(
      ["Space", l.stay.spaceType === "entire_home" ? "Entire home" : "Private room"],
      ["Guests", `Up to ${l.stay.maxGuests}`],
      l.bedrooms ? ["Bedrooms", String(l.bedrooms)] : null,
      ["Beds", String(l.stay.beds)],
    );
  } else if (l.transactionType === "pg") {
    const order = ["single", "double", "triple", "quad"];
    tiles.push(
      ["For", GENDER_LABEL[l.genderPolicy ?? ""]?.replace(/^For /, "").replace(/^\w/, (c) => c.toUpperCase()) ?? "Anyone"],
      l.occupancies.length ? ["Sharing", [...l.occupancies].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((o) => OCCUPANCY_LABEL[o]).join(", ")] : null,
      l.meals ? ["Meals", MEALS_LABEL[l.meals]] : null,
      l.foodPreference ? ["Food", FOOD_LABEL[l.foodPreference].replace(/ food$/, "")] : null,
    );
  } else if (l.category === "land") {
    tiles.push(
      ["Type", l.typeName],
      l.plotAreaSqyd ? ["Plot area", `${Math.round(l.plotAreaSqyd).toLocaleString("en-IN")} sq yd`] : null,
      l.facing ? ["Facing", l.facing.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())] : null,
      l.roadWidthFt ? ["Road width", `${l.roadWidthFt} ft`] : null,
    );
  } else if (l.category === "commercial") {
    tiles.push(
      ["Type", l.typeName],
      l.carpetAreaSqft ? ["Carpet area", formatArea(l.carpetAreaSqft)] : null,
      l.fitoutStatus ? ["Fit-out", l.fitoutStatus.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())] : null,
      l.workstations ? ["Workstations", String(l.workstations)] : null,
    );
  } else {
    tiles.push(
      l.bedrooms !== null ? ["Bedrooms", l.bedrooms === 0 ? "Studio" : `${l.bedrooms} BHK`] : null,
      l.carpetAreaSqft ? ["Carpet area", formatArea(l.carpetAreaSqft)] : null,
      l.furnishing ? ["Furnishing", FURNISHING_LABEL[l.furnishing]] : null,
    );
    if (l.transactionType === "rent" || l.transactionType === "lease") tiles.push(["Available", available(l.availableFrom)]);
    else if (l.projectStatus && l.possessionDate) tiles.push(["Possession", formatDate(l.possessionDate, { month: "short", year: "numeric" })]);
    else if (l.lifecycleStatus === "ready" || l.lifecycleStatus === "occupied") tiles.push(["Status", "Ready to move"]);
  }
  return tiles.filter((t): t is [string, string] => t !== null).slice(0, 4);
}

/** Declared rental yield as a percentage, or null. Based on the seller's figure, never an estimate of ours. */
export function declaredYield(l: Pick<ListingSummary, "declaredMonthlyRent" | "price">): number | null {
  if (!l.declaredMonthlyRent || !l.price) return null;
  return Math.round(((l.declaredMonthlyRent * 12) / l.price) * 1000) / 10;
}

/** One extra, kind-specific line on a card. */
export function secondaryLine(l: ListingSummary, kind: ListingKind): string | null {
  if (l.transactionType === "stay" && l.stay) {
    return [l.stay.instantBook ? "Instant book" : "Host approves requests", l.stay.petsAllowed ? "Pets welcome" : null, l.stay.cleaningFee ? `+ ${formatPrice(l.stay.cleaningFee, { compact: false })} cleaning` : null]
      .filter(Boolean)
      .join(" · ");
  }
  if (l.transactionType === "rent") {
    const available = !l.availableFrom || new Date(l.availableFrom) <= new Date() ? "Available now" : `Available from ${formatDate(l.availableFrom, { day: "numeric", month: "short" })}`;
    return l.depositAmount ? `Deposit ${formatPrice(l.depositAmount)} · ${available}` : available;
  }
  if (l.transactionType === "pg") return l.foodPreference ? FOOD_LABEL[l.foodPreference] : null;
  if (kind === "invest") {
    const y = declaredYield(l);
    const parts = [
      l.projectStatus && l.possessionDate ? `Possession ${formatDate(l.possessionDate)}` : null,
      y ? `Declared rent yield ${y}%` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (l.projectStatus && l.possessionDate) return `Under construction · Possession ${formatDate(l.possessionDate)}`;
  return l.lifecycleStatus === "ready" || l.lifecycleStatus === "occupied" ? "Ready to move" : null;
}

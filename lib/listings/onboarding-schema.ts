import { z } from "zod";
import { BROKERAGE_TYPES, CANCELLATION_POLICIES, CUSTOM_AMENITY_LIMIT, CUSTOM_AMENITY_MAX_LENGTH, FACING, FURNISHING, LIFECYCLE_STATUSES, OWNERSHIP_TYPES, PURPOSES, SPACE_TYPES } from "@/lib/vocab";

/**
 * Validation for the Onboard Property workflow. Shared by the server actions (the
 * authority) and the wizard (for early feedback). Only fields relevant to the property's
 * category and purpose are accepted; everything else is simply not part of the schema,
 * so it cannot be mass-assigned.
 */

const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalNumber = (min: number, max: number, message?: string) =>
  z.preprocess(blankToUndefined, z.coerce.number({ message: message ?? "Enter a number" }).min(min, message).max(max, message).optional());
const requiredNumber = (min: number, max: number, message: string) =>
  z.preprocess(blankToUndefined, z.coerce.number({ message }).min(min, message).max(max, message));
const optionalInt = (min: number, max: number, message?: string) =>
  z.preprocess(blankToUndefined, z.coerce.number({ message: message ?? "Enter a whole number" }).int(message).min(min, message).max(max, message).optional());
const requiredInt = (min: number, max: number, message: string) =>
  z.preprocess(blankToUndefined, z.coerce.number({ message }).int(message).min(min, message).max(max, message));
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Keep it under ${max} characters`).optional());
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blankToUndefined, z.enum(values).optional());

export const PURPOSE_LABELS: Record<(typeof PURPOSES)[number], string> = {
  sale: "Sell",
  rent: "Rent out",
  lease: "Lease",
  pg: "PG / co-living",
  stay: "Home Stay",
};

export const CATEGORY_LABELS = {
  residential: "Residential",
  commercial: "Commercial",
  land: "Land",
  co_living: "PG & co-living",
} as const;

// ── Step 1–4: purpose, category, type, location. Creates the draft. ─────────────

// Only where the property is. The flat or unit number is part of the property, in Details.
const locationFields = {
  localityId: z.uuid({ message: "Choose a locality" }),
  line1: z.string().trim().min(3, "Enter the building or street").max(200, "Keep it under 200 characters"),
  line2: optionalText(200),
  landmark: optionalText(120),
  postalCode: z.preprocess(blankToUndefined, z.string().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code").optional()),
  /** A Google Maps or Apple Maps link; the server reads the pin from it (lib/services/map-links). */
  mapLink: optionalText(2000),
};

export const locationSchema = z.object(locationFields);

export const startSchema = z.object({
  purpose: z.enum(PURPOSES, { message: "Choose what the property is for" }),
  propertyType: z.string().regex(/^[a-z_]{2,40}$/, "Choose a property type"),
  ...locationFields,
});
export type StartInput = z.infer<typeof startSchema>;

// ── Details, by category ────────────────────────────────────────────────────────

/** Listing titles are short, so they fit on a card and in a search result. */
export const TITLE_MAX = 50;

const yearMessage = "Enter the year it was built, or is due to be finished (1900 to a few years from now)";
const yearBuilt = requiredInt(1900, new Date().getFullYear() + 6, yearMessage);

const basics = {
  title: z.string().trim().min(10, "Use at least 10 characters").max(TITLE_MAX, `Keep the title to ${TITLE_MAX} characters or fewer`),
  description: z.preprocess(blankToUndefined, z.string().trim().max(5000, "Keep it under 5,000 characters").optional()),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES, { message: "Choose the construction status" }),
  ownershipType: z.preprocess(blankToUndefined, z.enum(OWNERSHIP_TYPES, { message: "Choose the ownership" })),
  yearBuilt: optionalInt(1900, new Date().getFullYear() + 6, yearMessage),
};

const building = {
  carpetAreaSqft: optionalNumber(20, 5_000_000, "Enter an area in sq ft"),
  builtUpAreaSqft: optionalNumber(20, 5_000_000, "Enter an area in sq ft"),
  superBuiltUpAreaSqft: optionalNumber(20, 5_000_000, "Enter an area in sq ft"),
  yearBuilt,
  floorNumber: requiredInt(-5, 200, "Enter the floor, from -5 to 200 (0 for the ground floor)"),
  totalFloors: requiredInt(1, 200, "Enter the total floors in the building, from 1 to 200"),
  /** Not shown to customers; used to spot the same flat listed twice. */
  unitNumber: optionalText(20),
};

type AreaFields = { carpetAreaSqft?: number; builtUpAreaSqft?: number; superBuiltUpAreaSqft?: number; floorNumber?: number; totalFloors?: number };

function checkAreas(v: AreaFields, ctx: z.RefinementCtx) {
  if (v.carpetAreaSqft && v.builtUpAreaSqft && v.carpetAreaSqft > v.builtUpAreaSqft) {
    ctx.addIssue({ code: "custom", path: ["builtUpAreaSqft"], message: "Built-up area can't be smaller than carpet area" });
  }
  if (v.builtUpAreaSqft && v.superBuiltUpAreaSqft && v.builtUpAreaSqft > v.superBuiltUpAreaSqft) {
    ctx.addIssue({ code: "custom", path: ["superBuiltUpAreaSqft"], message: "Super built-up area can't be smaller than built-up area" });
  }
  if (v.floorNumber !== undefined && v.totalFloors !== undefined && v.floorNumber > v.totalFloors) {
    ctx.addIssue({ code: "custom", path: ["floorNumber"], message: "Floor can't be above the total number of floors" });
  }
}

export const residentialDetailsSchema = z
  .object({
    ...basics,
    ...building,
    carpetAreaSqft: requiredNumber(20, 500_000, "Enter the carpet area in sq ft"),
    bedrooms: requiredInt(0, 20, "Bedrooms must be between 0 and 20"),
    bathrooms: requiredInt(0, 20, "Bathrooms must be between 0 and 20"),
    balconies: requiredInt(0, 20, "Balconies must be between 0 and 20"),
    furnishing: z.enum(FURNISHING, { message: "Choose the furnishing" }),
    facing: z.preprocess(blankToUndefined, z.enum(FACING, { message: "Choose the direction it faces" })),
    coveredParking: requiredInt(0, 20, "Parking must be between 0 and 20"),
  })
  .superRefine(checkAreas);

export const commercialDetailsSchema = z
  .object({
    ...basics,
    ...building,
    carpetAreaSqft: requiredNumber(20, 5_000_000, "Enter the carpet area in sq ft"),
    fitoutStatus: z.enum(["bare_shell", "warm_shell", "fully_fitted"], { message: "Choose the fit-out" }),
    grade: optionalEnum(["A", "B", "C"] as const),
    workstations: optionalInt(0, 10_000),
    washrooms: optionalInt(0, 200),
    parkingSpaces: optionalInt(0, 5_000),
    powerBackup: optionalEnum(["none", "partial", "full"] as const),
    loadingAccess: checkbox,
    suitableFor: optionalText(200),
  })
  .superRefine(checkAreas);

export const landDetailsSchema = z.object({
  ...basics,
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES).default("ready"),
  plotAreaSqyd: requiredNumber(1, 10_000_000, "Enter the plot area in sq yd"),
  zoning: z.enum(["residential", "commercial", "agricultural", "industrial"], { message: "Choose the land use" }),
  roadWidthFt: optionalInt(0, 500),
  frontageFt: optionalInt(0, 10_000),
  cornerPlot: checkbox,
  boundaryWall: checkbox,
  surveyNumber: optionalText(60),
});

export const pgDetailsSchema = z
  .object({
    ...basics,
    yearBuilt,
    totalRooms: requiredInt(1, 2000, "Enter the number of rooms"),
    totalBeds: requiredInt(1, 10_000, "Enter the number of beds"),
    attachedBathrooms: requiredInt(0, 2000, "Enter a number"),
    commonKitchen: checkbox,
    genderPolicy: z.enum(["men", "women", "any"], { message: "Choose who the PG is for" }),
    meals: z.enum(["none", "breakfast", "two", "three"], { message: "Choose the meals" }),
    foodPreference: optionalEnum(["veg", "non_veg", "both"] as const),
    noticePeriodDays: optionalInt(0, 180),
    lockInMonths: optionalInt(0, 36),
    entryCurfew: z.preprocess(blankToUndefined, z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use 24-hour time, e.g. 22:30").optional()),
    visitorsAllowed: checkbox,
    houseRules: optionalText(1000),
  })
  .refine((v) => v.totalBeds >= v.totalRooms, { message: "There must be at least one bed per room", path: ["totalBeds"] })
  .refine((v) => v.attachedBathrooms <= v.totalRooms, { message: "Can't exceed the number of rooms", path: ["attachedBathrooms"] });

export const DETAILS_SCHEMAS = {
  residential: residentialDetailsSchema,
  commercial: commercialDetailsSchema,
  land: landDetailsSchema,
  co_living: pgDetailsSchema,
} as const;

// ── Pricing, by purpose ─────────────────────────────────────────────────────────

const brokerage = {
  brokerageType: optionalEnum(BROKERAGE_TYPES),
  brokerageValue: optionalNumber(0, 1_000_000_000),
  brokerageNegotiable: checkbox,
};

/** Brokerage choices that need an amount: a percentage, a number of months, or rupees. */
export const BROKERAGE_WITH_AMOUNT = ["percent", "months_rent", "fixed"] as const;
/** Brokerage choices that can be marked negotiable (no brokerage and "flexible" can't). */
export const BROKERAGE_NEGOTIABLE = ["percent", "months_rent", "half_month", "fixed"] as const;
/** Charged in months of rent, so only for rentals. */
const RENT_ONLY = ["months_rent", "half_month"];

const needsAmount = (t?: string) => (BROKERAGE_WITH_AMOUNT as readonly string[]).includes(t ?? "");

function checkBrokerage(v: { brokerageType?: string; brokerageValue?: number }, ctx: z.RefinementCtx, rental: boolean) {
  if (!rental && RENT_ONLY.includes(v.brokerageType ?? "")) {
    ctx.addIssue({ code: "custom", path: ["brokerageType"], message: "Months of rent apply to rentals only. Choose another way" });
  }
  if (needsAmount(v.brokerageType) && v.brokerageValue === undefined) {
    ctx.addIssue({ code: "custom", path: ["brokerageValue"], message: "Enter the brokerage amount" });
  }
  if (v.brokerageType === "percent" && v.brokerageValue !== undefined && v.brokerageValue > 10) {
    ctx.addIssue({ code: "custom", path: ["brokerageValue"], message: "Brokerage above 10% is not accepted" });
  }
  if (v.brokerageType === "months_rent" && v.brokerageValue !== undefined && v.brokerageValue > 3) {
    ctx.addIssue({ code: "custom", path: ["brokerageValue"], message: "Brokerage above 3 months' rent is not accepted" });
  }
}

/** What's stored: an amount only where the choice has one, and "negotiable" only where it can be. */
export function brokerageToStore(p: { brokerageType?: string; brokerageValue?: number; brokerageNegotiable: boolean }) {
  return {
    brokerageType: p.brokerageType ?? null,
    brokerageValue: needsAmount(p.brokerageType) ? (p.brokerageValue ?? null) : null,
    brokerageNegotiable: (BROKERAGE_NEGOTIABLE as readonly string[]).includes(p.brokerageType ?? "") ? p.brokerageNegotiable : false,
  };
}

export const salePricingSchema = z
  .object({
    price: requiredNumber(10_000, 100_000_000_000, "Enter a price between ₹10,000 and ₹10,000 Cr"),
    priceNegotiable: checkbox,
    maintenanceAmount: optionalNumber(0, 10_000_000),
    declaredMonthlyRent: optionalNumber(0, 100_000_000, "Enter the monthly rent it earns, or leave blank"),
    reraId: optionalText(60),
    availableFrom: z.preprocess(blankToUndefined, z.iso.date("Enter a date").optional()),
    ...brokerage,
  })
  .superRefine((v, ctx) => checkBrokerage(v, ctx, false));

export const rentPricingSchema = z
  .object({
    price: requiredNumber(500, 100_000_000, "Enter a monthly rent between ₹500 and ₹10 Cr"),
    priceNegotiable: checkbox,
    depositAmount: optionalNumber(0, 1_000_000_000),
    maintenanceAmount: optionalNumber(0, 10_000_000),
    availableFrom: z.preprocess(blankToUndefined, z.iso.date("Enter a date").optional()),
    leaseDurationMonths: optionalInt(1, 600),
    ...brokerage,
  })
  .superRefine((v, ctx) => checkBrokerage(v, ctx, true));

export const leasePricingSchema = rentPricingSchema.superRefine((v, ctx) => {
  if (!v.leaseDurationMonths) ctx.addIssue({ code: "custom", path: ["leaseDurationMonths"], message: "Enter the lease term in months" });
});

export const roomSchema = z.object({
  occupancy: z.enum(["single", "double", "triple", "quad"]),
  rentPerBed: requiredNumber(500, 1_000_000, "Rent per bed must be between ₹500 and ₹10 lakh"),
  depositAmount: optionalNumber(0, 10_000_000),
  bedsAvailable: requiredInt(0, 10_000, "Enter the beds available"),
  hasAc: checkbox,
  attachedBathroom: checkbox,
});

export const pgPricingSchema = z
  .object({
    availableFrom: z.preprocess(blankToUndefined, z.iso.date("Enter a date").optional()),
    rooms: z.array(roomSchema).min(1, "Add at least one room type").max(16, "Up to 16 room types"),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.rooms.forEach((r, i) => {
      const key = `${r.occupancy}-${r.hasAc}-${r.attachedBathroom}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["rooms", i, "occupancy"], message: "This room type is already listed" });
      seen.add(key);
    });
  });

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (message: string) => z.string().regex(TIME, message);
const nightlyPrice = requiredNumber(300, 1_000_000, "Enter a nightly price between ₹300 and ₹10 lakh");

function checkNights(v: { minNights: number; maxNights: number }, ctx: z.RefinementCtx) {
  if (v.minNights > v.maxNights) ctx.addIssue({ code: "custom", path: ["maxNights"], message: "The longest stay can't be shorter than the shortest" });
}

/** Homestays: nightly price and the rules guests agree to. */
export const stayPricingSchema = z
  .object({
    price: nightlyPrice,
    weekendPrice: optionalNumber(300, 1_000_000, "Enter a weekend price between ₹300 and ₹10 lakh, or leave blank"),
    cleaningFee: optionalNumber(0, 100_000, "Enter a cleaning fee up to ₹1 lakh, or leave blank"),
    spaceType: z.enum(SPACE_TYPES, { message: "Choose what guests get" }),
    maxGuests: requiredInt(1, 30, "Guests must be between 1 and 30"),
    beds: requiredInt(1, 50, "Beds must be between 1 and 50"),
    minNights: requiredInt(1, 90, "Minimum stay must be 1 to 90 nights"),
    maxNights: requiredInt(1, 365, "Maximum stay must be 1 to 365 nights"),
    checkInTime: time("Enter a check-in time"),
    checkOutTime: time("Enter a check-out time"),
    instantBook: checkbox,
    cancellationPolicy: z.enum(CANCELLATION_POLICIES, { message: "Choose a cancellation policy" }),
    petsAllowed: checkbox,
    smokingAllowed: checkbox,
    eventsAllowed: checkbox,
    houseRules: optionalText(2000),
  })
  .superRefine(checkNights);

export const PRICING_SCHEMAS = { sale: salePricingSchema, rent: rentPricingSchema, lease: leasePricingSchema, pg: pgPricingSchema, stay: stayPricingSchema } as const;

// ── Quick edits from the property card: price, terms, availability, offer ──────
// Allowed on live listings without another review: they change what the listing costs,
// not what it is. Every change is audited and price changes enter the price history.

const offerFields = {
  offerTitle: z.preprocess(blankToUndefined, z.string().trim().min(2, "Give the offer a short title").max(60, "Keep the title under 60 characters").optional()),
  offerDetails: optionalText(280),
  offerValidUntil: z.preprocess(blankToUndefined, z.iso.date("Enter a date").optional()),
};

function checkOffer(v: { offerTitle?: string; offerDetails?: string; offerValidUntil?: string }, ctx: z.RefinementCtx) {
  if (!v.offerTitle && (v.offerDetails || v.offerValidUntil)) {
    ctx.addIssue({ code: "custom", path: ["offerTitle"], message: "Give the offer a short title, or clear the other offer fields" });
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (v.offerValidUntil && v.offerValidUntil < today) ctx.addIssue({ code: "custom", path: ["offerValidUntil"], message: "That date has passed" });
}

const availableFrom = z.preprocess(blankToUndefined, z.iso.date("Enter a date").optional());

export const saleTermsSchema = z
  .object({
    price: requiredNumber(10_000, 100_000_000_000, "Enter a price between ₹10,000 and ₹10,000 Cr"),
    priceNegotiable: checkbox,
    maintenanceAmount: optionalNumber(0, 10_000_000),
    availableFrom,
    ...offerFields,
  })
  .superRefine(checkOffer);

export const rentTermsSchema = z
  .object({
    price: requiredNumber(500, 100_000_000, "Enter a monthly rent between ₹500 and ₹10 Cr"),
    priceNegotiable: checkbox,
    depositAmount: optionalNumber(0, 1_000_000_000),
    maintenanceAmount: optionalNumber(0, 10_000_000),
    availableFrom,
    ...offerFields,
  })
  .superRefine(checkOffer);

export const pgTermsSchema = z
  .object({
    availableFrom,
    rooms: z
      .array(
        z.object({
          id: z.uuid(),
          rentPerBed: requiredNumber(500, 1_000_000, "Rent per bed must be between ₹500 and ₹10 lakh"),
          bedsAvailable: requiredInt(0, 10_000, "Enter the beds free"),
        }),
      )
      .max(16),
    ...offerFields,
  })
  .superRefine(checkOffer);

export const stayTermsSchema = z
  .object({
    price: nightlyPrice,
    weekendPrice: optionalNumber(300, 1_000_000, "Enter a weekend price between ₹300 and ₹10 lakh, or leave blank"),
    cleaningFee: optionalNumber(0, 100_000, "Enter a cleaning fee up to ₹1 lakh, or leave blank"),
    minNights: requiredInt(1, 90, "Minimum stay must be 1 to 90 nights"),
    maxNights: requiredInt(1, 365, "Maximum stay must be 1 to 365 nights"),
    instantBook: checkbox,
    ...offerFields,
  })
  .superRefine((v, ctx) => {
    checkNights(v, ctx);
    checkOffer(v, ctx);
  });

export const TERMS_SCHEMAS = { sale: saleTermsSchema, rent: rentTermsSchema, lease: rentTermsSchema, pg: pgTermsSchema, stay: stayTermsSchema } as const;

const asList = (v: unknown) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

/** Tidies a typed amenity: single spaces, first letter capitalised. */
export const tidyAmenity = (name: string) => {
  const t = name.replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Letters and numbers first, then simple punctuation: "Rooftop garden", "EV charging (2 points)". */
export const CUSTOM_AMENITY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'()+,./-]*$/u;

export const amenitiesSchema = z.object({
  amenities: z.preprocess(asList, z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(60)),
  custom: z.preprocess(
    asList,
    z
      .array(
        z
          .string()
          .transform(tidyAmenity)
          .pipe(
            z
              .string()
              .min(2, "Each amenity needs at least 2 characters")
              .max(CUSTOM_AMENITY_MAX_LENGTH, `Keep each amenity under ${CUSTOM_AMENITY_MAX_LENGTH} characters`)
              .regex(CUSTOM_AMENITY_PATTERN, "Use letters, numbers and simple punctuation"),
          ),
      )
      .max(CUSTOM_AMENITY_LIMIT, `Add up to ${CUSTOM_AMENITY_LIMIT} of your own`)
      .transform((names) => names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)),
  ),
});

/** Zod issues → { field: message }, first message per field, for inline form errors. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

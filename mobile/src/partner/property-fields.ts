import type { WorkspaceListing } from "@/api/workspace-types";
import { BROKERAGE_LABELS, brokerageChoices } from "@/lib/listings/brokerage";
import { CANCELLATION_LABELS, SPACE_TYPE_LABELS } from "@/lib/stays/labels";
import { CANCELLATION_POLICIES, FACING, FURNISHING, OWNERSHIP_TYPES, SPACE_TYPES } from "@/lib/vocab";

/**
 * The property steps' fields, as on the website (components/workspace/onboarding/StepForms.tsx):
 * the same names, labels, choices and hints. The server checks everything again
 * (lib/listings/onboarding-schema); these only lay the form out.
 */

// As lib/listings/onboarding-schema, which the app can't import (it's built on the server's zod).
export const TITLE_MAX = 50;
export const BROKERAGE_WITH_AMOUNT = ["percent", "months_rent", "fixed"] as const;
export const BROKERAGE_NEGOTIABLE = ["percent", "months_rent", "half_month", "fixed"] as const;
export const CUSTOM_AMENITY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &'()+,./-]*$/u;
export const tidyAmenity = (name: string) => {
  const t = name.replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export type Values = Record<string, string | boolean>;
type Opt = { value: string; label: string; hint?: string };
type Base = { name: string; label: string; required?: boolean; hint?: string; visible?: (v: Values) => boolean };
export type FieldSpec =
  | (Base & { kind: "text" | "multiline"; placeholder?: string; maxLength?: number })
  | (Base & { kind: "number" | "decimal" | "money"; placeholder?: string; suffix?: string })
  | (Base & { kind: "select" | "chips" | "cards"; options: Opt[] })
  | (Base & { kind: "toggle" })
  | (Base & { kind: "date" | "time" });
export type Section = { title: string; description?: string; fields: FieldSpec[] };

const title = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const opts = (values: readonly string[], labels: Record<string, string> = {}): Opt[] => values.map((value) => ({ value, label: labels[value] ?? title(value) }));
/** Numbers from the database ("11500.00") as the form shows them ("11500"). */
const str = (x: unknown) => (x === null || x === undefined ? "" : typeof x === "string" && /^-?\d+\.\d+$/.test(x) ? String(Number(x)) : String(x));

const LIFECYCLE: Opt[] = [
  { value: "ready", label: "Ready to move" },
  { value: "occupied", label: "Ready, currently occupied" },
  { value: "under_construction", label: "Under construction" },
  { value: "planned", label: "New launch, not started" },
];
const OWNERSHIP = opts(OWNERSHIP_TYPES, { freehold: "Freehold", leasehold: "Leasehold", cooperative_society: "Co-operative society", power_of_attorney: "Power of attorney" });

// ── Details ──────────────────────────────────────────────────────────────────

function basics(withLifecycle = true): FieldSpec[] {
  return [
    { kind: "text", name: "title", label: "Listing title", required: true, maxLength: TITLE_MAX, hint: `What customers see first, e.g. "3 BHK with a park view, Kondapur". Up to ${TITLE_MAX} characters.` },
    { kind: "multiline", name: "description", label: "Description", maxLength: 5000, hint: "Describe it honestly: what's nearby, what's included, anything a visitor should know." },
    ...(withLifecycle ? [{ kind: "select" as const, name: "lifecycleStatus", label: "Construction status", required: true, options: LIFECYCLE }] : []),
    { kind: "select", name: "ownershipType", label: "Ownership", required: true, options: OWNERSHIP },
  ];
}

const yearBuilt: FieldSpec = { kind: "number", name: "yearBuilt", label: "Year built", required: true, placeholder: "e.g. 2018", hint: "Still being built? The year it's due to be finished." };

function building(l: WorkspaceListing): FieldSpec[] {
  const house = ["independent_house", "villa", "farmhouse"].includes(l.type.code);
  return [
    { kind: "text", name: "unitNumber", label: l.type.category === "commercial" ? "Unit / shop number" : "Flat / unit number", hint: "Not shown to customers. Used to spot the same property listed twice." },
    yearBuilt,
    { kind: "decimal", name: "carpetAreaSqft", label: "Carpet area", suffix: "sq ft", required: true, hint: "Used when buyers filter by size." },
    { kind: "decimal", name: "builtUpAreaSqft", label: "Built-up area", suffix: "sq ft" },
    { kind: "decimal", name: "superBuiltUpAreaSqft", label: "Super built-up area", suffix: "sq ft" },
    { kind: "number", name: "floorNumber", label: "Floor number", required: true, hint: house ? "0 for a house or villa (its ground floor)." : "0 for the ground floor, negative for basements." },
    { kind: "number", name: "totalFloors", label: house ? "Floors in the house" : "Total floors in the building", required: true },
  ];
}

export function detailsSections(l: WorkspaceListing): Section[] {
  switch (l.type.category) {
    case "residential":
      return [
        { title: "About the listing", fields: basics() },
        { title: "The building", fields: building(l) },
        {
          title: "The home",
          fields: [
            { kind: "number", name: "bedrooms", label: "Bedrooms", required: true, hint: "0 for a studio." },
            { kind: "number", name: "bathrooms", label: "Bathrooms", required: true },
            { kind: "number", name: "balconies", label: "Balconies", required: true },
            { kind: "chips", name: "furnishing", label: "Furnishing", required: true, options: opts(FURNISHING) },
            { kind: "select", name: "facing", label: "Facing", required: true, options: opts(FACING), hint: "The direction the main door faces." },
            { kind: "number", name: "coveredParking", label: "Covered parking spaces", required: true },
          ],
        },
      ];
    case "commercial":
      return [
        { title: "About the listing", fields: basics() },
        { title: "The building", fields: building(l) },
        {
          title: "The space",
          fields: [
            { kind: "chips", name: "fitoutStatus", label: "Fit-out", required: true, options: [{ value: "bare_shell", label: "Bare shell" }, { value: "warm_shell", label: "Warm shell" }, { value: "fully_fitted", label: "Fully fitted" }] },
            { kind: "chips", name: "grade", label: "Building grade", options: opts(["A", "B", "C"]) },
            { kind: "number", name: "workstations", label: "Workstations" },
            { kind: "number", name: "washrooms", label: "Washrooms" },
            { kind: "number", name: "parkingSpaces", label: "Parking spaces" },
            { kind: "chips", name: "powerBackup", label: "Power backup", options: [{ value: "none", label: "None" }, { value: "partial", label: "Partial" }, { value: "full", label: "Full" }] },
            { kind: "text", name: "suitableFor", label: "Suitable for", hint: "e.g. Clinic, bank branch, café" },
            { kind: "toggle", name: "loadingAccess", label: "Loading access for goods vehicles" },
          ],
        },
      ];
    case "land":
      return [
        { title: "About the listing", fields: basics(false) },
        {
          title: "The plot",
          fields: [
            { kind: "decimal", name: "plotAreaSqyd", label: "Plot area", suffix: "sq yd", required: true, hint: "Buyers filter plots by this. In square yards (gaj): if you have sq ft, divide by 9." },
            { kind: "chips", name: "zoning", label: "Land use", required: true, options: opts(["residential", "commercial", "agricultural", "industrial"]) },
            { kind: "number", name: "roadWidthFt", label: "Road width", suffix: "ft" },
            { kind: "number", name: "frontageFt", label: "Frontage", suffix: "ft" },
            { kind: "text", name: "surveyNumber", label: "Survey / plot number", hint: "From public land records." },
            { kind: "toggle", name: "cornerPlot", label: "Corner plot" },
            { kind: "toggle", name: "boundaryWall", label: "Boundary wall" },
          ],
        },
      ];
    case "co_living":
      return [
        { title: "About the listing", fields: [...basics(), yearBuilt] },
        {
          title: "Rooms and rules",
          fields: [
            { kind: "number", name: "totalRooms", label: "Rooms", required: true },
            { kind: "number", name: "totalBeds", label: "Beds", required: true },
            { kind: "number", name: "attachedBathrooms", label: "Rooms with attached bathroom", required: true },
            { kind: "chips", name: "genderPolicy", label: "Who it's for", required: true, options: [{ value: "men", label: "Men" }, { value: "women", label: "Women" }, { value: "any", label: "Co-living (anyone)" }] },
            { kind: "select", name: "meals", label: "Meals", required: true, options: [{ value: "none", label: "No meals" }, { value: "breakfast", label: "Breakfast only" }, { value: "two", label: "Two meals a day" }, { value: "three", label: "Three meals a day" }] },
            { kind: "chips", name: "foodPreference", label: "Food", options: [{ value: "veg", label: "Vegetarian" }, { value: "non_veg", label: "Non-vegetarian" }, { value: "both", label: "Veg and non-veg" }] },
            { kind: "number", name: "noticePeriodDays", label: "Notice period", suffix: "days" },
            { kind: "number", name: "lockInMonths", label: "Lock-in", suffix: "months" },
            { kind: "time", name: "entryCurfew", label: "Entry curfew", hint: "Leave as none if there isn't one." },
            { kind: "multiline", name: "houseRules", label: "House rules", maxLength: 1000 },
            { kind: "toggle", name: "commonKitchen", label: "Common kitchen" },
            { kind: "toggle", name: "visitorsAllowed", label: "Visitors allowed" },
          ],
        },
      ];
  }
}

export function detailsValues(l: WorkspaceListing): Values {
  const p = l.property;
  const r = l.residential ?? {};
  const c = l.commercial ?? {};
  const land = l.land ?? {};
  const pa = l.pg.attributes ?? {};
  const t = l.pg.terms ?? {};
  const house = ["independent_house", "villa", "farmhouse"].includes(l.type.code);
  return {
    title: l.title,
    description: l.description ?? "",
    lifecycleStatus: l.type.category === "land" ? "ready" : p.lifecycleStatus,
    ownershipType: str(p.ownershipType),
    yearBuilt: str(p.yearBuilt),
    unitNumber: str(l.location.unitNumber),
    carpetAreaSqft: str(p.carpetAreaSqft),
    builtUpAreaSqft: str(p.builtUpAreaSqft),
    superBuiltUpAreaSqft: str(p.superBuiltUpAreaSqft),
    floorNumber: str(p.floorNumber) || (house ? "0" : ""),
    totalFloors: str(p.totalFloors),
    bedrooms: str(r.bedrooms),
    bathrooms: str(r.bathrooms),
    balconies: str(r.balconies) || "0",
    furnishing: str(r.furnishing),
    facing: str(r.facing),
    coveredParking: str(r.covered_parking) || "0",
    fitoutStatus: str(c.fitout_status),
    grade: str(c.grade),
    workstations: str(c.workstations),
    washrooms: str(c.washrooms),
    parkingSpaces: str(c.parking_spaces),
    powerBackup: str(c.power_backup),
    suitableFor: str(c.suitable_for),
    loadingAccess: Boolean(c.loading_access),
    plotAreaSqyd: str(land.plot_area_sqyd),
    zoning: str(land.zoning) || (["residential_plot", "open_plot"].includes(l.type.code) ? "residential" : ""),
    roadWidthFt: str(land.road_width_ft),
    frontageFt: str(land.frontage_ft),
    surveyNumber: str(land.survey_number),
    cornerPlot: Boolean(land.corner_plot),
    boundaryWall: Boolean(land.boundary_wall),
    totalRooms: str(pa.total_rooms),
    totalBeds: str(pa.total_beds),
    attachedBathrooms: str(pa.attached_bathrooms) || "0",
    commonKitchen: Boolean(pa.common_kitchen),
    genderPolicy: str(t.gender_policy),
    meals: str(t.meals),
    foodPreference: str(t.food_preference),
    noticePeriodDays: str(t.notice_period_days),
    lockInMonths: str(t.lock_in_months),
    entryCurfew: str(t.entry_curfew).slice(0, 5),
    visitorsAllowed: Boolean(t.visitors_allowed),
    houseRules: str(t.house_rules),
  };
}

// ── Pricing ──────────────────────────────────────────────────────────────────

const AMOUNT: Record<string, { label: string; hint: string; suffix?: string }> = {
  percent: { label: "Brokerage", hint: "Percentage of the price, up to 10%.", suffix: "%" },
  months_rent: { label: "Brokerage", hint: "Months of rent, e.g. 1. Up to 3.", suffix: "months" },
  fixed: { label: "Brokerage amount", hint: "The fixed fee, in rupees." },
};

export function pricingSections(l: WorkspaceListing): Section[] {
  if (l.purpose === "stay") {
    return [
      { title: "What guests get", fields: [{ kind: "cards", name: "spaceType", label: "What guests get", required: true, options: SPACE_TYPES.map((s) => ({ value: s, label: SPACE_TYPE_LABELS[s].label, hint: SPACE_TYPE_LABELS[s].hint })) }] },
      {
        title: "Price",
        fields: [
          { kind: "money", name: "price", label: "Price per night", required: true, hint: "What guests pay per night on weekdays." },
          { kind: "money", name: "weekendPrice", label: "Weekend price per night", hint: "Friday and Saturday nights. Leave blank to use the same price." },
          { kind: "money", name: "cleaningFee", label: "Cleaning fee", hint: "Once per stay." },
        ],
      },
      {
        title: "Stays",
        fields: [
          { kind: "number", name: "maxGuests", label: "Maximum guests", required: true },
          { kind: "number", name: "beds", label: "Beds", required: true },
          { kind: "number", name: "minNights", label: "Shortest stay", suffix: "nights", required: true },
          { kind: "number", name: "maxNights", label: "Longest stay", suffix: "nights", required: true },
          { kind: "time", name: "checkInTime", label: "Check-in from", required: true },
          { kind: "time", name: "checkOutTime", label: "Check-out by", required: true },
          { kind: "select", name: "cancellationPolicy", label: "Cancellation policy", required: true, options: CANCELLATION_POLICIES.map((p) => ({ value: p, label: CANCELLATION_LABELS[p].label, hint: CANCELLATION_LABELS[p].rule })) },
          { kind: "toggle", name: "instantBook", label: "Instant book", hint: "Guests are confirmed straight away. Otherwise you get 24 hours to accept each request." },
          { kind: "toggle", name: "petsAllowed", label: "Pets allowed" },
          { kind: "toggle", name: "smokingAllowed", label: "Smoking allowed" },
          { kind: "toggle", name: "eventsAllowed", label: "Parties and events allowed" },
          { kind: "multiline", name: "houseRules", label: "House rules", maxLength: 2000, hint: "Quiet hours, shoes off, who may visit… Guests see these before they book." },
        ],
      },
    ];
  }
  const rentLike = l.purpose === "rent" || l.purpose === "lease";
  const choices = brokerageChoices(l.purpose);
  const saved = l.pricing.brokerageType;
  const values = saved && !choices.includes(saved as never) ? [...choices, saved] : choices;
  return [
    {
      title: "Price",
      fields: [
        { kind: "money", name: "price", label: rentLike ? "Monthly rent" : "Price", required: true },
        { kind: "toggle", name: "priceNegotiable", label: rentLike ? "Rent is negotiable" : "Price is negotiable" },
        ...(rentLike ? [{ kind: "money" as const, name: "depositAmount", label: "Security deposit" }] : []),
        { kind: "money", name: "maintenanceAmount", label: "Maintenance per month" },
        ...(l.purpose === "lease" ? [{ kind: "number" as const, name: "leaseDurationMonths", label: "Lease term", suffix: "months", required: true }] : []),
        ...(l.purpose === "rent" ? [{ kind: "number" as const, name: "leaseDurationMonths", label: "Minimum stay", suffix: "months" }] : []),
        { kind: "date", name: "availableFrom", label: rentLike ? "Available from" : "Possession from" },
        ...(l.purpose === "sale"
          ? [
              { kind: "text" as const, name: "reraId", label: "RERA registration", hint: "Required by law for most new projects. Shown to customers." },
              { kind: "money" as const, name: "declaredMonthlyRent", label: "Current monthly rent it earns", hint: "Shown to investors as a declared yield, never as an estimate." },
            ]
          : []),
      ],
    },
    {
      title: "Brokerage",
      fields: [
        { kind: "select", name: "brokerageType", label: "Brokerage", options: values.map((value) => ({ value, label: BROKERAGE_LABELS[value as keyof typeof BROKERAGE_LABELS] ?? value, hint: value === "flexible" ? "To be agreed with the customer." : undefined })) },
        ...(["percent", "months_rent", "fixed"] as const).map(
          (t): FieldSpec => ({
            kind: t === "fixed" ? "money" : "decimal",
            name: "brokerageValue",
            label: AMOUNT[t].label,
            suffix: AMOUNT[t].suffix,
            hint: AMOUNT[t].hint,
            required: true,
            visible: (v) => v.brokerageType === t,
          }),
        ),
        { kind: "toggle", name: "brokerageNegotiable", label: "Brokerage is negotiable", visible: (v) => (BROKERAGE_NEGOTIABLE as readonly string[]).includes(String(v.brokerageType)) },
      ],
    },
  ];
}

export function pricingValues(l: WorkspaceListing): Values {
  const p = l.pricing;
  const t = l.stay;
  return {
    price: str(p.price),
    priceNegotiable: p.priceNegotiable,
    depositAmount: str(p.depositAmount),
    maintenanceAmount: str(p.maintenanceAmount),
    declaredMonthlyRent: str(p.declaredMonthlyRent),
    availableFrom: p.availableFrom ?? "",
    leaseDurationMonths: str(p.leaseDurationMonths),
    reraId: p.reraId ?? "",
    brokerageType: p.brokerageType ?? "",
    brokerageValue: str(p.brokerageValue),
    brokerageNegotiable: p.brokerageNegotiable,
    spaceType: t?.spaceType ?? "entire_home",
    weekendPrice: str(t?.weekendPrice),
    cleaningFee: str(t?.cleaningFee),
    maxGuests: str(t?.maxGuests),
    beds: str(t?.beds ?? l.residential?.bedrooms),
    minNights: str(t?.minNights ?? 1),
    maxNights: str(t?.maxNights ?? 30),
    checkInTime: (t?.checkInTime ?? "14:00").slice(0, 5),
    checkOutTime: (t?.checkOutTime ?? "11:00").slice(0, 5),
    cancellationPolicy: t?.cancellationPolicy ?? "moderate",
    instantBook: t?.instantBook ?? false,
    petsAllowed: t?.petsAllowed ?? false,
    smokingAllowed: t?.smokingAllowed ?? false,
    eventsAllowed: t?.eventsAllowed ?? false,
    houseRules: t?.houseRules ?? "",
  };
}

/** Only what the form shows is sent, so a hidden field (brokerage amount for "no brokerage") is never saved. */
export function visibleValues(sections: Section[], values: Values): Values {
  const out: Values = {};
  for (const s of sections) for (const f of s.fields) if (!f.visible || f.visible(values)) out[f.name] = values[f.name] ?? "";
  if (sections.some((s) => s.fields.some((f) => f.name === "brokerageType")) && !(BROKERAGE_WITH_AMOUNT as readonly string[]).includes(String(values.brokerageType))) delete out.brokerageValue;
  return out;
}

// ── PG rooms ─────────────────────────────────────────────────────────────────

export type PgRoom = { key: number; occupancy: string; rentPerBed: string; depositAmount: string; bedsAvailable: string; hasAc: boolean; attachedBathroom: boolean };
export const OCCUPANCY: Opt[] = [
  { value: "single", label: "Single" },
  { value: "double", label: "Double" },
  { value: "triple", label: "Triple" },
  { value: "quad", label: "Four sharing" },
];

export function pgRooms(l: WorkspaceListing): PgRoom[] {
  return l.pg.rooms.length
    ? l.pg.rooms.map((r, i) => ({
        key: i,
        occupancy: String(r.occupancy),
        rentPerBed: str(r.rent_per_bed),
        depositAmount: str(r.deposit_amount),
        bedsAvailable: str(r.beds_available),
        hasAc: Boolean(r.has_ac),
        attachedBathroom: Boolean(r.attached_bathroom),
      }))
    : [{ key: 0, occupancy: "double", rentPerBed: "", depositAmount: "", bedsAvailable: "", hasAc: false, attachedBathroom: false }];
}

// ── Location ─────────────────────────────────────────────────────────────────

export function locationValues(l: WorkspaceListing): Values {
  const loc = l.location;
  return {
    localityId: loc.localityId,
    line1: loc.line1 ?? "",
    line2: loc.line2 ?? "",
    landmark: loc.landmark ?? "",
    postalCode: loc.postalCode ?? "",
    // A pin at the locality's centre means none was given.
    mapLink: loc.pinExact ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : "",
  };
}

// ── Amenities ────────────────────────────────────────────────────────────────

export const AMENITY_GROUPS: Record<string, string> = { building: "Building", unit: "Inside the property", safety: "Safety & security", pg: "PG services" };
export const RELEVANT_AMENITIES: Record<string, string[]> = {
  residential: ["building", "unit", "safety"],
  commercial: ["building", "safety"],
  land: ["safety"],
  co_living: ["pg", "unit", "safety", "building"],
};

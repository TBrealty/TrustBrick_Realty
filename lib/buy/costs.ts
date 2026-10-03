/**
 * What buying a home costs on top of its price, for the cities Trustbrick covers.
 * Pure functions and one rates table, shared by server and client.
 *
 * Rates are set by each state and change by notification. They were checked against
 * several published sources in September 2026 (RATES_CHECKED); review them whenever a
 * state revises its rates, and before launch with a legal adviser. The page says they are
 * indicative and to confirm with the Sub-Registrar.
 */

export const RATES_CHECKED = "September 2026";

export type Buyer = "man" | "woman";

type Slab = { upTo: number; rate: number };
type Place = {
  city: string;
  state: string;
  /** Where buyers confirm the final figure. */
  confirmWith: string;
  /** Stamp duty as a share of the property value, by price slab and buyer. */
  stampDuty: (value: number, buyer: Buyer) => number;
  stampDutyNote: string;
  /** Duties charged as a share of the stamp duty itself (Karnataka's cess and surcharge). */
  onStampDuty?: { label: string; rate: number }[];
  /** Further duties on the property value (Telangana's transfer duty). */
  extraDuties?: { label: string; rate: number }[];
  registration: { rate: number; cap?: number; note?: string };
  /** A rate that published sources don't agree on: shown to the buyer, and the higher figure used. */
  uncertain?: string;
};

const slab = (slabs: Slab[], value: number) => (slabs.find((s) => value <= s.upTo) ?? slabs[slabs.length - 1]).rate;
const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

export const PLACES: Record<string, Place> = {
  hyderabad: {
    city: "Hyderabad",
    state: "Telangana",
    confirmWith: "the Sub-Registrar or the IGRS Telangana portal",
    stampDuty: () => 0.04,
    stampDutyNote: "4% within urban limits. The same for every buyer.",
    extraDuties: [{ label: "Transfer duty", rate: 0.015 }],
    registration: { rate: 0.005 },
  },
  bengaluru: {
    city: "Bengaluru",
    state: "Karnataka",
    confirmWith: "the Sub-Registrar or the Kaveri portal",
    stampDuty: (v) => slab([{ upTo: 20 * LAKH, rate: 0.02 }, { upTo: 45 * LAKH, rate: 0.03 }, { upTo: Infinity, rate: 0.05 }], v),
    stampDutyNote: "2% up to ₹20 L, 3% up to ₹45 L, 5% above. The same for every buyer.",
    onStampDuty: [
      { label: "Cess", rate: 0.1 },
      { label: "Surcharge (urban)", rate: 0.02 },
    ],
    registration: { rate: 0.02, note: "Raised from 1% to 2% in August 2025." },
  },
  mumbai: {
    city: "Mumbai",
    state: "Maharashtra",
    confirmWith: "the Sub-Registrar or IGR Maharashtra",
    stampDuty: (_v, buyer) => (buyer === "woman" ? 0.05 : 0.06),
    stampDutyNote: "6%, including 1% metro cess. 5% for a woman buying in her sole name.",
    registration: { rate: 0.01, cap: 30_000, note: "1%, capped at ₹30,000." },
  },
  pune: {
    city: "Pune",
    state: "Maharashtra",
    confirmWith: "the Sub-Registrar or IGR Maharashtra",
    stampDuty: (_v, buyer) => (buyer === "woman" ? 0.06 : 0.07),
    stampDutyNote: "7% within municipal limits, including metro cess and local body tax. 6% for a woman buying in her sole name.",
    registration: { rate: 0.01, cap: 30_000, note: "1%, capped at ₹30,000." },
  },
  north_goa: {
    city: "North Goa",
    state: "Goa",
    confirmWith: "the Sub-Registrar (Goa's NGDRS registration system)",
    stampDuty: (v) =>
      slab(
        [
          { upTo: 50 * LAKH, rate: 0.035 },
          { upTo: 75 * LAKH, rate: 0.04 },
          { upTo: 1 * CRORE, rate: 0.045 },
          { upTo: 5 * CRORE, rate: 0.05 },
          { upTo: Infinity, rate: 0.06 },
        ],
        v,
      ),
    stampDutyNote: "3.5% up to ₹50 L, rising in slabs to 6% above ₹5 Cr. The same for every buyer.",
    registration: { rate: 0.03 },
    uncertain: "Published sources disagree on Goa's registration fee (from 0.5% to 3.5%). We use 3% so the estimate errs on the high side.",
  },
};

export const PLACE_OPTIONS = Object.entries(PLACES).map(([key, p]) => ({ key, label: `${p.city}, ${p.state}` }));

/** A listing's city, by name or slug, as a key into PLACES. */
export function placeFor(city: string | null | undefined): string | undefined {
  if (!city) return undefined;
  const slug = city.trim().toLowerCase().replace(/\s+/g, "_");
  return slug in PLACES ? slug : undefined;
}

export type CostInput = {
  price: number;
  place: string;
  buyer: Buyer;
  underConstruction: boolean;
  /** Qualifies as affordable housing for GST: up to ₹45 L, and a small carpet area. */
  affordable: boolean;
  brokeragePct: number;
  paperwork: number;
};

export type CostLine = { key: string; label: string; basis: string; amount: number; group: "government" | "other" };

export type CostBreakdown = {
  lines: CostLine[];
  government: number;
  other: number;
  total: number;
  allIn: number;
  /** TDS on buying property (s.194-IA of the 1961 Act, s.393 of the Income-tax Act, 2025): at ₹50 lakh and above the buyer deducts 1% from the payment to the seller. */
  tds: number | null;
  place: Place;
};

const pct = (rate: number) => `${+(rate * 100).toFixed(2)}%`;

export const AFFORDABLE_LIMIT = 45 * LAKH;

export function buyingCosts(input: CostInput): CostBreakdown {
  const place = PLACES[input.place] ?? PLACES.hyderabad;
  const price = Math.max(0, input.price);
  const lines: CostLine[] = [];

  const dutyRate = place.stampDuty(price, input.buyer);
  const duty = price * dutyRate;
  lines.push({ key: "stamp", label: "Stamp duty", basis: `${pct(dutyRate)} of the price`, amount: duty, group: "government" });
  for (const d of place.onStampDuty ?? []) {
    lines.push({ key: d.label, label: d.label, basis: `${pct(d.rate)} of the stamp duty`, amount: duty * d.rate, group: "government" });
  }
  for (const d of place.extraDuties ?? []) {
    lines.push({ key: d.label, label: d.label, basis: `${pct(d.rate)} of the price`, amount: price * d.rate, group: "government" });
  }
  const registration = Math.min(price * place.registration.rate, place.registration.cap ?? Infinity);
  lines.push({
    key: "registration",
    label: "Registration fee",
    basis: place.registration.cap ? `${pct(place.registration.rate)}, up to ₹${place.registration.cap.toLocaleString("en-IN")}` : `${pct(place.registration.rate)} of the price`,
    amount: registration,
    group: "government",
  });

  if (input.underConstruction) {
    // Effective rates, after the deemed one-third for land. Not charged on a ready home with a completion certificate.
    const affordable = input.affordable && price <= AFFORDABLE_LIMIT;
    const rate = affordable ? 0.01 : 0.05;
    lines.push({ key: "gst", label: "GST", basis: `${pct(rate)}, under construction${affordable ? ", affordable housing" : ""}`, amount: price * rate, group: "government" });
  }

  if (input.brokeragePct > 0) {
    lines.push({ key: "brokerage", label: "Brokerage", basis: `${pct(input.brokeragePct / 100)} of the price, your estimate`, amount: (price * input.brokeragePct) / 100, group: "other" });
  }
  if (input.paperwork > 0) {
    lines.push({ key: "paperwork", label: "Lawyer and paperwork", basis: "Your estimate", amount: input.paperwork, group: "other" });
  }

  const government = lines.filter((l) => l.group === "government").reduce((a, l) => a + l.amount, 0);
  const other = lines.filter((l) => l.group === "other").reduce((a, l) => a + l.amount, 0);
  return {
    lines,
    government,
    other,
    total: government + other,
    allIn: price + government + other,
    tds: price >= 50 * LAKH ? price * 0.01 : null,
    place,
  };
}

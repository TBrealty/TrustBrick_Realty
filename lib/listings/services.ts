/**
 * Dedicated service pages. A service with a shell here gets its own header (its sections,
 * never the other services), its own footer, and quick searches on its browse page; every
 * page inside it — results and listings — stays in it. The home page is where people
 * choose a service; the only way across is the footer's "Other services" row.
 *
 * Every service has one. Adding a service is adding an entry to SERVICE_SHELLS.
 * Shared by server and client code.
 */
import { type ListingFilters, type ListingKind, KIND_META, LISTING_KINDS, PLOT_TYPE_CODES, isPlotType } from "./filters";

export type ServiceLink = { key: string; label: string; href: string };

/** The listing services, and Legal Verification, which is a service without listings. */
export type ServiceKind = ListingKind | "legal";

export type ServiceShell = {
  kind: ServiceKind;
  label: string;
  /** The service's own sections, in its header and footer. */
  sections: ServiceLink[];
  /** Its tools and guides, after the sections. */
  tools: ServiceLink[];
  /** Which section a result set belongs to, for the header's current marker. */
  sectionFor: (filters: ListingFilters) => string;
  /** Shortcuts on the browse page before anything is filtered, and in the footer. */
  quickSearches: ServiceLink[];
  /** The footer's heading for them. Defaults to "Popular searches". */
  quickSearchesLabel?: string;
  /** One line for the footer, under the service's name. */
  strapline: string;
};

const plots = PLOT_TYPE_CODES.map((t) => `type=${t}`).join("&");

export const SERVICE_SHELLS: Partial<Record<ListingKind, ServiceShell>> = {
  buy: {
    kind: "buy",
    label: "Buy",
    sections: [
      { key: "all", label: "All properties", href: "/buy" },
      { key: "ready", label: "Ready to move", href: "/buy?status=ready" },
      { key: "new", label: "New launches", href: "/buy?status=under_construction" },
      { key: "plots", label: "Plots", href: `/buy?${plots}` },
    ],
    tools: [
      { key: "guide", label: "Buying guide", href: "/buy/guide" },
      { key: "emi", label: "EMI calculator", href: "/buy/emi-calculator" },
      { key: "costs", label: "Buying costs", href: "/buy/costs" },
    ],
    sectionFor: (f) => {
      if (f.types.length > 0 && f.types.every(isPlotType)) return "plots";
      if (f.status === "under_construction") return "new";
      if (f.status === "ready") return "ready";
      return "all";
    },
    quickSearches: [
      { key: "under-50l", label: "Under ₹50 L", href: "/buy?max=5000000" },
      { key: "50l-1cr", label: "₹50 L – ₹1 Cr", href: "/buy?min=5000000&max=10000000" },
      { key: "1-2cr", label: "₹1 – 2 Cr", href: "/buy?min=10000000&max=20000000" },
      { key: "2cr-plus", label: "Above ₹2 Cr", href: "/buy?min=20000000" },
      { key: "2bhk", label: "2 BHK", href: "/buy?bhk=2" },
      { key: "3bhk", label: "3 BHK", href: "/buy?bhk=3" },
      { key: "villas", label: "Villas", href: "/buy?type=villa" },
      { key: "small-plots", label: "Plots up to 200 sq yd", href: `/buy?${plots}&sqyd_max=200` },
    ],
    strapline: "Homes and plots for sale, with the paperwork and the neighbourhood in view.",
  },

  rent: {
    kind: "rent",
    label: "Rent",
    sections: [
      { key: "all", label: "All rentals", href: "/rent" },
      { key: "now", label: "Available now", href: "/rent?available_now=1" },
      { key: "furnished", label: "Furnished", href: "/rent?furnishing=furnished" },
      { key: "apartments", label: "Apartments", href: "/rent?type=apartment" },
      { key: "houses", label: "Houses and villas", href: "/rent?type=independent_house&type=villa" },
    ],
    tools: [
      { key: "guide", label: "Renting guide", href: "/rent/guide" },
      { key: "move-in", label: "Move-in costs", href: "/rent/move-in-costs" },
    ],
    sectionFor: (f) => {
      if (f.availableNow) return "now";
      if (f.furnishing.length === 1 && f.furnishing[0] === "furnished") return "furnished";
      if (f.types.length === 1 && f.types[0] === "apartment") return "apartments";
      if (f.types.length > 0 && f.types.every((t) => t === "independent_house" || t === "villa")) return "houses";
      return "all";
    },
    quickSearches: [
      { key: "under-15k", label: "Under ₹15,000", href: "/rent?max=15000" },
      { key: "15-30k", label: "₹15,000 – 30,000", href: "/rent?min=15000&max=30000" },
      { key: "30-50k", label: "₹30,000 – 50,000", href: "/rent?min=30000&max=50000" },
      { key: "50k-plus", label: "Above ₹50,000", href: "/rent?min=50000" },
      { key: "1bhk", label: "1 BHK", href: "/rent?bhk=1" },
      { key: "2bhk", label: "2 BHK", href: "/rent?bhk=2" },
      { key: "3bhk", label: "3 BHK", href: "/rent?bhk=3" },
      { key: "semi", label: "Semi-furnished", href: "/rent?furnishing=semi_furnished" },
    ],
    strapline: "Homes to rent from agents Trustbrick has checked, with the deposit and the terms up front.",
  },

  pg: {
    kind: "pg",
    label: "PGs",
    sections: [
      { key: "all", label: "All PGs", href: "/pg" },
      { key: "men", label: "For men", href: "/pg?gender=men" },
      { key: "women", label: "For women", href: "/pg?gender=women" },
      { key: "any", label: "Co-living", href: "/pg?gender=any" },
    ],
    tools: [
      { key: "checklist", label: "PG checklist", href: "/pg/checklist" },
      { key: "compare", label: "PG or shared flat?", href: "/pg/compare" },
    ],
    sectionFor: (f) => f.gender ?? "all",
    quickSearches: [
      { key: "under-7500", label: "Under ₹7,500 a bed", href: "/pg?max=7500" },
      { key: "under-12500", label: "Under ₹12,500 a bed", href: "/pg?max=12500" },
      { key: "single", label: "Single rooms", href: "/pg?occupancy=single" },
      { key: "meals", label: "Meals included", href: "/pg?meals=1" },
      { key: "veg", label: "Vegetarian food", href: "/pg?food=veg" },
      { key: "ac", label: "AC rooms", href: "/pg?ac=1" },
      { key: "attached", label: "Attached bathroom", href: "/pg?attached=1" },
    ],
    strapline: "Paying-guest rooms and co-living, priced per bed, with food and house rules in plain view.",
  },

  stay: {
    kind: "stay",
    label: "Home Stay",
    sections: [
      { key: "all", label: "All home stays", href: "/stays" },
      { key: "entire", label: "Entire homes", href: "/stays?space=entire_home" },
      { key: "room", label: "Private rooms", href: "/stays?space=private_room" },
      { key: "instant", label: "Instant book", href: "/stays?instant=1" },
    ],
    tools: [
      { key: "guide", label: "Stay guide", href: "/stays/guide" },
      { key: "split", label: "Split the cost", href: "/stays/split-cost" },
      { key: "trips", label: "Your trips", href: "/account/trips" },
      { key: "messages", label: "Messages", href: "/account/messages" },
      { key: "host", label: "Host your home", href: "/become-a-host" },
    ],
    sectionFor: (f) => {
      if (f.instantBook && !f.spaceType) return "instant";
      if (f.spaceType === "entire_home") return "entire";
      if (f.spaceType === "private_room") return "room";
      return "all";
    },
    quickSearches: [
      { key: "under-2500", label: "Under ₹2,500 a night", href: "/stays?max=2500" },
      { key: "2500-6000", label: "₹2,500 – 6,000 a night", href: "/stays?min=2500&max=6000" },
      { key: "goa", label: "In Goa", href: "/stays?city=north_goa" },
      { key: "family", label: "For 4 or more", href: "/stays?guests=4" },
      { key: "pets", label: "Pets welcome", href: "/stays?pets=1" },
      { key: "instant", label: "Book instantly", href: "/stays?instant=1" },
    ],
    strapline: "Whole homes and private rooms by the night, from hosts Trustbrick has checked.",
  },

  invest: {
    kind: "invest",
    label: "Invest",
    sections: [
      { key: "all", label: "All investments", href: "/invest" },
      { key: "new", label: "New launches", href: "/invest?category=new_launch" },
      { key: "commercial", label: "Commercial", href: "/invest?category=commercial" },
      { key: "land", label: "Plots and land", href: "/invest?category=land" },
    ],
    tools: [
      { key: "yield", label: "Yield calculator", href: "/invest/yield-calculator" },
      { key: "guide", label: "Investing guide", href: "/invest/guide" },
    ],
    sectionFor: (f) => (f.category.length === 1 ? ({ new_launch: "new", commercial: "commercial", land: "land" } as Record<string, string>)[f.category[0]] ?? "all" : "all"),
    quickSearches: [
      { key: "yield-5", label: "Yield 5% or more", href: "/invest?min_yield=5" },
      { key: "yield-7", label: "Yield 7% or more", href: "/invest?min_yield=7" },
      { key: "possession-2027", label: "Possession by 2027", href: "/invest?possession_by=2027" },
      { key: "under-1cr", label: "Under ₹1 Cr", href: "/invest?max=10000000" },
      { key: "offices", label: "Offices", href: "/invest?type=office" },
      { key: "shops", label: "Shops", href: "/invest?type=retail" },
    ],
    strapline: "New launches, commercial space and land, with declared yields and possession dates, never our guesses.",
  },
};

/** Legal Verification: an advocate's check of a property's papers, applied for online. */
export const LEGAL_SHELL: ServiceShell = {
  kind: "legal",
  label: "Legal Verification",
  sections: [
    { key: "overview", label: "Overview", href: "/legal-verification" },
    { key: "apply", label: "Apply", href: "/legal-verification/apply" },
    { key: "requests", label: "Your requests", href: "/legal-verification/requests" },
  ],
  tools: [{ key: "documents", label: "Documents guide", href: "/legal-verification/documents" }],
  sectionFor: () => "overview",
  quickSearches: [
    { key: "document_check", label: "Document verification", href: "/legal-verification/apply?service=document_check" },
    { key: "title_opinion", label: "Title search and legal opinion", href: "/legal-verification/apply?service=title_opinion" },
    { key: "full_due_diligence", label: "Complete due diligence", href: "/legal-verification/apply?service=full_due_diligence" },
    { key: "agreement_review", label: "Agreement review", href: "/legal-verification/apply?service=agreement_review" },
  ],
  quickSearchesLabel: "Services",
  strapline: "Legal opinions and document verification by independent advocates, before you sign or pay.",
};

export const LEGAL_SERVICE_LINK: ServiceLink = { key: "legal", label: "Legal Verification", href: "/legal-verification" };

export const shellFor = (kind: ListingKind): ServiceShell | undefined => SERVICE_SHELLS[kind];

/** The footer's only way across: every other service, Legal Verification last. */
export const otherServices = (kind: ServiceKind): ServiceLink[] => [
  ...LISTING_KINDS.filter((k) => k !== kind).map((k) => ({ key: k, label: KIND_META[k].navLabel, href: KIND_META[k].path })),
  ...(kind === "legal" ? [] : [LEGAL_SERVICE_LINK]),
];

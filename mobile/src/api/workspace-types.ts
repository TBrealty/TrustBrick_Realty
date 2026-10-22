/**
 * Shapes of the partner workspace endpoints (app/api/v1/partner/…). They mirror the website's
 * services (lib/services/*), which the app can't import from (they're server code).
 */
import type { Page } from "@/api/types";
import type { EffectiveState, PlanView } from "@/lib/subscriptions/terms";

export type Purpose = "sale" | "rent" | "lease" | "pg" | "stay";
export type Category = "residential" | "commercial" | "land" | "co_living";
type Row = Record<string, unknown>;

export type OnboardingOptions = {
  types: { code: string; name: string; category: Category; purposes: Purpose[] }[];
  cities: { id: string; name: string; state: string; localities: { id: string; name: string; lat: number; lng: number }[] }[];
  amenities: { code: string; name: string; category: string }[];
  /** What this person may list (hosts: homestays only). */
  purposes: Purpose[];
};

export type MediaItem = {
  id: string;
  kind: "photo" | "floor_plan" | "video" | "document" | "panorama" | "model_3d";
  mimeType: string;
  url: string;
  thumbnailUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  referenceId: string | null;
  originalFilename: string | null;
  sortOrder: number;
};

export type WorkspaceListing = {
  id: string;
  referenceId: string;
  propertyId: string;
  propertyReferenceId: string;
  status: string;
  statusReason: string | null;
  purpose: Purpose;
  title: string;
  description: string | null;
  isSample: boolean;
  type: { code: string; name: string; category: Category };
  organization: { id: string; name: string; referenceId: string };
  agent: { userId: string; name: string; referenceId: string | null; email: string } | null;
  location: {
    localityId: string;
    locality: string;
    cityId: string | null;
    city: string | null;
    line1: string | null;
    line2: string | null;
    landmark: string | null;
    postalCode: string | null;
    unitNumber: string | null;
    latitude: number;
    longitude: number;
    pinExact: boolean;
  };
  property: {
    lifecycleStatus: string;
    ownershipType: string | null;
    yearBuilt: number | null;
    carpetAreaSqft: number | null;
    builtUpAreaSqft: number | null;
    superBuiltUpAreaSqft: number | null;
    floorNumber: number | null;
    totalFloors: number | null;
    verificationStatus: string;
  };
  residential: Row | null;
  commercial: Row | null;
  land: Row | null;
  pg: { attributes: Row | null; terms: Row | null; rooms: Row[] };
  stay: {
    spaceType: string;
    maxGuests: number;
    beds: number;
    minNights: number;
    maxNights: number;
    checkInTime: string;
    checkOutTime: string;
    instantBook: boolean;
    cancellationPolicy: string;
    petsAllowed: boolean;
    smokingAllowed: boolean;
    eventsAllowed: boolean;
    houseRules: string | null;
    weekendPrice: number | null;
    cleaningFee: number | null;
  } | null;
  pricing: {
    price: number | null;
    priceNegotiable: boolean;
    depositAmount: number | null;
    maintenanceAmount: number | null;
    declaredMonthlyRent: number | null;
    availableFrom: string | null;
    leaseDurationMonths: number | null;
    brokerageType: string | null;
    brokerageValue: number | null;
    brokerageNegotiable: boolean;
    reraId: string | null;
  };
  amenities: string[];
  amenityNames: string[];
  customAmenities: string[];
  tourUrl: string | null;
  tourHidden: { at: string; reason: string | null } | null;
  media: MediaItem[];
  history: { fromStatus: string | null; toStatus: string; action: string; reason: string | null; actorName: string | null; createdAt: string }[];
  stats: { views: number; uniqueViewers: number; leads: number; saves: number; visits: number };
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
};

export type ListingCard = {
  priceLabel: string;
  publicUrl: string | null;
  sections: { title: string; facts: [string, string | null][] }[];
  amenities: string[];
  rooms: { id: string; label: string; rentPerBed: number; deposit: string | null; bedsAvailable: number }[];
  offer: { title: string; details: string | null; validUntil: string | null; active: boolean } | null;
  priceHistory: { price: string; from: string; to: string | null }[];
  history: { label: string; reason: string | null; actor: string | null; at: string }[];
  terms: {
    price: number | null;
    priceNegotiable: boolean;
    depositAmount: number | null;
    maintenanceAmount: number | null;
    availableFrom: string | null;
    offerTitle: string | null;
    offerDetails: string | null;
    offerValidUntil: string | null;
    weekendPrice: number | null;
    cleaningFee: number | null;
    minNights: number | null;
    maxNights: number | null;
    instantBook: boolean;
  };
};

export type Gap = { section: "location" | "details" | "pricing" | "media" | "commission"; message: string };
export type ListingActionView = { action: string; label: string; confirm: string | null; reasonRequired: boolean };
export type DealContext = { purpose: "sale" | "rent" | "lease"; price: number | null; suggestedBrokerage: number | null; rate: { basis: "brokerage" | "deal_value"; percent: number }; gstPercent: number };

export type ListingWorkspace = {
  listing: WorkspaceListing;
  card: ListingCard;
  gaps: Gap[];
  actions: ListingActionView[];
  deal: DealContext | null;
  statusLabel: string;
  purposeLabel: string;
  categoryLabel: string;
  editable: boolean;
  quickEdit: boolean;
};

export type ListingsPage = Page<{
  id: string;
  referenceId: string;
  title: string;
  purpose: Purpose;
  typeName: string;
  category: Category;
  status: string;
  statusLabel: string;
  statusReason: string | null;
  isSample: boolean;
  agentName: string | null;
  price: number | null;
  locality: string;
  city: string | null;
  image: string | null;
  views: number;
  leads: number;
  updatedAt: string;
  tour: { rooms: number; model: boolean; link: string | null; hidden: boolean; reviewCase: string | null } | null;
}> & { counts: Record<string, number> };

type Comparison = { current: number; previous: number };
export type Dashboard = {
  range: { key: string; label: string; previous: string };
  listings: { total: number; live: number; pending: number; drafts: number; changesRequested: number; rejected: number; archived: number; addedThisMonth: number };
  leads: { newInPeriod: Comparison; open: number; byStatus: { status: string; count: number }[]; convertedInPeriod: number };
  visits: { upcoming: number; requested: number; completedInPeriod: number };
  engagement: { views: Comparison; uniqueViewers: number; saves: number };
  series: { views: { bucket: string; count: number }[]; leads: { bucket: string; count: number }[] };
  needsAttention: { referenceId: string; title: string; status: string; reason: string | null }[];
  topListings: { referenceId: string; title: string; views: number; leads: number }[];
};

export type Performance = { range: { key: string; label: string }; rows: { referenceId: string; title: string; status: string; views: number; uniqueViewers: number; leads: number; visits: number; saves: number }[] };

export type ContactRow = { referenceId: string; name: string; email: string | null; phone: string | null; leads: number; lastActivityAt: string | null; createdAt: string };

export type CalendarDay = {
  date: string;
  price: number;
  special: boolean;
  blocked: { id: string; reason: string | null } | null;
  booking: { referenceId: string; status: string; guestName: string; isStart: boolean } | null;
  requests: number;
  past: boolean;
};
export type CalendarMonth = {
  listing: { referenceId: string; title: string; status: string; price: number; weekendPrice: number | null };
  month: string;
  days: CalendarDay[];
  blocks: { id: string; from: string; to: string; reason: string | null }[];
  rates: { id: string; from: string; to: string; price: number; note: string | null }[];
  canEdit: boolean;
};

export type CommissionService = "sale" | "rent" | "lease" | "pg" | "stay";
export type LedgerRow = {
  referenceId: string;
  kind: "charge" | "adjustment";
  service: CommissionService;
  description: string;
  listing: { referenceId: string; title: string } | null;
  bookingReferenceId: string | null;
  dealValue: number | null;
  brokerage: number | null;
  ratePercent: number | null;
  amount: number;
  gstAmount: number;
  total: number;
  status: string;
  paymentReference: string | null;
  createdAt: string;
  overdue: boolean;
};
export type Commission = {
  rates: Record<CommissionService, { basis: "brokerage" | "deal_value"; percent: number; custom: boolean; defaultPercent: number }>;
  gstPercent: number;
  ledger: Page<LedgerRow> & { totals?: Record<string, number> };
  acceptance: { accepted: boolean; outdated: boolean; acceptedAt: string | null; acceptedBy: string | null };
  mayAccept: boolean;
  services: CommissionService[];
};

export type PartnerSubscription = {
  overview: {
    subscription: {
      referenceId: string;
      state: EffectiveState;
      entitled: boolean;
      plan: PlanView;
      billingCycle: "monthly" | "yearly";
      price: number;
      trialEndsAt: string | null;
      trialDaysLeft: number | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      statusReason: string | null;
    } | null;
    plans: PlanView[];
    trialAvailable: boolean;
    entitledPlan: PlanView;
  };
  plans: PlanView[];
  history: { action: string; amount: number | null; paymentReference: string | null; note: string | null; at: string }[];
  canManage: boolean;
};

export type AgentRow = {
  referenceId: string;
  userReferenceId: string;
  name: string;
  email: string;
  phone: string;
  organization: string | null;
  status: string;
  verificationStatus: string;
  listings: number;
  leads: number;
  createdAt: string;
  lastActiveAt: string | null;
};
export type AgentDetail = AgentRow & {
  reraAgentNumber: string | null;
  experienceYears: number | null;
  bio: string | null;
  city: string | null;
  counts: { visits: number; activeListings: number; pendingListings: number };
  recentListings: { referenceId: string; title: string; status: string; updatedAt: string }[];
};

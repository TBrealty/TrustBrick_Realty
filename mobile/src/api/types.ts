import type { ListingSummary } from "@/lib/listings/types";
import type { EffectiveState, PlanView } from "@/lib/subscriptions/terms";
import type { TourData, TourSummary } from "@/lib/tours/terms";
import type { LeadStatus, VisitStatus } from "@/lib/crm/terms";
import type { BookingAction } from "@/lib/stays/booking-lifecycle";
import type { BookingStatus } from "@/lib/vocab";

/**
 * What /api/v1 returns, as the screens use it. Shapes shared with the website (listings, plans,
 * tours) come from the website's own types in ../lib, so they can't drift apart.
 */

export type { ListingSummary, PlanView, TourData, TourSummary };

export type Me = {
  user: { referenceId: string; name: string; email: string };
  workspaces: { membershipId: string; kind: "platform" | "professional"; roles: string[]; organization: { referenceId: string; name: string; type: string } }[];
  activeWorkspace: string | null;
  plan: {
    code: string;
    name: string;
    features: string[];
    subscription: { referenceId: string; state: EffectiveState; planName: string; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
    trialAvailable: boolean;
  };
  unreadNotifications: number;
  unreadMessages: number;
};

export type SignInResult = { token: string; expiresAt: string; user: Me["user"] };

export type SearchItem = ListingSummary & { saved: boolean };
export type SearchResult = { items: SearchItem[]; total: number; nextCursor: string | null };

export type BrowseOptions = {
  cities: { slug: string; name: string; localities: { slug: string; name: string }[] }[];
  types: { code: string; name: string }[];
  amenities: { code: string; name: string }[];
};

export type StayView = {
  spaceType: "entire_home" | "private_room";
  maxGuests: number;
  beds: number;
  weekendPrice: number | null;
  cleaningFee: number | null;
  minNights: number;
  maxNights: number;
  checkInTime: string;
  checkOutTime: string;
  instantBook: boolean;
  cancellationPolicy: "flexible" | "moderate" | "strict";
  petsAllowed: boolean;
  smokingAllowed: boolean;
  eventsAllowed: boolean;
  houseRules: string | null;
  host: { name: string; referenceId: string | null; verified: boolean; since: string; languages: string[]; about: string | null } | null;
  /** Booked by paying online (POST /listings/{ref}/checkout); false: paid to the host at the property. */
  payOnline?: boolean;
  /** False while the host isn't set up to be paid online. */
  takingBookings?: boolean;
};

export type ListingDetail = ListingSummary & {
  description: string | null;
  maintenanceAmount: number | null;
  reraId: string | null;
  organizationName: string;
  builtUpAreaSqft: number | null;
  superBuiltUpAreaSqft: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  balconies: number | null;
  facing: string | null;
  coveredParking: number | null;
  postalCode: string | null;
  pg: {
    totalRooms: number;
    totalBeds: number;
    noticePeriodDays: number | null;
    lockInMonths: number | null;
    entryCurfew: string | null;
    visitorsAllowed: boolean;
    rooms: { occupancy: string; rentPerBed: number; depositAmount: number | null; bedsAvailable: number; hasAc: boolean; attachedBathroom: boolean }[];
  } | null;
  amenities: { code: string; name: string }[];
  images: { key: string; alt: string | null }[];
  stay: StayView | null;
  saved: boolean;
  tourAccess: "open" | "plus_required" | "sign_in_required" | null;
  contact: { agentName: string; organization: string | null; agentVerified: boolean; hasOpenEnquiry: boolean; isOwn: boolean } | null;
};

export type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };

export type Quote =
  | { ok: true; checkIn: string; checkOut: string; nights: number; nightly: { date: string; price: number }[]; subtotal: number; cleaningFee: number; total: number; instantBook: boolean }
  | { ok: false; message: string; field?: string };

export type Trip = {
  referenceId: string;
  status: BookingStatus;
  statusLabel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  pets: boolean;
  total: number;
  listing: { referenceId: string; title: string; locality: string; city: string | null };
  hostName: string;
  expiresAt: string | null;
  createdAt: string;
};

export type TripDetail = Trip & {
  subtotal: number;
  cleaningFee: number;
  nightly: { date: string; price: number }[];
  guestMessage: string | null;
  statusReason: string | null;
  cancellationPolicy: { code: string; label: string; rule: string };
  checkInTime: string;
  checkOutTime: string;
  events: { from: string | null; to: string; label: string; note: string | null; actorRole: string; at: string }[];
  address: { line1: string | null; line2: string | null; landmark: string | null; unit: string | null; postalCode: string | null; latitude: number; longitude: number } | null;
  hostPhone: string | null;
  canCancel: boolean;
  freeCancellation: boolean;
} & Partial<TripMoney>;

export type ChatMessage = { seq: number; body: string; mine: boolean; senderName: string; createdAt: string };

export type Conversation = {
  referenceId: string | null;
  listing: { referenceId: string; title: string; place: string; image: string | null };
  counterpart: { name: string; fullName: string; verified: boolean };
  bookings: { referenceId: string; checkIn: string; checkOut: string; status: BookingStatus; statusLabel: string }[];
  messages: ChatMessage[];
  hasEarlier: boolean;
  seenUpTo: number;
  canSend: boolean;
  closedReason: string | null;
};

export type ConversationSummary = {
  referenceId: string;
  listing: { referenceId: string; title: string; place: string; image: string | null };
  counterpartName: string;
  last: { body: string; mine: boolean; at: string } | null;
  unread: number;
};

export type SubscriptionOverview = {
  subscription: { referenceId: string; state: EffectiveState; plan: PlanView; billingCycle: "monthly" | "yearly"; trialEndsAt: string | null; currentPeriodEnd: string | null } | null;
  plans: PlanView[];
  trialAvailable: boolean;
  entitledPlan: PlanView;
};

// ── Partner mode ──────────────────────────────────────────────────────────────

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type LeadRow = {
  referenceId: string;
  status: LeadStatus;
  source: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  listingReferenceId: string | null;
  listingTitle: string | null;
  agentName: string | null;
  organization: string;
  createdAt: string;
  lastActivityAt: string;
};

export type VisitRow = {
  referenceId: string;
  status: VisitStatus;
  requestedFor: string | null;
  scheduledAt: string | null;
  notes: string | null;
  listingReferenceId: string | null;
  listingTitle: string | null;
  leadReferenceId: string | null;
  contactName: string | null;
  agentName: string | null;
  createdAt: string;
};

export type LeadDetail = LeadRow & {
  message: string | null;
  lostReason: string | null;
  activities: { type: string; body: string | null; fromStatus: string | null; toStatus: string | null; actorName: string | null; createdAt: string }[];
  visits: VisitRow[];
};

export type HostBooking = Trip & { guestName: string };

export type HostBookingDetail = HostBooking & {
  subtotal: number;
  cleaningFee: number;
  guestMessage: string | null;
  statusReason: string | null;
  cancellationPolicy: { code: string; label: string; rule: string };
  checkInTime: string;
  checkOutTime: string;
  guestContact: { phone: string; email: string } | null;
  events: { from: string | null; to: string; label: string; note: string | null; actorRole: string; at: string }[];
  actions: BookingAction[];
  /** Paid online: the guest's payment, commission and the payout. */
  money?: BookingMoney | null;
};

export type BookingGroup = "requests" | "upcoming" | "past" | "cancelled" | "all";

export type PartnerSummary = {
  workspace: { name: string; type: string; roles: string[] };
  leads: { new: number; open: number; latest: LeadRow[] } | null;
  visits: { upcoming: number; next: VisitRow[] } | null;
  bookings: { counts: Record<BookingGroup, number>; requests: HostBooking[] } | null;
  inbox: { unread: number } | null;
  listings: Record<string, number> | null;
  can: { onboard: boolean; performance: boolean; clients: boolean; team: boolean; commission: boolean; subscription: boolean; calendar: boolean };
};

export type PartnerListingRow = {
  id: string;
  referenceId: string;
  title: string;
  purpose: string;
  typeName: string;
  status: string;
  statusLabel: string;
  price: number | null;
  locality: string;
  city: string | null;
  image: string | null;
  views: number;
  leads: number;
  tour: { rooms: number; model: boolean; link: string | null; hidden: boolean; reviewCase: string | null } | null;
};

export type TourMode = "draft" | "live" | "locked" | "view";

export type PartnerListing = {
  referenceId: string;
  title: string;
  status: string;
  statusLabel: string;
  statusReason: string | null;
  purpose: string;
  price: string;
  place: string;
  cover: string | null;
  photos: number;
  stats: { views: number; uniqueViewers: number; leads: number; saves: number; visits: number };
  publicUrl: string | null;
  tour: {
    rooms: { id: string; name: string; url: string; thumbnailUrl: string | null }[];
    model: { id: string | null; url: string; name: string; sizeBytes: number | null } | null;
    link: { provider: string; url: string } | null;
    hidden: { at: string; reason: string | null } | null;
  };
  tourMode: TourMode;
  tourReviewWaiting: boolean;
  /** 360° photos taken with the guided camera that are still being made, or that failed. */
  captures: PartnerCapture[];
};

export type PartnerCapture = { id: string; roomName: string; status: "uploading" | "queued" | "stitching" | "done" | "failed"; error: string | null; shots: number; shotCount: number; createdAt: string };

// ── Online payments for stays (when switched on) ─────────────────────────────

export type PaymentCheckout = { kind: "redirect"; url: string } | { kind: "cashfree"; sessionId: string; mode: "sandbox" | "production" };

export type CheckoutStart = {
  bookingReferenceId: string;
  paymentReferenceId: string;
  amount: number;
  instantBook: boolean;
  holdExpiresAt: string | null;
  checkout: PaymentCheckout;
};

export type CheckoutStatus = {
  state: "confirming" | "booked" | "requested" | "failed" | "expired";
  paymentReferenceId: string;
  bookingReferenceId: string;
  listingReferenceId: string;
  title: string;
  amount: number;
  method: string | null;
  failureReason: string | null;
  holdExpiresAt: string | null;
  requestExpiresAt: string | null;
  checkIn: string;
  checkOut: string;
  hostName: string;
};

export type TripPayment = {
  referenceId: string;
  status: "authorized" | "captured" | "partially_refunded" | "refunded";
  amount: number;
  refunded: number;
  method: string | null;
  providerPaymentId: string | null;
  paidAt: string | null;
  refunds: { referenceId: string; amount: number; status: "pending" | "processed" | "failed"; reason: string; createdAt: string; processedAt: string | null }[];
  receipt: boolean;
};

export type TripMoney = {
  payment: TripPayment | null;
  cancel: { kind: "release" | "full" | "partial" | "none"; refund: number; kept: number; summary: string; cutoff: string } | null;
  timeline: { label: string; from: string | null; to: string | null; refundPercent: number }[];
  pendingPayment: { holdExpiresAt: string | null } | null;
};

export type Receipt = {
  receiptNumber: string;
  issuedAt: string;
  guest: { name: string; email: string; phone: string };
  booking: { referenceId: string; checkIn: string; checkOut: string; nights: number; guests: number; checkInTime: string; checkOutTime: string };
  stay: { title: string; address: string; hostName: string };
  lines: { label: string; amount: number }[];
  total: number;
  refunds: { referenceId: string; amount: number; status: string; at: string }[];
  netPaid: number;
  payment: { referenceId: string; method: string | null; providerPaymentId: string | null; provider: string; paidAt: string };
};

export type BookingMoney = {
  paid: number;
  refunded: number;
  kept: number;
  commissionPercent: number;
  commission: number;
  gstPercent: number;
  gst: number;
  youReceive: number;
  state: "held" | "paid";
  payout: { referenceId: string; status: PayoutStatus; releaseAt: string; paidAt: string | null; utr: string | null; holdReason: string | null } | null;
};

export type PayoutStatus = "scheduled" | "on_hold" | "processing" | "paid" | "failed" | "cancelled";

export type HostPayouts = {
  account: { method: "bank" | "upi"; holderName: string; bankName: string | null; accountLast4: string | null; ifsc: string | null; upiMasked: string | null; status: "pending" | "active" | "action_required" | "suspended"; statusReason: string | null; verifiedAt: string | null } | null;
  canManageAccount: boolean;
  online: boolean;
  totals: { receivedThisMonth: number; upcoming: number; onHold: number; upcomingCount: number };
  rows: {
    referenceId: string;
    booking: { referenceId: string; guestName: string; checkIn: string; checkOut: string; title: string; status: BookingStatus };
    gross: number;
    paid: number;
    refunded: number;
    commission: number;
    gst: number;
    amount: number;
    status: PayoutStatus;
    releaseAt: string;
    paidAt: string | null;
    utr: string | null;
    holdReason: string | null;
    failureReason: string | null;
  }[];
};

import type { PaymentCheckout } from "./types";

/** Rent collected online (/api/v1/rent, /api/v1/partner/landlord…): the shapes the server sends. */

export type TenancyStatus = "pending" | "disputed" | "active" | "ended" | "cancelled";

export type Tenancy = {
  referenceId: string;
  status: TenancyStatus;
  statusLabel: string;
  propertyReferenceId: string;
  listingReferenceId: string | null;
  title: string;
  address: string;
  landlordName: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  tenantAccepted: boolean;
  landlordConfirmed: boolean;
  monthlyRent: number;
  dueDay: number;
  deposit: number;
  startDate: string;
  endDate: string | null;
  firstDueDate: string | null;
  disputeNote: string | null;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
  agentName: string;
  createdAt: string;
};

export type Charge = {
  referenceId: string;
  dueDate: string;
  amount: number;
  status: "due" | "paid" | "cancelled";
  overdue: boolean;
  paidAt: string | null;
  payment: { referenceId: string; method: string | null; paidAt: string } | null;
};

export type TenantRent = { online: boolean; tenancies: (Tenancy & { charges: Charge[] })[] };

export type RentCheckoutStart = { paymentReferenceId: string; amount: number; checkout: PaymentCheckout };

export type RentPaymentStatus = {
  state: "confirming" | "paid" | "failed" | "returned";
  paymentReferenceId: string;
  chargeReferenceId: string;
  title: string;
  dueDate: string;
  amount: number;
  method: string | null;
  failureReason: string | null;
  landlordName: string;
};

export type RentReceipt = {
  paymentReferenceId: string;
  chargeReferenceId: string;
  tenancyReferenceId: string;
  amount: number;
  method: string | null;
  paidAt: string;
  dueDate: string;
  periodLabel: string;
  refunded: boolean;
  tenantName: string;
  landlordName: string;
  landlordPan: string | null;
  propertyTitle: string;
  propertyAddress: string;
};

export type LandlordLinkStatus = "awaiting_proof" | "under_review" | "approved" | "rejected" | "ended";

export type LandlordProperty = {
  linkId: string;
  propertyReferenceId: string;
  title: string;
  address: string;
  status: LandlordLinkStatus;
  statusLabel: string;
  reviewNote: string | null;
  proof: { kind: string; label: string; filename: string | null; uploadedAt: string } | null;
  agentName: string | null;
  since: string;
};

export type BankAccount = {
  method: "bank" | "upi";
  holderName: string;
  bankName: string | null;
  accountLast4: string | null;
  ifsc: string | null;
  upiMasked: string | null;
  status: "pending" | "verified" | "failed";
  statusReason: string | null;
  nameAtBank: string | null;
  verifiedAt: string | null;
  holdUntil: string | null;
  updatedAt: string;
};

export type RentTotals = { paidOut: number; waiting: number; onHold: number };

export type LandlordHome = {
  referenceId: string;
  name: string;
  email: string;
  panMasked: string | null;
  bank: BankAccount | null;
  requests: { referenceId: string; title: string; address: string; agentName: string; expiresAt: string }[];
  properties: LandlordProperty[];
  tenancies: Tenancy[];
  totals: RentTotals;
};

export type Settlement = {
  referenceId: string;
  paymentReferenceId: string;
  amount: number;
  status: "on_hold" | "ready" | "paid" | "failed" | "cancelled";
  statusLabel: string;
  holdReason: string | null;
  dueBy: string | null;
  paidAt: string | null;
  utr: string | null;
  paidTo: string | null;
  rentDue: string;
  tenantName: string;
  title: string;
  propertyReferenceId: string;
  createdAt: string;
};

export type LandlordPropertyDetail = { property: LandlordProperty; tenancy: Tenancy | null; charges: Charge[]; settlements: Settlement[] };

export type AgentRentPanel = {
  listing: { referenceId: string; title: string; price: number | null };
  landlord: {
    name: string;
    email: string;
    referenceId: string;
    status: LandlordLinkStatus;
    statusLabel: string;
    reviewNote: string | null;
    bank: "verified" | "pending" | "failed" | "missing";
    since: string;
  } | null;
  invitation: { referenceId: string; kind: "new" | "existing"; name: string; email: string; expiresAt: string; expired: boolean; sentAt: string } | null;
  tenancy: Tenancy | null;
  can: { invite: boolean; tenancy: boolean };
};

export type ShareLink = { url?: string | null; email?: string; referenceId?: string; landlordName?: string };

export const LINK_TONE: Record<LandlordLinkStatus, "warning" | "info" | "success" | "danger" | "neutral"> = {
  awaiting_proof: "warning",
  under_review: "info",
  approved: "success",
  rejected: "danger",
  ended: "neutral",
};

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
export const METHOD: Record<string, string> = { card: "card", upi: "UPI", netbanking: "net banking", wallet: "wallet" };

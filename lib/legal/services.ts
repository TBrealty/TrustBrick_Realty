/**
 * Legal verification: what Trustbrick offers, in words people use. Shared by the public page,
 * the application form and the admin queue. The codes are in lib/vocab.
 */
import type { LEGAL_DOCUMENTS, LEGAL_PROPERTY_TYPES, LEGAL_PURPOSES, LEGAL_STATES, LegalRequestStatus, LegalService } from "@/lib/vocab";

export type LegalServiceInfo = {
  label: string;
  summary: string;
  covers: string[];
  /** What you're handed at the end. */
  outcome: string;
  /** Usual time once the documents are with the advocate. */
  typical: string;
};

export const LEGAL_SERVICE_INFO: Record<LegalService, LegalServiceInfo> = {
  document_check: {
    label: "Document verification",
    summary: "An advocate reads the documents you already have and tells you what's missing, what doesn't match and what to ask the seller.",
    covers: ["Sale deed and previous deeds", "Encumbrance certificate", "Tax receipts, khata or mutation", "Approvals you have copies of"],
    outcome: "A written note of gaps and red flags",
    typical: "Usually 3 to 5 working days",
  },
  title_opinion: {
    label: "Title search and legal opinion",
    summary: "The advocate searches the records themselves, at the Sub-Registrar and the revenue office, and gives a signed opinion on whether the title is clear and marketable.",
    covers: ["Chain of title, usually 30 years", "Encumbrances and mortgages", "Revenue and municipal records", "Who must sign the sale"],
    outcome: "A title search report and signed legal opinion",
    typical: "Usually 7 to 12 working days",
  },
  full_due_diligence: {
    label: "Complete due diligence",
    summary: "The title opinion, plus the approvals, RERA, court cases and a public notice in the newspapers inviting anyone with a claim to come forward.",
    covers: ["Everything in the title opinion", "Building plan, occupancy or layout approval", "RERA registration and project records", "Litigation search and public notice"],
    outcome: "A full due-diligence report and signed opinion",
    typical: "Usually 2 to 3 weeks",
  },
  agreement_review: {
    label: "Agreement review",
    summary: "Before you sign: an advocate reviews the agreement for sale, builder–buyer or lease agreement, and marks the clauses to change.",
    covers: ["Price, payment schedule and possession", "Penalties, refunds and cancellation", "RERA model-agreement terms", "Suggested changes in writing"],
    outcome: "A marked-up agreement with comments",
    typical: "Usually 2 to 4 working days",
  },
};

export const LEGAL_PURPOSE_LABELS: Record<(typeof LEGAL_PURPOSES)[number], string> = {
  buying: "I'm buying it",
  home_loan: "I'm taking a loan against it",
  selling: "I'm selling it",
  inherited: "I've inherited it, or it's a family property",
  other: "Something else",
};

export const LEGAL_PROPERTY_LABELS: Record<(typeof LEGAL_PROPERTY_TYPES)[number], string> = {
  apartment: "Apartment or flat",
  house: "Independent house or villa",
  plot: "Plot",
  agricultural: "Agricultural land",
  commercial: "Office, shop or other commercial",
};

export const LEGAL_STATE_LABELS: Record<(typeof LEGAL_STATES)[number], string> = {
  telangana: "Telangana",
  karnataka: "Karnataka",
  maharashtra: "Maharashtra",
  goa: "Goa",
};

export const LEGAL_DOCUMENT_LABELS: Record<(typeof LEGAL_DOCUMENTS)[number], string> = {
  sale_deed: "Sale deed or title deed",
  link_documents: "Previous deeds (link or mother deeds)",
  encumbrance: "Encumbrance certificate",
  tax_receipts: "Property tax receipts",
  revenue_records: "Khata, mutation, 7/12, RTC or pattadar passbook",
  building_plan: "Approved building plan",
  occupancy: "Occupancy or completion certificate",
  rera: "RERA registration",
  layout_approval: "Layout approval or land conversion order",
  agreement_draft: "Draft agreement to review",
  society_noc: "Society or builder NOC",
};

export const LEGAL_STATUS_LABELS: Record<LegalRequestStatus, { label: string; forApplicant: string }> = {
  new: { label: "New", forApplicant: "Received. We'll call you to agree the scope and the fee." },
  contacted: { label: "Contacted", forApplicant: "We've been in touch about the scope and the fee." },
  in_progress: { label: "With the advocate", forApplicant: "The advocate is working on it." },
  completed: { label: "Completed", forApplicant: "Done. The report has been sent to you." },
  closed: { label: "Closed", forApplicant: "Closed without a report." },
};

/** Which status each can move to. A closed or completed request stays that way. */
export const LEGAL_TRANSITIONS: Record<LegalRequestStatus, LegalRequestStatus[]> = {
  new: ["contacted", "closed"],
  contacted: ["in_progress", "closed"],
  in_progress: ["completed", "closed"],
  completed: [],
  closed: [],
};

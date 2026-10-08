/**
 * Leads and visits, in rules and words. Plain TypeScript (no server code), shared by the website,
 * the services and the mobile app.
 */

export const LEAD_STATUSES = ["new", "contacted", "qualified", "visit_scheduled", "negotiation", "converted", "lost"] as const;
export const VISIT_STATUSES = ["requested", "scheduled", "completed", "cancelled", "no_show"] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  visit_scheduled: "Visit scheduled",
  negotiation: "Negotiation",
  converted: "Converted",
  lost: "Lost",
};

/** The pipeline. Converted is final; a lost lead can be reopened. */
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ["contacted", "qualified", "lost"],
  contacted: ["qualified", "visit_scheduled", "negotiation", "lost"],
  qualified: ["visit_scheduled", "negotiation", "lost"],
  visit_scheduled: ["qualified", "negotiation", "lost"],
  negotiation: ["converted", "lost", "visit_scheduled"],
  converted: [],
  lost: ["contacted"],
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** What can happen to a visit, and from which states. */
export const VISIT_ACTIONS = {
  schedule: { label: "Confirm a time", from: ["requested", "scheduled"], to: "scheduled" },
  complete: { label: "Mark visited", from: ["scheduled"], to: "completed" },
  no_show: { label: "Didn't come", from: ["scheduled"], to: "no_show" },
  cancel: { label: "Cancel visit", from: ["requested", "scheduled"], to: "cancelled" },
} as const satisfies Record<string, { label: string; from: readonly VisitStatus[]; to: VisitStatus }>;
export type VisitAction = keyof typeof VISIT_ACTIONS;

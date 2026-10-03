import { type Actor, can } from "@/lib/authz";
import type { Permission } from "@/lib/authz/catalog";
import type { ListingStatus } from "@/lib/vocab";

/**
 * The listing lifecycle (docs/portals/README.md §7). The client can only ask for a named
 * action; the server looks it up here, checks the permission and the current status, and
 * decides the next status. There is no "set status to X" anywhere.
 */
export type { ListingStatus };

type ActionDef = {
  label: string;
  from: readonly ListingStatus[];
  to: ListingStatus;
  permission: Permission;
  /** Moderator actions act on any listing (platform scope); owner actions on the actor's own scope. */
  side: "owner" | "moderator" | "system";
  /** For owner actions an admin may also take on any listing, with this platform permission. */
  adminPermission?: Permission;
  reasonRequired?: boolean;
  /** Destructive enough to need a confirmation dialog. */
  confirm?: string;
};

export const LISTING_ACTIONS = {
  submit: {
    label: "Submit for approval",
    from: ["draft", "changes_requested", "rejected", "withdrawn"],
    to: "submitted",
    permission: "listings.submit",
    side: "owner",
  },
  withdraw: {
    label: "Withdraw",
    from: ["submitted", "under_review", "approved", "published", "paused", "unpublished"],
    to: "withdrawn",
    permission: "listings.submit",
    side: "owner",
    confirm: "The listing leaves the marketplace and any review stops. You can edit and resubmit it later.",
  },
  archive: {
    label: "Archive",
    from: ["draft", "withdrawn", "rejected", "unpublished", "expired"],
    to: "archived",
    permission: "listings.submit",
    side: "owner",
    confirm: "Archived listings are kept for your records but can no longer be edited or submitted.",
  },
  mark_closed: {
    label: "Mark as no longer available",
    from: ["published", "paused"],
    to: "transacted",
    permission: "listings.submit",
    adminPermission: "listings.manage",
    side: "owner",
    confirm: "It leaves the marketplace straight away. Enquiries stop, and you can mark it available again later.",
  },
  reopen: {
    label: "Mark as available again",
    from: ["transacted"],
    to: "published",
    permission: "listings.submit",
    adminPermission: "listings.manage",
    side: "owner",
    confirm: "It goes back on the marketplace with its current details and price.",
  },
  start_review: {
    label: "Start review",
    from: ["submitted"],
    to: "under_review",
    permission: "listings.approve",
    side: "moderator",
  },
  approve: {
    label: "Approve and publish",
    from: ["submitted", "under_review"],
    to: "published",
    permission: "listings.approve",
    side: "moderator",
    reasonRequired: true,
  },
  request_changes: {
    label: "Request changes",
    from: ["submitted", "under_review"],
    to: "changes_requested",
    permission: "listings.reject",
    side: "moderator",
    reasonRequired: true,
  },
  reject: {
    label: "Reject",
    from: ["submitted", "under_review"],
    to: "rejected",
    permission: "listings.reject",
    side: "moderator",
    reasonRequired: true,
    confirm: "The agent sees your remark and can edit and resubmit.",
  },
  unpublish: {
    label: "Unpublish",
    from: ["published", "paused"],
    to: "unpublished",
    permission: "listings.manage",
    side: "moderator",
    reasonRequired: true,
    confirm: "The listing disappears from the marketplace immediately.",
  },
  republish: {
    label: "Republish",
    from: ["unpublished"],
    to: "published",
    permission: "listings.manage",
    side: "moderator",
  },
  remove: {
    label: "Remove",
    from: [
      "draft",
      "submitted",
      "under_review",
      "changes_requested",
      "rejected",
      "approved",
      "published",
      "paused",
      "unpublished",
      "withdrawn",
      "archived",
      "expired",
    ],
    to: "removed",
    permission: "properties.remove",
    side: "moderator",
    reasonRequired: true,
    confirm: "Removal is for policy violations. The listing is hidden everywhere and cannot be resubmitted.",
  },
  pause: { label: "Pause", from: ["published"], to: "paused", permission: "listings.manage", side: "system" },
  resume: { label: "Resume", from: ["paused"], to: "published", permission: "listings.manage", side: "system" },
} as const satisfies Record<string, ActionDef>;

export type ListingAction = keyof typeof LISTING_ACTIONS;

export const isListingAction = (value: unknown): value is ListingAction => typeof value === "string" && value in LISTING_ACTIONS;

export function canTransition(action: ListingAction, from: ListingStatus): boolean {
  return (LISTING_ACTIONS[action].from as readonly ListingStatus[]).includes(from);
}

/**
 * The actions this actor may take on a listing in this status, from the same table and
 * permissions the server enforces. Showing a button is never what allows the action.
 */
export function availableListingActions(actor: Actor, status: ListingStatus): ListingAction[] {
  return (Object.keys(LISTING_ACTIONS) as ListingAction[]).filter((a) => {
    const def: ActionDef = LISTING_ACTIONS[a];
    if (def.side === "system" || !canTransition(a, status)) return false;
    if (def.side === "moderator") return can(actor, def.permission, "platform");
    if (def.adminPermission && can(actor, def.adminPermission, "platform")) return true;
    return actor.workspace === "professional" && can(actor, def.permission);
  });
}

/** The label for an action, in the listing's own words ("Mark as sold" rather than "no longer available"). */
export function actionLabel(action: ListingAction, purpose: "sale" | "rent" | "lease" | "pg" | "stay"): string {
  if (action === "mark_closed") return CLOSED_LABELS[purpose].action;
  return LISTING_ACTIONS[action].label;
}

/** Statuses in which the owner may edit the listing. Live listings must be withdrawn first. */
export const EDITABLE_STATUSES: readonly ListingStatus[] = ["draft", "changes_requested", "rejected", "withdrawn"];
export const isEditable = (status: ListingStatus) => EDITABLE_STATUSES.includes(status);

/** Visible to customers. */
export const PUBLIC_STATUSES: readonly ListingStatus[] = ["published"];

export const STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  under_review: "Under review",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  approved: "Approved",
  published: "Live",
  paused: "Paused",
  unpublished: "Unpublished",
  withdrawn: "Withdrawn",
  archived: "Archived",
  removed: "Removed",
  expired: "Expired",
  transacted: "No longer available",
};

/** What "no longer available" means for each purpose, for buttons and badges. */
export const CLOSED_LABELS: Record<"sale" | "rent" | "lease" | "pg" | "stay", { action: string; status: string }> = {
  sale: { action: "Mark as sold", status: "Sold" },
  rent: { action: "Mark as rented out", status: "Rented out" },
  lease: { action: "Mark as leased", status: "Leased" },
  pg: { action: "Mark as full", status: "Full" },
  stay: { action: "Stop taking bookings", status: "Not taking bookings" },
};

/** Tone for status badges. Always paired with the text label: colour is never the only signal. */
export const STATUS_TONES: Record<ListingStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  changes_requested: "warning",
  rejected: "danger",
  approved: "success",
  published: "success",
  paused: "warning",
  unpublished: "warning",
  withdrawn: "neutral",
  archived: "neutral",
  removed: "danger",
  expired: "neutral",
  transacted: "neutral",
};

/** Owner-facing groupings for the "My properties" tabs. */
export const STATUS_GROUPS = {
  all: null,
  active: ["published"],
  pending: ["submitted", "under_review", "approved"],
  drafts: ["draft", "changes_requested", "withdrawn"],
  rejected: ["rejected"],
  archived: ["archived", "unpublished", "paused", "removed", "expired", "transacted"],
} as const satisfies Record<string, readonly ListingStatus[] | null>;
export type StatusGroup = keyof typeof STATUS_GROUPS;

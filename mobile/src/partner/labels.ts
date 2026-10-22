/** How a listing's status is coloured in the partner screens, as the website's (lib/listings/lifecycle STATUS_TONES). */
export const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
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

/** An agent's account status. */
export const AGENT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { active: "success", pending: "warning", suspended: "danger", rejected: "danger" };

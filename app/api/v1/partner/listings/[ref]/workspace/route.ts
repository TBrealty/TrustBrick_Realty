import { apiRoute } from "@/lib/api/http";
import { can } from "@/lib/authz";
import { db } from "@/lib/db";
import { LISTING_ACTIONS, STATUS_LABELS, actionLabel, availableListingActions, isEditable } from "@/lib/listings/lifecycle";
import { CATEGORY_LABELS, PURPOSE_LABELS } from "@/lib/listings/onboarding-schema";
import { listingCard } from "@/lib/services/listings/card";
import { submissionGaps } from "@/lib/services/listings/lifecycle";
import { getListingForActor } from "@/lib/services/listings/queries";
import { dealContextFor } from "@/lib/services/commission";

/**
 * Everything to manage one listing from the app: its full record (for the edit steps), the card
 * (facts, terms, offer, price and status history), what's still missing before it can be
 * submitted, and the lifecycle actions this person may take now, with their wording. For a live
 * sale or rental, `deal` is what the "how did it close?" step needs.
 */
export const GET = apiRoute<{ ref: string }>("v1.partner.listing_workspace", { auth: "user" }, async ({ actor, params }) => {
  const a = await actor();
  const listing = await getListingForActor(a, params.ref);
  const [card, gaps, deal] = await Promise.all([
    listingCard(a, params.ref),
    submissionGaps(db, listing.id),
    ["published", "paused"].includes(listing.status) ? dealContextFor(listing) : null,
  ]);
  const actions = availableListingActions(a, listing.status).map((action) => {
    const def = LISTING_ACTIONS[action] as { confirm?: string; reasonRequired?: boolean };
    return { action, label: actionLabel(action, listing.purpose), confirm: def.confirm ?? null, reasonRequired: def.reasonRequired ?? false };
  });
  const team = a.workspace === "professional" && can(a, "listings.edit");
  return {
    listing,
    card,
    gaps,
    actions,
    deal,
    statusLabel: STATUS_LABELS[listing.status],
    purposeLabel: PURPOSE_LABELS[listing.purpose],
    categoryLabel: CATEGORY_LABELS[listing.type.category],
    /** The edit steps can be used now (a draft, or sent back); a live listing takes quick edits (`terms`) instead. */
    editable: team && isEditable(listing.status),
    quickEdit: team && ["published", "paused"].includes(listing.status),
  };
});

import Link from "next/link";
import { transitionAction } from "@/app/(workspace)/properties/actions";
import { Checkbox, ConfirmAction } from "@/components/workspace/forms";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { LISTING_ACTIONS, type ListingStatus, actionLabel, availableListingActions, isEditable } from "@/lib/listings/lifecycle";
import type { DealContext } from "@/lib/services/commission";
import { CloseDealFields } from "./CloseDealFields";

const REMARK_LABELS: Partial<Record<string, string>> = {
  approve: "Remark: why are you approving it?",
  reject: "Remark: why are you rejecting it?",
  request_changes: "What should the agent change?",
};

/**
 * The buttons for what this actor may do to this listing right now. Computed from the same
 * lifecycle table and permissions the server enforces; showing a button is never what allows it.
 */
export function ListingActions({
  actor,
  referenceId,
  status,
  purpose,
  caseReferenceId,
  deal,
}: {
  actor: Actor;
  referenceId: string;
  status: ListingStatus;
  purpose: "sale" | "rent" | "lease" | "pg" | "stay";
  caseReferenceId?: string | null;
  /** For sales and rentals: what "Mark as sold" needs to record Trustbrick's commission. */
  deal?: DealContext | null;
}) {
  const available = availableListingActions(actor, status);
  const owner = actor.workspace === "professional";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {owner && can(actor, "listings.edit") && isEditable(status) && (
        <Link href={`/properties/${referenceId}/edit`} className="wbtn wbtn-secondary wbtn-sm">
          Edit
        </Link>
      )}
      {owner && available.includes("submit") && (
        <Link href={`/properties/${referenceId}/edit?step=review`} className="wbtn wbtn-primary wbtn-sm">
          Review & submit
        </Link>
      )}
      {caseReferenceId && can(actor, "listings.approve", "platform") && (
        <Link href={`/approvals/${caseReferenceId}`} className="wbtn wbtn-secondary wbtn-sm">
          Open review case
        </Link>
      )}
      {available
        .filter((a) => a !== "submit")
        .map((a) => {
          const def = LISTING_ACTIONS[a];
          const label = actionLabel(a, purpose);
          const reasonRequired = "reasonRequired" in def && def.reasonRequired;
          return (
            <ConfirmAction
              key={a}
              label={label}
              title={`${label}?`}
              description={"confirm" in def ? def.confirm : a === "approve" ? "The listing goes live on the marketplace immediately. The agent sees your remark." : undefined}
              action={transitionAction}
              hidden={{ ref: referenceId, action: a }}
              variant={a === "approve" || a === "republish" || a === "reopen" ? "primary" : a === "reject" || a === "remove" ? "danger" : "secondary"}
              reason={reasonRequired ? { required: true, label: REMARK_LABELS[a] ?? "Reason", placeholder: "The agent sees this." } : undefined}
            >
              {a === "mark_closed" && deal && <CloseDealFields deal={deal} />}
              {a === "approve" && can(actor, "properties.verify", "platform") && (
                <Checkbox name="markVerified" label="Also mark the property as verified" hint="Only if you've checked ownership documents or visited it." />
              )}
            </ConfirmAction>
          );
        })}
    </div>
  );
}

"use client";

import { visitAction } from "@/app/(workspace)/leads/actions";
import type { VisitRow } from "@/lib/services/crm";
import { ConfirmAction, TextInput } from "./forms";

/** Schedule, complete, mark a no-show or cancel. The server checks the transition and the actor's scope. */
export function VisitControls({ visit }: { visit: VisitRow }) {
  const suggested = visit.scheduledAt ?? visit.requestedFor;
  const d = suggested ? new Date(suggested) : null;
  const date = d ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "";
  const time = d ? d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "11:00";
  const open = visit.status === "requested" || visit.status === "scheduled";
  if (!open) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <ConfirmAction
        label={visit.status === "requested" ? "Confirm time" : "Reschedule"}
        title={visit.status === "requested" ? "Confirm the visit" : "Reschedule the visit"}
        description="The customer is notified of the confirmed time."
        variant="primary"
        action={visitAction}
        hidden={{ ref: visit.referenceId, action: "schedule" }}
      >
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Date" name="date" type="date" defaultValue={date} required />
          <TextInput label="Time" name="time" type="time" defaultValue={time} required />
        </div>
        <TextInput label="Note for the customer (optional)" name="notes" placeholder="e.g. Ask for me at the security gate" />
      </ConfirmAction>
      {visit.status === "scheduled" && (
        <>
          <ConfirmAction label="Completed" title="Mark the visit as completed?" action={visitAction} hidden={{ ref: visit.referenceId, action: "complete" }}>
            <TextInput label="How did it go? (optional)" name="notes" />
          </ConfirmAction>
          <ConfirmAction label="No-show" title="The customer didn't come?" action={visitAction} hidden={{ ref: visit.referenceId, action: "no_show" }} />
        </>
      )}
      <ConfirmAction label="Cancel" title="Cancel the visit?" description="The customer is notified." variant="danger" action={visitAction} hidden={{ ref: visit.referenceId, action: "cancel" }}>
        <TextInput label="Reason (shared with the customer)" name="notes" />
      </ConfirmAction>
    </div>
  );
}

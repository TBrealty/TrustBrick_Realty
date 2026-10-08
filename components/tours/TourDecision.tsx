"use client";

import { useState } from "react";
import { decideTourAction } from "@/app/(workspace)/approvals/actions";
import { ActionForm, Submit, TextArea } from "@/components/workspace/forms";
import { HIDE_REASON_MIN } from "@/lib/tours/terms";

/** Approve the tour change as it is, or hide the tour with a remark the agent or host sees. */
export function TourDecision({ caseReference, listingReference, hidden = false }: { caseReference: string; listingReference: string; hidden?: boolean }) {
  const [mode, setMode] = useState<"approve" | "hide">("approve");
  return (
    <div>
      <div role="radiogroup" aria-label="Decision" className="mb-4 grid grid-cols-2 gap-2">
        {(
          [
            ["approve", hidden ? "Approve and show" : "Approve", hidden ? "Fixed: show it to guests and buyers again." : "Looks right: keep it live."],
            ["hide", hidden ? "Keep it hidden" : "Hide the tour", hidden ? "Still not right, with a reason." : "Take it down, with a reason."],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-[3px] border px-3 py-2 text-left text-[0.8125rem] ${mode === value ? (value === "hide" ? "border-brick bg-brick/6" : "border-ink bg-ink/5") : "border-line-light hover:border-ink/40"}`}
          >
            <span className="block font-medium">{label}</span>
            <span className="text-stone-deep">{hint}</span>
          </button>
        ))}
      </div>
      <ActionForm action={decideTourAction} key={mode}>
        <input type="hidden" name="ref" value={caseReference} />
        <input type="hidden" name="listing" value={listingReference} />
        <input type="hidden" name="decision" value={mode} />
        <TextArea
          label={mode === "hide" ? (hidden ? "What's still wrong" : "Why it's hidden") : "Remark (optional)"}
          name="reason"
          rows={3}
          maxLength={1000}
          required={mode === "hide"}
          placeholder={mode === "hide" ? "e.g. These rooms are from a different property." : "e.g. Rooms match the photos."}
          hint={mode === "hide" ? `At least ${HIDE_REASON_MIN} characters. The agent or host sees it. It stays hidden until you approve a later change.` : "The agent or host sees it."}
        />
        <div className="mt-3">
          <Submit variant={mode === "hide" ? "danger" : "primary"}>{mode === "hide" ? (hidden ? "Keep it hidden" : "Hide the tour") : hidden ? "Approve and show" : "Approve"}</Submit>
        </div>
      </ActionForm>
    </div>
  );
}

"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { decideTourReview } from "@/lib/services/tour-review";

type Result = ActionResult<unknown>;

/** Approves a change to a live listing's tour, or hides the tour with a remark. */
export async function decideTourAction(_prev: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const listing = text(form, "listing");
  const decision = text(form, "decision");
  const result = await runAction(
    "tour.review",
    (actor, ctx) => {
      if (decision !== "approve" && decision !== "hide") throw new AppError("VALIDATION_ERROR", "Unknown decision.");
      return decideTourReview(actor, ref, decision, text(form, "reason"), ctx);
    },
    { revalidate: [`/approvals/${ref}`, "/approvals", `/properties/${listing}`, `/properties/${listing}/tour`, `/listings/${listing}`, "/dashboard"] },
  );
  if (!result.ok) return result;
  return { ok: true, message: decision === "approve" ? "Approved. The tour is showing to guests and buyers." : "Hidden. The agent or host has been told why." };
}

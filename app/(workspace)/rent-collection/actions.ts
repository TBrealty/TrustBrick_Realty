"use server";

import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { decideBankAccount, holdSettlement, markSettlementFailed, markSettlementPaid, refundRentPayment, revealLandlordBank, reviewOwnershipProof } from "@/lib/services/rent/admin";

/** Trustbrick's rent actions: checking landlords, and settling rent from the back office. */

const pages = ["/rent-collection"];

export async function reviewProofAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const decision = text(form, "decision") === "approve" ? "approve" : "reject";
  return runAction("rent.review_proof", (actor, ctx) => reviewOwnershipProof(actor, text(form, "link"), decision, form.get("reason"), ctx), { revalidate: pages });
}

export async function decideBankAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const decision = text(form, "decision") === "verify" ? "verify" : "reject";
  return runAction("rent.decide_bank", (actor, ctx) => decideBankAccount(actor, text(form, "landlord"), decision, form.get("reason"), ctx), { revalidate: pages });
}

export async function revealBankAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.reveal_bank", (actor, ctx) => revealLandlordBank(actor, text(form, "landlord"), form.get("reason"), ctx));
}

export async function markPaidAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.mark_paid", (actor, ctx) => markSettlementPaid(actor, text(form, "settlement"), formObject(form), ctx), { revalidate: pages });
}

export async function markFailedAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.mark_failed", (actor, ctx) => markSettlementFailed(actor, text(form, "settlement"), form.get("reason"), ctx), { revalidate: pages });
}

export async function holdSettlementAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const hold = text(form, "hold") !== "release";
  return runAction("rent.hold_settlement", (actor, ctx) => holdSettlement(actor, text(form, "settlement"), hold, form.get("reason"), ctx), { revalidate: pages });
}

export async function refundRentAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.refund", (actor, ctx) => refundRentPayment(actor, text(form, "payment"), { reason: form.get("reason"), reopen: form.get("reopen") }, ctx), { revalidate: pages });
}

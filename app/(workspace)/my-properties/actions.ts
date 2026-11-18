"use server";

import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { respondToLandlordRequest, saveLandlordBankAccount, saveLandlordPan } from "@/lib/services/rent/landlords";
import { confirmTenancy, disputeTenancy, endTenancyByLandlord } from "@/lib/services/rent/tenancies";

/** The landlord's actions in their dashboard (lib/services/rent). */

const pages = ["/my-properties", "/bank-account", "/rent-received"];

export async function respondToRequestAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const accept = text(form, "answer") === "accept";
  return runAction("rent.landlord_request", (actor, ctx) => respondToLandlordRequest(actor.userId, actor.userReferenceId, text(form, "invitation"), accept, ctx), { revalidate: pages });
}

export async function savePanAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.landlord_pan", (actor, ctx) => saveLandlordPan(actor, formObject(form), ctx), { revalidate: pages });
}

export async function saveBankAccountAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.landlord_bank", (actor, ctx) => saveLandlordBankAccount(actor, formObject(form), ctx), { revalidate: pages });
}

export async function confirmTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "property");
  return runAction("rent.confirm_tenancy", (actor, ctx) => confirmTenancy(actor, text(form, "tenancy"), ctx), { revalidate: [...pages, `/my-properties/${ref}`] });
}

export async function disputeTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "property");
  return runAction("rent.dispute_tenancy", (actor, ctx) => disputeTenancy(actor, text(form, "tenancy"), { note: form.get("reason") }, ctx), { revalidate: [...pages, `/my-properties/${ref}`] });
}

export async function endTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "property");
  return runAction("rent.landlord_end_tenancy", (actor, ctx) => endTenancyByLandlord(actor, text(form, "tenancy"), formObject(form), ctx), { revalidate: [...pages, `/my-properties/${ref}`] });
}

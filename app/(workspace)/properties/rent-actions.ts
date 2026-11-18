"use server";

import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { inviteExistingLandlord, inviteNewLandlord, removeLandlord, resendLandlordInvitation, revokeLandlordInvitation } from "@/lib/services/rent/landlords";
import { cancelTenancy, correctTenancy, createTenancy, endTenancyByAgent, resendTenantInvite } from "@/lib/services/rent/tenancies";

/**
 * The agent's landlord and tenancy actions on a rented property (lib/services/rent). The ones that
 * return a link don't refresh the page: the link is shown once, in the form that made it.
 */

const pages = (ref: string) => [`/properties/${ref}`];

export async function inviteNewLandlordAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.invite_new_landlord", (actor, ctx) => inviteNewLandlord(actor, ref, formObject(form), ctx));
}

export async function inviteExistingLandlordAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.invite_existing_landlord", (actor, ctx) => inviteExistingLandlord(actor, ref, formObject(form), ctx), { revalidate: pages(ref) });
}

export async function resendLandlordInviteAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.resend_landlord_invite", (actor, ctx) => resendLandlordInvitation(actor, text(form, "invitation"), ctx));
}

export async function revokeLandlordInviteAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.revoke_landlord_invite", (actor, ctx) => revokeLandlordInvitation(actor, text(form, "invitation"), ctx), { revalidate: pages(ref) });
}

export async function removeLandlordAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.remove_landlord", (actor, ctx) => removeLandlord(actor, ref, form.get("reason"), ctx), { revalidate: pages(ref) });
}

export async function createTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.create_tenancy", (actor, ctx) => createTenancy(actor, ref, formObject(form), ctx));
}

export async function correctTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.correct_tenancy", (actor, ctx) => correctTenancy(actor, text(form, "tenancy"), formObject(form), ctx), { revalidate: pages(ref) });
}

export async function resendTenantInviteAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  return runAction("rent.resend_tenant_invite", (actor, ctx) => resendTenantInvite(actor, text(form, "tenancy"), ctx));
}

export async function cancelTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.cancel_tenancy", (actor, ctx) => cancelTenancy(actor, text(form, "tenancy"), ctx), { revalidate: pages(ref) });
}

export async function endTenancyAction(_p: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ref = text(form, "ref");
  return runAction("rent.end_tenancy", (actor, ctx) => endTenancyByAgent(actor, text(form, "tenancy"), formObject(form), ctx), { revalidate: pages(ref) });
}

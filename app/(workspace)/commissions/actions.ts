"use server";

import { formObject, runAction, text } from "@/lib/actions";
import { assertCan } from "@/lib/authz";
import type { ActionResult } from "@/lib/errors";
import { addAdjustment, setDefaultRate, setGstPercent, setPartnerRate, updateEntryStatus } from "@/lib/services/commission";
import { confirmPassword } from "@/lib/services/reauth";

type Result = ActionResult<unknown>;
const ledger = ["/commissions", "/commission", "/dashboard"];

export async function markPaidAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction(
    "commission.paid",
    (a, ctx) => updateEntryStatus(a, text(form, "ref"), { status: "paid", paymentReference: text(form, "paymentReference"), note: text(form, "reason") || undefined }, ctx),
    { revalidate: ledger },
  );
  return r.ok ? { ok: true, message: "Marked paid." } : r;
}

export async function waiveAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("commission.waive", (a, ctx) => updateEntryStatus(a, text(form, "ref"), { status: "waived", note: text(form, "reason") }, ctx), { revalidate: ledger });
  return r.ok ? { ok: true, message: "Waived." } : r;
}

export async function adjustmentAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("commission.adjust", (a, ctx) => addAdjustment(a, formObject(form), ctx), { revalidate: ledger });
  return r.ok ? { ok: true, message: `Added as ${(r.data as { referenceId: string }).referenceId}.` } : r;
}

/** A partner's own rate, from their agent, host or organization page. */
export async function partnerRateAction(_p: Result | null, form: FormData): Promise<Result> {
  const org = text(form, "organization");
  const r = await runAction("commission.partner_rate", (a, ctx) => setPartnerRate(a, org, formObject(form), ctx), {
    revalidate: [`/organizations/${org}`, "/agents", "/hosts", "/commission"],
  });
  return r.ok ? { ok: true, message: "Rate saved. The partner is asked to accept it." } : r;
}

/** Platform defaults and GST: SuperAdmin, with their password. */
export async function defaultRateAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction(
    "commission.default_rate",
    async (a, ctx) => {
      assertCan(a, "settings.manage", "platform");
      await confirmPassword(a.userId, form.get("password"));
      await setDefaultRate(a, formObject(form), ctx);
    },
    { revalidate: ["/system", "/commission", "/commissions"] },
  );
  return r.ok ? { ok: true, message: "Default saved. Partners on the default are asked to accept it." } : r;
}

export async function gstAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction(
    "commission.gst",
    async (a, ctx) => {
      assertCan(a, "settings.manage", "platform");
      await confirmPassword(a.userId, form.get("password"));
      await setGstPercent(a, formObject(form), ctx);
    },
    { revalidate: ["/system", "/commission"] },
  );
  return r.ok ? { ok: true, message: "GST rate saved. It applies to new charges." } : r;
}

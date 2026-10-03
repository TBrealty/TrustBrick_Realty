"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { createOrganization, isOrganizationAction, transitionOrganization, updateOrganization } from "@/lib/services/organizations";

type Result = ActionResult<unknown>;

export async function createOrganizationAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runAction("organization.create", (a, ctx) => createOrganization(a, formObject(form), ctx), { revalidate: ["/organizations", "/dashboard"] });
  if (r.ok) redirect(`/organizations/${(r.data as { referenceId: string }).referenceId}?created=1`);
  return r;
}

export async function organizationTransitionAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const action = text(form, "action");
  const r = await runAction(
    "organization.transition",
    (a, ctx) => {
      if (!isOrganizationAction(action)) throw new AppError("VALIDATION_ERROR", "Unknown action.");
      return transitionOrganization(a, ref, action, text(form, "reason"), ctx);
    },
    { revalidate: [`/organizations/${ref}`, "/organizations", "/approvals", "/dashboard"] },
  );
  return r.ok ? { ok: true, message: "Done." } : r;
}

export async function updateOrganizationAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("organization.update", (a, ctx) => updateOrganization(a, ref, formObject(form), ctx), { revalidate: [`/organizations/${ref}`] });
  return r.ok ? { ok: true, message: "Saved." } : r;
}

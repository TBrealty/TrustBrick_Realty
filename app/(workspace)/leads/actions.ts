"use server";

import { runAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { addLeadNote, updateLeadStatus, updateVisit } from "@/lib/services/crm";

type Result = ActionResult<unknown>;

export async function leadStatusAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction(
    "lead.status",
    (a) => updateLeadStatus(a, ref, { status: text(form, "status"), note: text(form, "note"), lostReason: text(form, "lostReason") }),
    { revalidate: [`/leads/${ref}`, "/leads", "/dashboard"] },
  );
  return r.ok ? { ok: true, message: "Status updated." } : r;
}

export async function leadNoteAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("lead.note", (a) => addLeadNote(a, ref, text(form, "note")), { revalidate: [`/leads/${ref}`] });
  return r.ok ? { ok: true, message: "Note added." } : r;
}

export async function visitAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const date = text(form, "date");
  const time = text(form, "time");
  const scheduledAt = date && time ? `${date}T${time}:00+05:30` : undefined;
  const r = await runAction("visit.update", (a) => updateVisit(a, ref, { action: text(form, "action"), scheduledAt, notes: text(form, "notes") }), {
    revalidate: ["/visits", "/leads", "/dashboard"],
  });
  return r.ok ? { ok: true, message: "Visit updated." } : r;
}

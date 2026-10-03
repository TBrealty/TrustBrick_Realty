"use server";

import { headers } from "next/headers";
import { formObject, runPersonAction, text } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";
import { createEnquiry } from "@/lib/services/crm";
import { submitReport } from "@/lib/services/reports";
import { recordListingView } from "@/lib/services/views";

type Result = ActionResult<unknown>;

export async function enquiryAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runPersonAction("listing.enquiry", (person) => createEnquiry({ userId: person!.userId, email: person!.email }, ref, formObject(form)));
  if (!r.ok) return r;
  const { visitReferenceId } = r.data as { visitReferenceId: string | null };
  return {
    ok: true,
    message: visitReferenceId
      ? "Sent. The agent will confirm a visit time with you; you'll get a notification when they do."
      : "Sent. The agent has your number and will get in touch.",
  };
}

export async function reportAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runPersonAction("listing.report", (person, ctx) =>
    submitReport({ kind: "person", userId: person!.userId, referenceId: person!.referenceId, role: "customer" }, ref, formObject(form), ctx),
  );
  return r.ok ? { ok: true, message: "Thanks. A Trustbrick moderator will look at it." } : r;
}

/** Called once per page view from the browser, so link prefetches and bots without JS don't count. */
export async function recordViewAction(ref: string): Promise<void> {
  if (typeof ref !== "string") return;
  try {
    const [session, h] = await Promise.all([getSession(), headers()]);
    const ua = h.get("user-agent") ?? "";
    if (/bot|crawl|spider|preview|headless/i.test(ua)) return;
    await recordListingView(ref, { userId: session?.user.id ?? null, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"), userAgent: ua });
  } catch {
    // Analytics must never break the page.
  }
}

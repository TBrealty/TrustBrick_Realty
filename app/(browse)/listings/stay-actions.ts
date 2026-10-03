"use server";

import { redirect } from "next/navigation";
import { formObject, runPersonAction, text } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { type Quote, cancelTrip, createBooking, quoteStay } from "@/lib/services/stays/bookings";
import { applyAsHost } from "@/lib/services/stays/hosts";

type Result = ActionResult<unknown>;

/** The booking panel's live price. Public and read-only. */
export async function quoteStayAction(referenceId: string, input: { checkIn: string; checkOut: string; adults: number; children: number; pets: boolean }): Promise<Quote> {
  try {
    return await quoteStay(String(referenceId), input);
  } catch {
    return { ok: false, message: "We couldn't price those dates. Try again." };
  }
}

export async function createBookingAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runPersonAction(
    "stay.book",
    (person, ctx) => createBooking({ userId: person!.userId, email: person!.email }, ref, formObject(form), ctx),
    { revalidate: [`/listings/${ref}`, "/account/trips"] },
  );
  if (r.ok) redirect(`/account/trips/${(r.data as { referenceId: string }).referenceId}?booked=1`);
  return r;
}

export async function cancelTripAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runPersonAction("stay.cancel", (person, ctx) => cancelTrip({ kind: "person", userId: person!.userId, referenceId: person!.referenceId, role: "guest" }, ref, text(form, "reason"), ctx), {
    revalidate: [`/account/trips/${ref}`, "/account/trips"],
  });
  return r.ok ? { ok: true, message: "Cancelled. The host has been told, and the dates are free again." } : r;
}

export async function applyAsHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const r = await runPersonAction("host.apply", (person, ctx) =>
    applyAsHost({ kind: "person", userId: person!.userId, referenceId: person!.referenceId, role: "customer" }, formObject(form), ctx),
  );
  if (r.ok) redirect("/become-a-host?applied=1");
  return r;
}

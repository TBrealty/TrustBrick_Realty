"use server";

import { formObject, runAction, text } from "@/lib/actions";
import { AppError, type ActionResult } from "@/lib/errors";
import { blockDates, removeSpecialRate, setSpecialRate, unblockDates } from "@/lib/services/stays/calendar";
import { transitionBooking } from "@/lib/services/stays/bookings";
import { approveHost, reinstateHost, rejectHost, setHostVerification, suspendHost } from "@/lib/services/stays/hosts";
import { BOOKING_ACTIONS, isBookingAction } from "@/lib/stays/booking-lifecycle";

type Result = ActionResult<unknown>;

export async function bookingTransitionAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const action = text(form, "action");
  const r = await runAction(
    "booking.transition",
    (actor, ctx) => {
      if (!isBookingAction(action)) throw new AppError("VALIDATION_ERROR", "Unknown action.");
      return transitionBooking(actor, ref, action, text(form, "reason"), ctx);
    },
    { revalidate: [`/bookings/${ref}`, "/bookings", "/calendar", "/dashboard"] },
  );
  if (!r.ok || !isBookingAction(action)) return r;
  const auto = (r.data as { autoDeclined: number }).autoDeclined;
  return { ok: true, message: `${BOOKING_ACTIONS[action].label}: done.${auto ? ` ${auto} overlapping request${auto === 1 ? " was" : "s were"} declined automatically.` : ""}` };
}

const calendarPaths = (ref: string) => ["/calendar", `/properties/${ref}`, `/listings/${ref}`];

export async function blockDatesAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("calendar.block", (actor, ctx) => blockDates(actor, ref, formObject(form), ctx), { revalidate: calendarPaths(ref) });
  return r.ok ? { ok: true, message: "Dates closed. Guests can't book them." } : r;
}

export async function unblockDatesAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("calendar.unblock", (actor, ctx) => unblockDates(actor, ref, text(form, "id"), ctx), { revalidate: calendarPaths(ref) });
  return r.ok ? { ok: true, message: "Dates reopened." } : r;
}

export async function setRateAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("calendar.rate", (actor, ctx) => setSpecialRate(actor, ref, formObject(form), ctx), { revalidate: calendarPaths(ref) });
  return r.ok ? { ok: true, message: "Special price saved. Existing bookings keep their price." } : r;
}

export async function removeRateAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("calendar.rate.remove", (actor, ctx) => removeSpecialRate(actor, ref, text(form, "id"), ctx), { revalidate: calendarPaths(ref) });
  return r.ok ? { ok: true, message: "Special price removed." } : r;
}

const hostPaths = (ref: string) => [`/hosts/${ref}`, "/hosts", "/dashboard"];

export async function approveHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("host.approve", (a, ctx) => approveHost(a, ref, { verify: form.get("verify") === "on" }, ctx), { revalidate: hostPaths(ref) });
  return r.ok ? { ok: true, message: "Approved. The host has been told they can list their home." } : r;
}

export async function rejectHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("host.reject", (a, ctx) => rejectHost(a, ref, text(form, "reason"), ctx), { revalidate: hostPaths(ref) });
  return r.ok ? { ok: true, message: "Rejected. The applicant has been told why." } : r;
}

export async function verifyHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("host.verify", (a, ctx) => setHostVerification(a, ref, text(form, "verified") === "1", ctx), { revalidate: hostPaths(ref) });
  return r.ok ? { ok: true, message: "Verification updated." } : r;
}

export async function suspendHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("host.suspend", (a, ctx) => suspendHost(a, ref, text(form, "reason"), ctx), { revalidate: hostPaths(ref) });
  return r.ok ? { ok: true, message: `Suspended. ${(r.data as { paused: number }).paused} live stay(s) paused.` } : r;
}

export async function reinstateHostAction(_p: Result | null, form: FormData): Promise<Result> {
  const ref = text(form, "ref");
  const r = await runAction("host.reinstate", (a, ctx) => reinstateHost(a, ref, ctx), { revalidate: hostPaths(ref) });
  return r.ok ? { ok: true, message: `Reinstated. ${(r.data as { resumed: number }).resumed} stay(s) back live.` } : r;
}

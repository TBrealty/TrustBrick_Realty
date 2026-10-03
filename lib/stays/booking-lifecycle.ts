import type { BookingStatus } from "@/lib/vocab";

/**
 * The booking lifecycle (docs/stays/README.md). Like listings, the client can only name an
 * action; the server looks it up here, checks who may take it and when, and decides the
 * next status. Shared by server and client code, so it has no server-only imports.
 *
 *   requested ──accept──▶ confirmed ──check_in──▶ checked_in ──complete──▶ completed
 *       │  └──decline──▶ declined         │ └──no_show──▶ no_show
 *       └──(24 h)──▶ expired              └──cancel──▶ cancelled (by guest, host or admin)
 *
 * Instant-book stays skip `requested`.
 */

export type BookingActionDef = {
  label: string;
  from: readonly BookingStatus[];
  to: BookingStatus;
  /** host: the listing's host (bookings.manage in scope); admin: platform staff; guest: the booking's guest. */
  side: "host" | "admin" | "guest";
  reason?: "required" | "optional";
  /** Date rule, checked against today in India. */
  when?: "on_or_after_check_in" | "before_check_in";
  confirm?: string;
};

export const BOOKING_ACTIONS = {
  accept: { label: "Accept", from: ["requested"], to: "confirmed", side: "host" },
  decline: {
    label: "Decline",
    from: ["requested"],
    to: "declined",
    side: "host",
    reason: "optional",
    confirm: "The guest is told the dates aren't available. Add a note if you'd like to explain.",
  },
  host_cancel: {
    label: "Cancel booking",
    from: ["confirmed"],
    to: "cancelled",
    side: "host",
    reason: "required",
    when: "before_check_in",
    confirm: "Cancelling a confirmed stay leaves the guest without a place to stay. It's recorded against your hosting.",
  },
  check_in: { label: "Mark checked in", from: ["confirmed"], to: "checked_in", side: "host", when: "on_or_after_check_in" },
  complete: { label: "Mark stay completed", from: ["checked_in"], to: "completed", side: "host" },
  no_show: {
    label: "Guest didn't arrive",
    from: ["confirmed"],
    to: "no_show",
    side: "host",
    when: "on_or_after_check_in",
    confirm: "Use this only if the guest never arrived and didn't cancel.",
  },
  admin_cancel: {
    label: "Cancel on behalf of Trustbrick",
    from: ["requested", "confirmed"],
    to: "cancelled",
    side: "admin",
    reason: "required",
    confirm: "Both the guest and the host are told. Use this for safety or policy problems.",
  },
  guest_cancel: {
    label: "Cancel",
    from: ["requested", "confirmed"],
    to: "cancelled",
    side: "guest",
    reason: "optional",
    when: "before_check_in",
  },
} as const satisfies Record<string, BookingActionDef>;

export type BookingAction = keyof typeof BOOKING_ACTIONS;
export const isBookingAction = (v: unknown): v is BookingAction => typeof v === "string" && v in BOOKING_ACTIONS;

/** Is the date rule met? Dates are YYYY-MM-DD in India's time zone. */
export function dateRuleMet(action: BookingAction, checkIn: string, today: string): boolean {
  const def: BookingActionDef = BOOKING_ACTIONS[action];
  if (def.when === "on_or_after_check_in") return today >= checkIn;
  if (def.when === "before_check_in") return today < checkIn;
  return true;
}

/** Actions open on a booking right now, for one side. The server re-checks everything. */
export function bookingActionsFor(side: BookingActionDef["side"], status: BookingStatus, checkIn: string, today: string): BookingAction[] {
  return (Object.keys(BOOKING_ACTIONS) as BookingAction[]).filter((a) => {
    const def: BookingActionDef = BOOKING_ACTIONS[a];
    return def.side === side && (def.from as readonly BookingStatus[]).includes(status) && dateRuleMet(a, checkIn, today);
  });
}

/** Today in India, YYYY-MM-DD. */
export const todayInIndia = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

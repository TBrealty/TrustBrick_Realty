import type { BookingStatus } from "@/lib/vocab";

/** Homestay vocabulary for people. Shared by server and client code. */

export const SPACE_TYPE_LABELS = {
  entire_home: { label: "Entire home", hint: "Guests have the whole place to themselves." },
  private_room: { label: "Private room", hint: "A private bedroom; some spaces are shared with you or others." },
} as const;

/** How long a host has to answer a booking request before it expires. */
export const REQUEST_HOURS = 24;

/**
 * Cancellation policies. A guest who cancels before the cut-off (check-in time on the check-in
 * day, less `freeUntilHours`) gets everything back; after it, `lateRefundPercent` of the total.
 * The refund itself is worked out in lib/payments/rules.ts.
 */
export const CANCELLATION_LABELS = {
  flexible: { label: "Flexible", rule: "Free cancellation until 24 hours before check-in.", late: "After that, 50% back.", freeUntilHours: 24, lateRefundPercent: 50 },
  moderate: { label: "Moderate", rule: "Free cancellation until 5 days before check-in.", late: "After that, 50% back.", freeUntilHours: 5 * 24, lateRefundPercent: 50 },
  strict: { label: "Strict", rule: "Free cancellation until 14 days before check-in.", late: "After that, no refund.", freeUntilHours: 14 * 24, lateRefundPercent: 0 },
} as const;

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Awaiting payment",
  abandoned: "Not completed",
  requested: "Awaiting host",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  checked_in: "Checked in",
  completed: "Completed",
  no_show: "No-show",
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending_payment: "neutral",
  abandoned: "neutral",
  requested: "warning",
  confirmed: "success",
  declined: "danger",
  expired: "neutral",
  cancelled: "neutral",
  checked_in: "info",
  completed: "success",
  no_show: "warning",
};

export const HOST_RELATIONSHIP_LABELS = {
  owner: "I own the home",
  family: "It belongs to my family",
  manager: "I manage it for the owner",
} as const;

/** "3 nights", "1 night". */
export const nightsLabel = (n: number) => `${n} ${n === 1 ? "night" : "nights"}`;

/** 14:00 → "2 PM", 11:30 → "11:30 AM". */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/**
 * Dashboard date ranges. Days start at midnight India Standard Time (UTC+05:30, no daylight
 * saving), so "today" means the same thing to every admin. Shared by server and client.
 */

export const RANGE_PRESETS = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
  "12m": "Last 12 months",
  custom: "Custom range",
} as const;
export type RangeKey = keyof typeof RANGE_PRESETS;
export type Bucket = "hour" | "day" | "week" | "month";

export type DateRange = {
  key: RangeKey;
  label: string;
  /** Inclusive start. */
  from: Date;
  /** Exclusive end. */
  to: Date;
  previous: { from: Date; to: Date; label: string };
  bucket: Bucket;
  /** YYYY-MM-DD, for the custom-range inputs. */
  fromDate: string;
  toDate: string;
};

const DAY = 86_400_000;
const IST = "+05:30";

/** The calendar date in India for an instant, as YYYY-MM-DD. */
export const istDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istMidnight = (ymd: string) => new Date(`${ymd}T00:00:00${IST}`);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function bucketFor(days: number): Bucket {
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 200) return "week";
  return "month";
}

export function resolveRange(params: { range?: unknown; from?: unknown; to?: unknown }, now = new Date()): DateRange {
  const key = (typeof params.range === "string" && params.range in RANGE_PRESETS ? params.range : "30d") as RangeKey;
  const today = istMidnight(istDate(now));
  const tomorrow = addDays(today, 1);
  let from: Date;
  let to: Date = tomorrow;

  switch (key) {
    case "today":
      from = today;
      break;
    case "yesterday":
      from = addDays(today, -1);
      to = today;
      break;
    case "7d":
      from = addDays(today, -6);
      break;
    case "30d":
      from = addDays(today, -29);
      break;
    case "90d":
      from = addDays(today, -89);
      break;
    case "year":
      from = istMidnight(`${istDate(now).slice(0, 4)}-01-01`);
      break;
    case "12m": {
      const [y, m] = istDate(now).split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 12, 1));
      from = istMidnight(start.toISOString().slice(0, 10));
      break;
    }
    case "custom": {
      const a = isDate(params.from) ? istMidnight(params.from) : addDays(today, -29);
      const b = isDate(params.to) ? addDays(istMidnight(params.to), 1) : tomorrow;
      from = a < b ? a : addDays(b, -1);
      to = a < b ? b : addDays(a, 1);
      // Bounded, so a custom range can never ask for an unbounded scan.
      if (to.getTime() - from.getTime() > 731 * DAY) from = addDays(to, -731);
      if (to > tomorrow) to = tomorrow;
      break;
    }
  }

  const span = to.getTime() - from.getTime();
  const days = Math.round(span / DAY);
  const previous = { from: new Date(from.getTime() - span), to: from, label: days === 1 ? "the day before" : `the previous ${days} days` };
  const label = key === "custom" ? `${istDate(from)} to ${istDate(addDays(to, -1))}` : RANGE_PRESETS[key];
  return { key, label, from, to, previous, bucket: bucketFor(days), fromDate: istDate(from), toDate: istDate(addDays(to, -1)) };
}

/** A human delta against the previous period. Never a percentage of zero. */
export function describeChange(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" | "none" } {
  if (previous === 0 && current === 0) return { text: "No change", direction: "flat" };
  if (previous === 0) return { text: "None", direction: "none" };
  const diff = current - previous;
  if (diff === 0) return { text: "Same as before", direction: "flat" };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString("en-IN")} (${pct}%)`, direction: diff > 0 ? "up" : "down" };
}

/** The IST calendar date `days` from now, as YYYY-MM-DD. */
export const istDateFromNow = (days: number) => istDate(new Date(Date.now() + days * DAY));

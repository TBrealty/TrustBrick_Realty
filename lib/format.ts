/** Indian-style currency: ₹1.25 Cr, ₹85 L, ₹35,000. */
export function formatPrice(amount: number, { compact = true }: { compact?: boolean } = {}): string {
  if (compact && amount >= 1_00_00_000) return `₹${trim(amount / 1_00_00_000)} Cr`;
  if (compact && amount >= 1_00_000) return `₹${trim(amount / 1_00_000)} L`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const trim = (value: number) => (Math.round(value * 100) / 100).toString();

export function formatArea(sqft: number): string {
  return `${Math.round(sqft).toLocaleString("en-IN")} sq ft`;
}

export function formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-IN", options).format(typeof value === "string" ? new Date(value) : value);
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const IST = { timeZone: "Asia/Kolkata" } as const;

/** 18 Sept 2026, 14:05 (IST). */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** 18 Sept 2026 (IST). */
export function formatDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" }).format(typeof value === "string" ? new Date(value) : value);
}

/** "3 hours ago", "yesterday", or a date for anything older than a week. */
export function relativeTime(value: string | Date, now = Date.now()): string {
  const t = (typeof value === "string" ? new Date(value) : value).getTime();
  const seconds = Math.round((t - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs > 7 * 86400) return formatDay(new Date(t));
  const format = relativeFormatter();
  if (abs < 60) return format(seconds, "second");
  if (abs < 3600) return format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format(Math.round(seconds / 3600), "hour");
  return format(Math.round(seconds / 86400), "day");
}

type RelativeUnit = "second" | "minute" | "hour" | "day";

/**
 * Intl.RelativeTimeFormat, or the same English wording where it's missing: Hermes, the app's
 * JavaScript engine on Android, doesn't have it.
 */
function relativeFormatter(): (value: number, unit: RelativeUnit) => string {
  if (typeof Intl.RelativeTimeFormat === "function") {
    const rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });
    return (value, unit) => rtf.format(value, unit);
  }
  return (value, unit) => {
    if (value === 0) return unit === "day" ? "today" : unit === "second" ? "now" : `this ${unit}`;
    if (unit === "day" && Math.abs(value) === 1) return value < 0 ? "yesterday" : "tomorrow";
    const n = Math.abs(value);
    const amount = `${n} ${unit}${n === 1 ? "" : "s"}`;
    return value < 0 ? `${amount} ago` : `in ${amount}`;
  };
}

/** 1,284 · 12.9K · 4.2M, for stat tiles. */
export function formatCount(value: number): string {
  if (Math.abs(value) < 10_000) return value.toLocaleString("en-IN");
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** The price as a listing's purpose reads it: ₹1.2 Cr · ₹32,000/mo · from ₹9,500/bed. */
export function formatListingPrice(price: number | null, purpose: string): string {
  if (price === null) return "—";
  if (purpose === "pg") return `from ${formatPrice(price, { compact: false })}/bed`;
  if (purpose === "stay") return `${formatPrice(price, { compact: false })}/night`;
  if (purpose === "rent" || purpose === "lease") return `${formatPrice(price, { compact: false })}/mo`;
  return formatPrice(price);
}

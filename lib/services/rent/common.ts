import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/authz/actor";
import type { DbOrTx, Tx } from "@/lib/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { conflict } from "@/lib/errors";
import { paymentDriver } from "@/lib/payments";
import { type ListingRecord, findListingInScope } from "@/lib/services/listings/access";
import { getSetting } from "@/lib/services/settings";

/** Shared by the rent services (landlords, tenancies, payments). */

export type Row = Record<string, unknown>;
export const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
export const num = (v: unknown) => Number(v ?? 0);
export const absoluteUrl = (path: string) => new URL(path, env.BETTER_AUTH_URL).toString();

/** Rent is collected for these listings: homes and offices let by the month. */
export const RENTABLE_PURPOSES = ["rent", "lease"] as const;
export const isRentable = (purpose: string) => (RENTABLE_PURPOSES as readonly string[]).includes(purpose);

/** Today in India, as YYYY-MM-DD: rent falls due on Indian calendar days. */
export const TODAY_IST = sql`(now() AT TIME ZONE 'Asia/Kolkata')::date`;

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^[+]?[0-9]{10,15}$/, "Enter a phone number with 10 to 15 digits"));

/** Is rent collected online now: switched on, with a payment provider to take it? */
export async function rentOnline(tx: DbOrTx = db) {
  return (await getSetting("payments.rent_online", tx)) && paymentDriver() !== null;
}

/**
 * A rented listing in the agent's scope, for landlord and tenancy work. Anything but a removed
 * listing: a landlord can be added while the property is still being onboarded.
 */
export async function rentListing(actor: Actor, listingReferenceId: string, permission: "landlords.invite" | "tenancies.manage", tx?: Tx): Promise<ListingRecord> {
  const listing = await findListingInScope(actor, listingReferenceId, permission, { tx, lock: Boolean(tx) });
  if (!isRentable(listing.transactionType)) throw conflict("Rent is collected only for properties let by the month.");
  if (listing.status === "removed") throw conflict("This listing was removed.");
  return listing;
}

/** Names compared loosely: case, spaces, punctuation and initials. "S. Paul" matches "SURAJ PAUL". */
export function namesMatch(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !["MR", "MRS", "MS", "DR", "SHRI", "SMT", "KUMARI"].includes(w));
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const used = new Set<number>();
  let full = 0;
  for (const w of short) {
    const i = long.findIndex((l, k) => !used.has(k) && (l === w || (w.length === 1 && l.startsWith(w)) || (l.length === 1 && w.startsWith(l))));
    if (i < 0) return false;
    used.add(i);
    if (w.length > 1 && long[i].length > 1) full++;
  }
  // At least one whole word in common, so two sets of initials don't match by themselves.
  return full >= 1;
}

export const maskVpa = (vpa: string) => {
  const [user, host] = vpa.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(2, user.length - 2))}@${host}`;
};
export const maskPan = (pan: string) => `${"•".repeat(5)}${pan.slice(5, 9)}${pan.slice(9)}`;

/** The first four letters of an IFSC name the bank. The common ones, for showing the account back. */
export const BANKS: Record<string, string> = {
  SBIN: "State Bank of India",
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  PUNB: "Punjab National Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  UBIN: "Union Bank of India",
  IDIB: "Indian Bank",
  BKID: "Bank of India",
  YESB: "Yes Bank",
  INDB: "IndusInd Bank",
  IDFB: "IDFC FIRST Bank",
  FDRL: "Federal Bank",
  MAHB: "Bank of Maharashtra",
  IOBA: "Indian Overseas Bank",
  UCBA: "UCO Bank",
  CBIN: "Central Bank of India",
  AUBL: "AU Small Finance Bank",
};

export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

/** The next working day after a date (Sundays skipped), for when a settlement is due. */
export function nextWorkingDay(from: Date): string {
  const d = new Date(from.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

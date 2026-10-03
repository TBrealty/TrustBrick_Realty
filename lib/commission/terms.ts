/**
 * Commission, in words and numbers. Shared by server and client: the calculation here is the
 * one the ledger records, and the wording is what partners agree to.
 */
import type { CloseOutcome, CommissionBasis, CommissionService } from "@/lib/vocab";

export const COMMISSION_SERVICE_LABELS: Record<CommissionService, string> = {
  sale: "Sales",
  rent: "Rentals",
  lease: "Leases",
  pg: "PGs",
  stay: "Home Stay",
};

export const COMMISSION_BASIS_LABELS: Record<CommissionBasis, string> = {
  brokerage: "of the agent's brokerage",
  deal_value: "of the deal value",
};

/** What "the deal value" is for each service. */
const DEAL_VALUE: Record<CommissionService, string> = {
  sale: "the sale price",
  rent: "a month's rent",
  lease: "a month's rent",
  pg: "the first month's rent per tenant",
  stay: "each booking",
};

/** When a charge is recorded, for each service, said to the partner ("you") or about them. */
export function whenCharged(service: CommissionService, you = true): string {
  const marks = you ? "you mark" : "the agent marks";
  switch (service) {
    case "sale":
      return `when ${marks} a listing sold, having closed the deal`;
    case "rent":
      return `when ${marks} a listing rented out, having closed the deal`;
    case "lease":
      return `when ${marks} a listing leased, having closed the deal`;
    case "pg":
      return "for each tenant who moves in (recorded by the Trustbrick team for now)";
    case "stay":
      return "when a guest checks in";
  }
}

export type Rate = { basis: CommissionBasis; percent: number };

/** e.g. "20% of your brokerage", "10% of each booking". */
export function describeRate(service: CommissionService, rate: Rate, you = true): string {
  const pct = `${Number(rate.percent.toFixed(2))}%`;
  return rate.basis === "brokerage" ? `${pct} of ${you ? "your" : "the agent's"} brokerage` : `${pct} of ${DEAL_VALUE[service]}`;
}

export const CLOSE_OUTCOME_LABELS: Record<CloseOutcome, { label: string; hint: string }> = {
  closed_deal: { label: "I closed the deal", hint: "Trustbrick's commission is worked out from the final price and your brokerage." },
  closed_elsewhere: { label: "Someone else closed it", hint: "The owner or another agent found the buyer or tenant. No commission." },
  off_market: { label: "The owner took it off the market", hint: "Not sold or let. No commission." },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CommissionCalc = { base: number; amount: number; gst: number; total: number };

/** The commission on a deal: the rate applied to the brokerage or the deal value, then GST on top. */
export function computeCommission(i: { basis: CommissionBasis; percent: number; dealValue: number; brokerage?: number | null; gstPercent: number }): CommissionCalc {
  const base = i.basis === "brokerage" ? (i.brokerage ?? 0) : i.dealValue;
  const amount = round2((base * i.percent) / 100);
  const gst = round2((amount * i.gstPercent) / 100);
  return { base, amount, gst, total: round2(amount + gst) };
}

/** GST on commission until the SuperAdmin sets it: 18%, the rate for a platform's service fee. */
export const DEFAULT_GST_PERCENT = 18;

/** The last twelve months, newest first, as YYYY-MM. */
export function recentMonths(): [string, string][] {
  const fmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    return [d.toISOString().slice(0, 7), fmt.format(d)];
  });
}

/** A rate in a few words, for a table cell: "20% of brokerage", "10% per booking". */
export function shortRate(service: CommissionService, rate: Rate): string {
  const pct = `${Number(rate.percent.toFixed(2))}%`;
  if (rate.basis === "brokerage") return `${pct} of brokerage`;
  return service === "stay" ? `${pct} per booking` : service === "pg" ? `${pct} of 1st month` : service === "sale" ? `${pct} of price` : `${pct} of a month's rent`;
}

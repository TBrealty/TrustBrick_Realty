/**
 * Brokerage, in words: the choices in the Pricing step, and how a saved choice reads on the
 * property page and card. Shared by server and client code.
 */
import type { BrokerageType } from "@/lib/vocab";

export const BROKERAGE_LABELS: Record<BrokerageType, string> = {
  none: "No brokerage",
  percent: "Percentage of the price",
  months_rent: "Months of rent",
  half_month: "Half a month's rent",
  fixed: "Fixed amount (₹)",
  flexible: "Flexible amount",
};

/** The choices that make sense for the purpose: months of rent only for rentals. */
export function brokerageChoices(purpose: string): BrokerageType[] {
  return purpose === "rent" || purpose === "lease" ? ["none", "half_month", "months_rent", "fixed", "flexible"] : ["none", "percent", "fixed", "flexible"];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** e.g. "1% of the price, negotiable", "Half a month's rent", "To be agreed". Null when not given. */
export function brokerageLabel(type: string | null, value: number | null, negotiable = false): string | null {
  if (!type) return null;
  const base =
    type === "none"
      ? "None"
      : type === "percent"
        ? `${value ?? "?"}% of the price`
        : type === "months_rent"
          ? value === 1
            ? "1 month's rent"
            : `${value ?? "?"} months' rent`
          : type === "half_month"
            ? "Half a month's rent"
            : type === "fixed"
              ? value !== null
                ? inr(value)
                : "A fixed amount"
              : type === "flexible"
                ? "Flexible, to be agreed"
                : type;
  return negotiable ? `${base}, negotiable` : base;
}

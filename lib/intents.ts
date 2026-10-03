/**
 * What someone is on Trustbrick to do. One vocabulary shared by the hero's
 * "I'm looking to…" selector, the signup form and the database check constraint,
 * so the three can never drift apart.
 *
 * PGs are a single intent. "PGs for Men / Women" is a search filter over a
 * listing's gender policy and is never stored against a person (decision D10).
 */
export const ACCOUNT_INTENTS = ["buy", "rent", "sell", "invest", "pg", "stay"] as const;

export type AccountIntent = (typeof ACCOUNT_INTENTS)[number];

export const INTENT_LABELS: Record<AccountIntent, string> = {
  buy: "Buy",
  rent: "Rent",
  sell: "Sell",
  invest: "Invest",
  pg: "PG",
  stay: "Stay",
};

export function isAccountIntent(value: unknown): value is AccountIntent {
  return typeof value === "string" && (ACCOUNT_INTENTS as readonly string[]).includes(value);
}

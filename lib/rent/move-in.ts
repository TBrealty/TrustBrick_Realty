/**
 * What moving into a rented home costs up front, and each month after. Pure functions,
 * shared by server and client. Customs (deposit, brokerage) vary by city and landlord, so
 * every figure here is the renter's own input; the page only suggests what's usual.
 */

export type Brokerage = "none" | "half" | "one";

export type MoveInInput = {
  rent: number;
  /** Security deposit, in months of rent. Refundable when you leave. */
  depositMonths: number;
  /** Rent paid in advance, usually the first month. */
  advanceMonths: number;
  brokerage: Brokerage;
  /** Monthly society maintenance, if the tenant pays it. */
  maintenance: number;
  /** Stamp paper, drafting and any registration of the agreement. */
  agreement: number;
  /** Packers and movers, a one-off. */
  moving: number;
  /** Length of the agreement, usually 11 months. */
  termMonths: number;
};

export type MoveInLine = { key: string; label: string; basis: string; amount: number; refundable: boolean };

export type MoveInResult = {
  lines: MoveInLine[];
  upfront: number;
  refundable: number;
  monthly: number;
  overTerm: number;
  /** TDS on rent (s.194-IB of the 1961 Act, s.393 of the Income-tax Act, 2025): an individual tenant paying more than ₹50,000 a month deducts TDS from the rent. */
  tdsApplies: boolean;
  /** For an HRA claim, the landlord's PAN is needed once the year's rent passes ₹1 lakh. */
  panForHra: boolean;
};

export const BROKERAGE_LABELS: Record<Brokerage, string> = {
  none: "None (direct from the owner)",
  half: "Half a month's rent",
  one: "One month's rent",
};

export function moveInCosts(i: MoveInInput): MoveInResult {
  const rent = Math.max(0, i.rent);
  const lines: MoveInLine[] = [];
  const add = (key: string, label: string, basis: string, amount: number, refundable = false) => amount > 0 && lines.push({ key, label, basis, amount, refundable });

  add("deposit", "Security deposit", `${i.depositMonths} ${i.depositMonths === 1 ? "month" : "months"} of rent, refundable`, rent * i.depositMonths, true);
  add("advance", "Rent in advance", `${i.advanceMonths} ${i.advanceMonths === 1 ? "month" : "months"}`, rent * i.advanceMonths);
  add("brokerage", "Brokerage", BROKERAGE_LABELS[i.brokerage], i.brokerage === "one" ? rent : i.brokerage === "half" ? rent / 2 : 0);
  add("agreement", "Rental agreement", "Stamp paper, drafting and registration, your estimate", i.agreement);
  add("moving", "Moving", "Packers and movers, your estimate", i.moving);

  const upfront = lines.reduce((a, l) => a + l.amount, 0);
  const monthly = rent + Math.max(0, i.maintenance);
  return {
    lines,
    upfront,
    refundable: lines.filter((l) => l.refundable).reduce((a, l) => a + l.amount, 0),
    monthly,
    overTerm: monthly * i.termMonths,
    tdsApplies: rent > 50_000,
    panForHra: rent * 12 > 1_00_000,
  };
}

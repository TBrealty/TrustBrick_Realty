/**
 * Rental yield on a property: what the rent returns on what the property costs. Pure
 * functions, shared by server and client. Pre-tax, and on the owner's own figures: the
 * page never predicts rents or prices.
 */

export type YieldInput = {
  price: number;
  monthlyRent: number;
  /** Months a year it's expected to stand empty. */
  vacancyMonths: number;
  /** Society maintenance the owner pays, per month. */
  maintenanceMonthly: number;
  propertyTaxYearly: number;
  /** Repairs, insurance and other upkeep, per year. */
  otherYearly: number;
  /** Stamp duty, registration and other buying costs, as a percentage of the price. */
  acquisitionPct: number;
};

export type YieldResult = {
  grossYieldPct: number;
  netYieldPct: number;
  rentCollected: number;
  costs: number;
  netIncome: number;
  investment: number;
  /** Years of net rent to earn back what was paid, or null if the net rent is nothing. */
  paybackYears: number | null;
};

export function rentalYield(i: YieldInput): YieldResult {
  const price = Math.max(0, i.price);
  const vacancy = Math.min(12, Math.max(0, i.vacancyMonths));
  const rentCollected = Math.max(0, i.monthlyRent) * (12 - vacancy);
  const costs = Math.max(0, i.maintenanceMonthly) * 12 + Math.max(0, i.propertyTaxYearly) + Math.max(0, i.otherYearly);
  const netIncome = rentCollected - costs;
  const investment = price * (1 + Math.max(0, i.acquisitionPct) / 100);
  return {
    grossYieldPct: price > 0 ? ((Math.max(0, i.monthlyRent) * 12) / price) * 100 : 0,
    netYieldPct: investment > 0 ? (netIncome / investment) * 100 : 0,
    rentCollected,
    costs,
    netIncome,
    investment,
    paybackYears: netIncome > 0 ? investment / netIncome : null,
  };
}

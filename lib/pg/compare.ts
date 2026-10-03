/**
 * A PG bed against a share of a rented flat: the monthly cost per person, and what each
 * takes up front. Pure functions, shared by server and client. Every figure is the user's
 * own input; the page only suggests typical starting points.
 */

export type CompareInput = {
  /** PG rent per bed, per month. */
  pgRent: number;
  pgMealsIncluded: boolean;
  /** Anything the PG charges on top: electricity, laundry. Per month. */
  pgExtras: number;
  pgDepositMonths: number;
  /** The whole flat's rent, per month. */
  flatRent: number;
  /** People sharing the flat, including you. */
  flatmates: number;
  flatDepositMonths: number;
  /** Electricity, internet and gas for the whole flat, per month. */
  flatUtilities: number;
  /** A cook or cleaner for the whole flat, per month. */
  flatHelp: number;
  /** Society maintenance for the whole flat, per month. */
  flatMaintenance: number;
  /** Brokerage on the flat, as a share of one month's rent (0, 0.5 or 1). */
  flatBrokerageMonths: number;
  /** Groceries and meals per person, per month, where food isn't included. */
  foodPerPerson: number;
};

export type Side = { monthly: number; upfront: number; lines: { label: string; amount: number }[] };
export type CompareResult = { pg: Side; flat: Side; cheaperMonthly: "pg" | "flat" | "same"; monthlyDifference: number };

export function comparePgAndFlat(i: CompareInput): CompareResult {
  const n = Math.max(1, Math.round(i.flatmates));
  const pgFood = i.pgMealsIncluded ? 0 : i.foodPerPerson;
  const pgLines = [
    { label: "Rent for your bed", amount: i.pgRent },
    { label: "Extras (electricity, laundry)", amount: i.pgExtras },
    { label: i.pgMealsIncluded ? "Food (included)" : "Food", amount: pgFood },
  ];
  const flatLines = [
    { label: `Your share of the rent (1 of ${n})`, amount: i.flatRent / n },
    { label: "Your share of utilities", amount: i.flatUtilities / n },
    { label: "Your share of a cook or cleaner", amount: i.flatHelp / n },
    { label: "Your share of maintenance", amount: i.flatMaintenance / n },
    { label: "Food", amount: i.foodPerPerson },
  ];
  const sum = (lines: { amount: number }[]) => lines.reduce((a, l) => a + l.amount, 0);
  const pg: Side = { monthly: sum(pgLines), upfront: i.pgRent * (i.pgDepositMonths + 1), lines: pgLines };
  const flat: Side = { monthly: sum(flatLines), upfront: (i.flatRent * (i.flatDepositMonths + 1 + i.flatBrokerageMonths)) / n, lines: flatLines };
  const diff = pg.monthly - flat.monthly;
  return { pg, flat, cheaperMonthly: Math.abs(diff) < 1 ? "same" : diff < 0 ? "pg" : "flat", monthlyDifference: Math.abs(diff) };
}

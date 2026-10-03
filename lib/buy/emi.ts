/**
 * Home-loan arithmetic for the EMI calculator. Pure functions, shared by server and client.
 * General information, not a loan offer: lenders set their own rates and terms.
 */

/** Monthly instalment on a reducing-balance loan. */
export function monthlyEmi(principal: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / n;
  const f = Math.pow(1 + r, n);
  return (principal * r * f) / (f - 1);
}

export type YearRow = { year: number; principal: number; interest: number; balance: number };

/** What is paid each year, and what is left owing at the end of it. */
export function yearlySchedule(principal: number, annualRatePct: number, years: number): YearRow[] {
  const n = Math.round(years * 12);
  const r = annualRatePct / 12 / 100;
  const emi = monthlyEmi(principal, annualRatePct, years);
  const rows: YearRow[] = [];
  let balance = principal;
  let year: YearRow = { year: 1, principal: 0, interest: 0, balance };
  for (let m = 1; m <= n && balance > 0.005; m++) {
    const interest = balance * r;
    const repaid = Math.min(emi - interest, balance);
    balance -= repaid;
    year.principal += repaid;
    year.interest += interest;
    year.balance = Math.max(balance, 0);
    if (m % 12 === 0 || m === n || balance <= 0.005) {
      rows.push(year);
      year = { year: year.year + 1, principal: 0, interest: 0, balance };
    }
  }
  return rows;
}

/**
 * The largest share of a home's value a bank may lend, under the Reserve Bank of India's
 * loan-to-value limits for individual housing loans: 90% up to ₹30 lakh, 80% up to
 * ₹75 lakh, 75% above that. Lenders may lend less.
 */
export function maxLoanToValue(propertyValue: number): number {
  if (propertyValue <= 30_00_000) return 0.9;
  if (propertyValue <= 75_00_000) return 0.8;
  return 0.75;
}

export type LoanSummary = {
  loan: number;
  emi: number;
  totalInterest: number;
  totalPaid: number;
  /** The smallest down payment the RBI limits allow for this price. */
  minDownPayment: number;
  /** True if the chosen loan is more than banks may lend on this price. */
  aboveLtv: boolean;
};

export function summarise(price: number, downPayment: number, annualRatePct: number, years: number): LoanSummary {
  const loan = Math.max(price - downPayment, 0);
  const emi = monthlyEmi(loan, annualRatePct, years);
  const totalPaid = emi * Math.round(years * 12);
  const ltv = maxLoanToValue(price);
  return {
    loan,
    emi,
    totalInterest: Math.max(totalPaid - loan, 0),
    totalPaid,
    minDownPayment: Math.ceil(price * (1 - ltv)),
    aboveLtv: price > 0 && loan > price * ltv + 0.5,
  };
}

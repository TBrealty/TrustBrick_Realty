import { describe, expect, it } from "vitest";
import { buyingCosts, placeFor } from "@/lib/buy/costs";
import { maxLoanToValue, monthlyEmi, summarise, yearlySchedule } from "@/lib/buy/emi";

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;
const cost = (price: number, place: string, extra: Partial<Parameters<typeof buyingCosts>[0]> = {}) =>
  buyingCosts({ price, place, buyer: "man", underConstruction: false, affordable: false, brokeragePct: 0, paperwork: 0, ...extra });
const line = (r: ReturnType<typeof buyingCosts>, key: string) => r.lines.find((l) => l.key === key)?.amount;

describe("EMI", () => {
  it("matches the standard reducing-balance formula", () => {
    // ₹50 lakh at 8.5% over 20 years is the textbook ₹43,391.
    expect(monthlyEmi(50 * LAKH, 8.5, 20)).toBeCloseTo(43391.16, 1);
    expect(monthlyEmi(12 * LAKH, 0, 10)).toBeCloseTo(10000, 6);
    expect(monthlyEmi(0, 8.5, 20)).toBe(0);
  });

  it("repays the whole loan, year by year", () => {
    const rows = yearlySchedule(50 * LAKH, 8.5, 20);
    expect(rows).toHaveLength(20);
    expect(rows.reduce((a, r) => a + r.principal, 0)).toBeCloseTo(50 * LAKH, 0);
    expect(rows.at(-1)!.balance).toBeLessThan(1);
    // Interest outweighs principal early on, and the reverse at the end.
    expect(rows[0].interest).toBeGreaterThan(rows[0].principal);
    expect(rows.at(-1)!.principal).toBeGreaterThan(rows.at(-1)!.interest);
  });

  it("applies the RBI loan-to-value limits", () => {
    expect(maxLoanToValue(30 * LAKH)).toBe(0.9);
    expect(maxLoanToValue(30 * LAKH + 1)).toBe(0.8);
    expect(maxLoanToValue(75 * LAKH)).toBe(0.8);
    expect(maxLoanToValue(1 * CRORE)).toBe(0.75);
    const tooMuch = summarise(1 * CRORE, 10 * LAKH, 8.5, 20);
    expect(tooMuch.aboveLtv).toBe(true);
    expect(tooMuch.minDownPayment).toBe(25 * LAKH);
    expect(summarise(1 * CRORE, 25 * LAKH, 8.5, 20).aboveLtv).toBe(false);
  });
});

describe("buying costs", () => {
  it("Hyderabad: 4% stamp duty, 1.5% transfer duty, 0.5% registration", () => {
    const r = cost(1 * CRORE, "hyderabad");
    expect(line(r, "stamp")).toBe(4 * LAKH);
    expect(line(r, "Transfer duty")).toBe(1.5 * LAKH);
    expect(line(r, "registration")).toBe(0.5 * LAKH);
    expect(r.government).toBe(6 * LAKH);
  });

  it("Bengaluru: slab stamp duty, cess and surcharge on the duty, 2% registration", () => {
    const r = cost(50 * LAKH, "bengaluru");
    expect(line(r, "stamp")).toBe(2.5 * LAKH);
    expect(r.government).toBeCloseTo(3.8 * LAKH, 6); // 2.5 L + 25,000 cess + 5,000 surcharge + 1 L registration
    expect(line(cost(40 * LAKH, "bengaluru"), "stamp")).toBe(1.2 * LAKH);
    expect(line(cost(15 * LAKH, "bengaluru"), "stamp")).toBe(30_000);
  });

  it("Maharashtra: metro rates, 1% less for a woman buying alone, registration capped at ₹30,000", () => {
    expect(line(cost(1 * CRORE, "mumbai"), "stamp")).toBe(6 * LAKH);
    expect(line(cost(1 * CRORE, "mumbai", { buyer: "woman" }), "stamp")).toBe(5 * LAKH);
    expect(line(cost(1 * CRORE, "mumbai"), "registration")).toBe(30_000);
    expect(line(cost(20 * LAKH, "pune"), "registration")).toBe(20_000);
    expect(line(cost(80 * LAKH, "pune"), "stamp")).toBe(5.6 * LAKH);
  });

  it("Goa: slab stamp duty, and a registration rate flagged as uncertain", () => {
    const r = cost(60 * LAKH, "north_goa");
    expect(line(r, "stamp")).toBe(2.4 * LAKH);
    expect(r.place.uncertain).toBeTruthy();
  });

  it("adds GST only while under construction, at 1% for affordable homes up to ₹45 lakh", () => {
    expect(line(cost(1 * CRORE, "hyderabad"), "gst")).toBeUndefined();
    expect(line(cost(1 * CRORE, "hyderabad", { underConstruction: true }), "gst")).toBe(5 * LAKH);
    expect(line(cost(40 * LAKH, "hyderabad", { underConstruction: true, affordable: true }), "gst")).toBe(40_000);
    // Too expensive to count as affordable, whatever the box says.
    expect(line(cost(60 * LAKH, "hyderabad", { underConstruction: true, affordable: true }), "gst")).toBe(3 * LAKH);
  });

  it("adds the buyer's own estimates, and flags TDS from ₹50 lakh", () => {
    const r = cost(1 * CRORE, "hyderabad", { brokeragePct: 1, paperwork: 15_000 });
    expect(r.other).toBe(1 * LAKH + 15_000);
    expect(r.allIn).toBe(1 * CRORE + r.government + r.other);
    expect(cost(50 * LAKH, "hyderabad").tds).toBe(50_000);
    expect(cost(49 * LAKH, "hyderabad").tds).toBeNull();
  });

  it("finds a listing's state from its city", () => {
    expect(placeFor("North Goa")).toBe("north_goa");
    expect(placeFor("Hyderabad")).toBe("hyderabad");
    expect(placeFor("Chennai")).toBeUndefined();
  });
});

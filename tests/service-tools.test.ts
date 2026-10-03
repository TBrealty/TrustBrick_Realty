import { describe, expect, it } from "vitest";
import { rentalYield } from "@/lib/invest/yield";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { comparePgAndFlat } from "@/lib/pg/compare";
import { moveInCosts } from "@/lib/rent/move-in";
import { isWeekendNight, splitStay } from "@/lib/stays/split";

describe("rent: move-in costs", () => {
  const base = { rent: 30_000, depositMonths: 3, advanceMonths: 1, brokerage: "one" as const, maintenance: 2_000, agreement: 2_000, moving: 0, termMonths: 11 };

  it("adds the deposit, advance, brokerage and agreement, and says what comes back", () => {
    const r = moveInCosts(base);
    expect(r.upfront).toBe(90_000 + 30_000 + 30_000 + 2_000);
    expect(r.refundable).toBe(90_000);
    expect(r.monthly).toBe(32_000);
    expect(r.overTerm).toBe(32_000 * 11);
    expect(r.lines.map((l) => l.key)).toEqual(["deposit", "advance", "brokerage", "agreement"]);
  });

  it("drops lines that cost nothing, and halves brokerage when asked", () => {
    expect(moveInCosts({ ...base, brokerage: "none" }).lines.some((l) => l.key === "brokerage")).toBe(false);
    expect(moveInCosts({ ...base, brokerage: "half" }).lines.find((l) => l.key === "brokerage")?.amount).toBe(15_000);
  });

  it("flags TDS above ₹50,000 a month, and the landlord's PAN for HRA above ₹1 lakh a year", () => {
    expect(moveInCosts({ ...base, rent: 50_000 }).tdsApplies).toBe(false);
    expect(moveInCosts({ ...base, rent: 50_001 }).tdsApplies).toBe(true);
    expect(moveInCosts({ ...base, rent: 8_000 }).panForHra).toBe(false);
    expect(moveInCosts({ ...base, rent: 8_500 }).panForHra).toBe(true);
  });
});

describe("PGs: PG or shared flat", () => {
  const base = {
    pgRent: 10_000,
    pgMealsIncluded: true,
    pgExtras: 500,
    pgDepositMonths: 1,
    flatRent: 30_000,
    flatmates: 3,
    flatDepositMonths: 3,
    flatUtilities: 3_000,
    flatHelp: 3_000,
    flatMaintenance: 0,
    flatBrokerageMonths: 1,
    foodPerPerson: 6_000,
  };

  it("splits the flat's costs between the people sharing it", () => {
    const r = comparePgAndFlat(base);
    expect(r.pg.monthly).toBe(10_500);
    expect(r.flat.monthly).toBe(10_000 + 1_000 + 1_000 + 6_000);
    expect(r.cheaperMonthly).toBe("pg");
    expect(r.monthlyDifference).toBe(7_500);
  });

  it("adds food to the PG only when meals aren't included, and works out the money up front", () => {
    expect(comparePgAndFlat({ ...base, pgMealsIncluded: false }).pg.monthly).toBe(16_500);
    const r = comparePgAndFlat(base);
    expect(r.pg.upfront).toBe(20_000); // one month's deposit and the first month
    expect(r.flat.upfront).toBe(50_000); // (3 deposit + 1 first month + 1 brokerage) × ₹30,000 ÷ 3
  });
});

describe("invest: rental yield", () => {
  const base = { price: 1_00_00_000, monthlyRent: 50_000, vacancyMonths: 0, maintenanceMonthly: 0, propertyTaxYearly: 0, otherYearly: 0, acquisitionPct: 0 };

  it("gives a gross yield of a year's rent over the price", () => {
    const r = rentalYield(base);
    expect(r.grossYieldPct).toBeCloseTo(6, 6);
    expect(r.netYieldPct).toBeCloseTo(6, 6);
    expect(r.paybackYears).toBeCloseTo(100 / 6, 6);
  });

  it("takes off empty months and costs, and adds buying costs to what you paid", () => {
    const r = rentalYield({ ...base, vacancyMonths: 1, maintenanceMonthly: 5_000, propertyTaxYearly: 10_000, otherYearly: 20_000, acquisitionPct: 7 });
    expect(r.rentCollected).toBe(5_50_000);
    expect(r.costs).toBe(90_000);
    expect(r.netIncome).toBe(4_60_000);
    expect(r.investment).toBe(1_07_00_000);
    expect(r.netYieldPct).toBeCloseTo((4_60_000 / 1_07_00_000) * 100, 6);
    expect(r.grossYieldPct).toBeCloseTo(6, 6);
  });

  it("never pays back when costs swallow the rent", () => {
    expect(rentalYield({ ...base, monthlyRent: 1_000, maintenanceMonthly: 2_000 }).paybackYears).toBeNull();
  });
});

describe("every service has its own tools", () => {
  it("links each tool inside its own service", () => {
    for (const [kind, prefix] of [
      ["buy", "/buy/"],
      ["rent", "/rent/"],
      ["pg", "/pg/"],
      ["invest", "/invest/"],
    ] as const) {
      const tools = SERVICE_SHELLS[kind]!.tools;
      expect(tools.length, kind).toBeGreaterThanOrEqual(2);
      for (const t of tools) expect(t.href.startsWith(prefix), `${kind}: ${t.href}`).toBe(true);
    }
  });
});

describe("home stay: split the cost", () => {
  // 2 October 2026 is a Friday.
  const base = { nightly: 6_000, weekendPrice: 8_000, checkIn: "2026-10-02", nights: 2, cleaningFee: 1_000, people: 4, extrasPerPersonPerDay: 0 };

  it("prices Friday and Saturday nights at the weekend rate, as bookings are priced", () => {
    expect(isWeekendNight("2026-10-02")).toBe(true); // Friday
    expect(isWeekendNight("2026-10-03")).toBe(true); // Saturday
    expect(isWeekendNight("2026-10-04")).toBe(false); // Sunday
    const r = splitStay(base);
    expect([r.weekdayNights, r.weekendNights]).toEqual([0, 2]);
    expect(r.checkOut).toBe("2026-10-04");
    expect(r.total).toBe(2 * 8_000 + 1_000);
    expect(r.perPerson).toBe(17_000 / 4);
    expect(r.perPersonPerNight).toBe(17_000 / 4 / 2);
  });

  it("mixes weekday and weekend nights, and uses the nightly price when there's no weekend price", () => {
    const thursday = splitStay({ ...base, checkIn: "2026-10-01", nights: 3 });
    expect([thursday.weekdayNights, thursday.weekendNights]).toEqual([1, 2]);
    expect(thursday.stay).toBe(6_000 + 2 * 8_000);
    expect(splitStay({ ...base, weekendPrice: null }).stay).toBe(12_000);
  });

  it("adds food and travel per person per day", () => {
    const r = splitStay({ ...base, extrasPerPersonPerDay: 1_500 });
    expect(r.extrasPerPerson).toBe(3_000);
    expect(r.tripPerPerson).toBe(17_000 / 4 + 3_000);
  });
});

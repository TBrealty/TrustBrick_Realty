import { describe, expect, it } from "vitest";
import { cancellationCutoff, checkInMoment, payoutReleaseAt, policyTimeline, refundFor, refundSplit, splitPayment } from "@/lib/payments/rules";

describe("splitting a payment", () => {
  it("₹1,700 at 12% with 18% GST: ₹204 commission, ₹36.72 GST, ₹1,459.28 to the host", () => {
    expect(splitPayment(1700, 12, 18)).toEqual({ gross: 1700, commission: 204, gst: 36.72, hostShare: 1459.28 });
  });

  it("rounds to the paisa and always adds back up", () => {
    for (const [gross, pct, gst] of [
      [999.99, 12, 18],
      [1, 12, 18],
      [12345.67, 10, 18],
      [5000, 0, 18],
      [7777, 12.5, 0],
    ] as const) {
      const s = splitPayment(gross, pct, gst);
      expect(Math.round((s.commission + s.gst + s.hostShare) * 100)).toBe(Math.round(gross * 100));
      expect(s.hostShare).toBeGreaterThanOrEqual(0);
    }
    expect(splitPayment(0, 12, 18)).toEqual({ gross: 0, commission: 0, gst: 0, hostShare: 0 });
  });
});

describe("refunds", () => {
  const checkIn = "2026-12-20";
  const at = (iso: string) => new Date(iso);

  it("cut-offs count back from check-in time, India time", () => {
    expect(checkInMoment(checkIn, "14:00").toISOString()).toBe("2026-12-20T08:30:00.000Z");
    expect(cancellationCutoff("flexible", checkIn, "14:00").toISOString()).toBe("2026-12-19T08:30:00.000Z");
    expect(cancellationCutoff("moderate", checkIn, "14:00").toISOString()).toBe("2026-12-15T08:30:00.000Z");
    expect(cancellationCutoff("strict", checkIn, "14:00").toISOString()).toBe("2026-12-06T08:30:00.000Z");
  });

  it("a guest gets everything back before the cut-off, half after it on flexible and moderate, nothing on strict", () => {
    const base = { paid: 1700, held: false, checkIn, checkInTime: "14:00", cancelledBy: "guest" as const };
    expect(refundFor({ ...base, policy: "moderate", now: at("2026-12-14T00:00:00Z") })).toMatchObject({ kind: "full", refund: 1700, kept: 0 });
    // Exactly at the cut-off is already late.
    expect(refundFor({ ...base, policy: "moderate", now: at("2026-12-15T08:30:00Z") })).toMatchObject({ kind: "partial", refund: 850, kept: 850 });
    expect(refundFor({ ...base, policy: "flexible", now: at("2026-12-19T08:29:59Z") })).toMatchObject({ kind: "full", refund: 1700 });
    expect(refundFor({ ...base, policy: "flexible", now: at("2026-12-19T09:00:00Z") })).toMatchObject({ kind: "partial", refund: 850 });
    expect(refundFor({ ...base, policy: "strict", now: at("2026-12-10T00:00:00Z") })).toMatchObject({ kind: "none", refund: 0, kept: 1700 });
    expect(refundFor({ ...base, policy: "strict", now: at("2026-12-01T00:00:00Z") })).toMatchObject({ kind: "full", refund: 1700 });
  });

  it("the host or Trustbrick cancelling always refunds in full; a held payment is just released", () => {
    const late = { policy: "strict" as const, paid: 1700, checkIn, checkInTime: "14:00", now: at("2026-12-19T00:00:00Z") };
    expect(refundFor({ ...late, held: false, cancelledBy: "host" })).toMatchObject({ kind: "full", refund: 1700 });
    expect(refundFor({ ...late, held: false, cancelledBy: "admin" })).toMatchObject({ kind: "full", refund: 1700 });
    expect(refundFor({ ...late, held: true, cancelledBy: "guest" })).toMatchObject({ kind: "release", refund: 1700, kept: 0 });
  });

  it("half back on ₹1,700: ₹729.64 from the host's share, ₹120.36 from Trustbrick's", () => {
    const r = refundSplit(splitPayment(1700, 12, 18), 850, 12, 18);
    expect(r).toMatchObject({ amount: 850, hostShare: 729.64, platformShare: 120.36 });
    expect(r.after).toEqual({ gross: 850, commission: 102, gst: 18.36, hostShare: 729.64 });
    // A full refund takes all of both.
    expect(refundSplit(splitPayment(1700, 12, 18), 1700, 12, 18)).toMatchObject({ amount: 1700, hostShare: 1459.28, platformShare: 240.72 });
    // Never more than what's left.
    expect(refundSplit(splitPayment(1700, 12, 18), 5000, 12, 18).amount).toBe(1700);
  });

  it("odd amounts still share out exactly", () => {
    for (const [gross, refund] of [
      [1234.57, 617.29],
      [99.99, 0.01],
      [8000, 3999.99],
    ]) {
      const r = refundSplit(splitPayment(gross, 12, 18), refund, 12, 18);
      expect(Math.round((r.hostShare + r.platformShare) * 100)).toBe(Math.round(r.amount * 100));
      expect(r.hostShare).toBeGreaterThanOrEqual(0);
      expect(r.platformShare).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("dates", () => {
  it("pays the host a day after check-in", () => {
    expect(payoutReleaseAt("2026-12-20", "14:00").toISOString()).toBe("2026-12-21T08:30:00.000Z");
  });

  it("lays the policy out as dated steps", () => {
    const steps = policyTimeline("moderate", "2026-12-20", "14:00", new Date("2026-12-01T00:00:00Z"));
    expect(steps.map((s) => [s.label, s.refundPercent])).toEqual([
      ["Full refund", 100],
      ["50% refund", 50],
    ]);
    // Booked after the cut-off: only the late step.
    expect(policyTimeline("strict", "2026-12-20", "14:00", new Date("2026-12-18T00:00:00Z")).map((s) => s.label)).toEqual(["No refund"]);
  });
});

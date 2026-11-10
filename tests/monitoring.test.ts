import { describe, expect, it } from "vitest";
import { CAPS, HOUR_MS, decide, fingerprint, isNoise, newThrottleState, normaliseMessage } from "@/lib/monitoring/throttle";

describe("error alert grouping", () => {
  it("treats the same fault with different IDs and numbers as one error", () => {
    const a = fingerprint("server", "Listing LST-7K4M9Q2X not found after 3 tries", "Error: x\n    at getListing (/app/lib/q.js:10:5)");
    const b = fingerprint("server", "Listing LST-AB12CD34 not found after 5 tries", "Error: x\n    at getListing (/app/lib/q.js:88:17)");
    expect(a).toBe(b);
    expect(normaliseMessage("user 0191f7a2-1c2d-7e3f-8a9b-0c1d2e3f4a5b failed")).toBe("user <id> failed");
  });

  it("keeps different faults, and the same fault from server and browser, apart", () => {
    expect(fingerprint("server", "Database timeout")).not.toBe(fingerprint("server", "Payment failed"));
    expect(fingerprint("server", "Boom")).not.toBe(fingerprint("browser", "Boom"));
  });
});

describe("error alert throttling", () => {
  it("emails a group once an hour and counts what it held back", () => {
    const state = newThrottleState();
    const t0 = Date.UTC(2026, 10, 10);
    expect(decide(state, "server", "g", t0)).toEqual({ send: true, heldBack: 0 });
    expect(decide(state, "server", "g", t0 + 1000).send).toBe(false);
    expect(decide(state, "server", "g", t0 + 2000).send).toBe(false);
    expect(decide(state, "server", "g", t0 + HOUR_MS + 1)).toEqual({ send: true, heldBack: 2 });
  });

  it("caps each source per hour, separately", () => {
    const state = newThrottleState();
    const t0 = Date.UTC(2026, 10, 10);
    for (let i = 0; i < CAPS.browser; i++) expect(decide(state, "browser", `b${i}`, t0 + i).send).toBe(true);
    expect(decide(state, "browser", "one-too-many", t0 + 100).send).toBe(false);
    // A flood of browser errors doesn't stop server errors.
    expect(decide(state, "server", "s", t0 + 200).send).toBe(true);
    // An hour later the browser cap has room again.
    expect(decide(state, "browser", "later", t0 + HOUR_MS + 500).send).toBe(true);
  });
});

describe("browser error noise", () => {
  it("drops what isn't ours or isn't a real fault", () => {
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("x is undefined", "at foo (chrome-extension://abc/content.js:1:1)")).toBe(true);
    expect(isNoise("ChunkLoadError: Loading chunk 123 failed.")).toBe(true);
  });

  it("keeps real errors", () => {
    expect(isNoise("Cannot read properties of undefined (reading 'price')", "at ListingCard (https://trustbrick.org/_next/static/chunks/a.js:1:2)")).toBe(false);
  });
});

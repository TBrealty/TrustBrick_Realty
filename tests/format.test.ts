import { expect, test } from "vitest";
import { relativeTime } from "@/lib/format";

// The app runs lib/format.ts on Hermes, which has no Intl.RelativeTimeFormat: the fallback has to
// read exactly like the browser's wording.
test("relativeTime reads the same without Intl.RelativeTimeFormat", () => {
  const now = Date.UTC(2026, 9, 8, 6, 0, 0);
  const offsets = [0, -1, -5, -59, -60, -61, -90, -3599, -3600, -7200, -86399, -86400, -129600, -172800, -6 * 86400, 1, 30, 120, 3600, 86400, 2 * 86400];
  const at = () => offsets.map((s) => relativeTime(new Date(now + s * 1000), now));
  const withIntl = at();
  expect(withIntl.slice(0, 3)).toEqual(["now", "1 second ago", "5 seconds ago"]);

  const intl = Intl as unknown as Record<string, unknown>;
  const original = intl.RelativeTimeFormat;
  delete intl.RelativeTimeFormat; // as on Hermes
  try {
    expect(at()).toEqual(withIntl);
  } finally {
    intl.RelativeTimeFormat = original;
  }
});

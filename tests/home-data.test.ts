import { afterEach, describe, expect, it, vi } from "vitest";
import { homeData } from "@/lib/listings/home";
import * as queries from "@/lib/listings/queries";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the landing page's listings", () => {
  it("never makes a visitor wait for the database once it has a copy", async () => {
    const first = await homeData();
    // Within the minute: the same copy, and no query.
    const search = vi.spyOn(queries, "searchListings");
    expect(await homeData()).toBe(first);
    expect(search).not.toHaveBeenCalled();

    // A minute later: the old copy straight away, refreshed in the background.
    const later = Date.now() + 61_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const stale = await homeData();
    expect(stale).toBe(first);
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    await vi.waitFor(async () => expect(await homeData()).not.toBe(first));
  });
});

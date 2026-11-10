import { describe, expect, it } from "vitest";
import { isReservedAddress } from "@/lib/email/send";

describe("email to test addresses", () => {
  it("never goes to reserved domains, which can't receive mail", () => {
    for (const to of ["superadmin@trustbrick.test", "a@x.example", "b@nowhere.invalid", "c@localhost", "d@example.com", "e@mail.example.org", " F@Trustbrick.TEST "]) {
      expect(isReservedAddress(to), to).toBe(true);
    }
  });

  it("still goes to real addresses", () => {
    for (const to of ["owner@gmail.com", "ops@trustbrick.org", "x@testing.in", "y@mytest.co", "z@example-homes.com"]) {
      expect(isReservedAddress(to), to).toBe(false);
    }
  });
});

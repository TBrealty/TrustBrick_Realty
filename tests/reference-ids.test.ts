import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isReferenceId, normalizeReferenceId, parseReferenceId } from "@/lib/reference";
import { makeUser, one } from "./support/factory";

describe("reference IDs", () => {
  it("are PREFIX- plus eight Crockford base32 characters", async () => {
    const row = await one<{ id: string }>(sql`SELECT platform.gen_reference_id('PRP') AS id`);
    expect(row.id).toMatch(/^PRP-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("are unique across a large batch and not sequential", async () => {
    const { rows } = await db.execute(sql`SELECT platform.gen_reference_id('LST') AS id FROM generate_series(1, 5000)`);
    const ids = (rows as { id: string }[]).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids.slice(0, 20)].sort()).not.toEqual(ids.slice(0, 20));
  });

  it("are assigned by the database to new users", async () => {
    const user = await makeUser("Reference Holder");
    expect(isReferenceId(user.referenceId, "USR")).toBe(true);
  });

  it("are immutable once issued", async () => {
    const user = await makeUser("Immutable");
    await expect(db.execute(sql`UPDATE identity.users SET reference_id = 'USR-00000000' WHERE id = ${user.id}`)).rejects.toThrow();
  });

  it("reject malformed prefixes in the generator", async () => {
    await expect(db.execute(sql`SELECT platform.gen_reference_id('x; drop')`)).rejects.toThrow();
  });

  it("normalise what people type", () => {
    expect(normalizeReferenceId("  prp-7k4m9q2x ")).toBe("PRP-7K4M9Q2X");
    expect(normalizeReferenceId("lst-o0il1abc")).toBe("LST-00111ABC");
    expect(parseReferenceId("agt-4m8p2k7q")?.prefix).toBe("AGT");
    expect(parseReferenceId("XYZ-4M8P2K7Q")).toBeNull();
    expect(isReferenceId("LST-7K4M9Q2X", "PRP")).toBe(false);
  });
});

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { AppError } from "@/lib/errors";
import { LEGAL_SHELL, otherServices } from "@/lib/listings/services";
import { transitionListing } from "@/lib/services/listings/lifecycle";
import { applyForLegalVerification, listLegalRequests, listOwnLegalRequests, listingForLegal, updateLegalRequest } from "@/lib/services/legal";
import { ctx, makeAdmin, makeHost, makeUser, one } from "./support/factory";
import { readyStay } from "./support/listings";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const fields = (p: Promise<unknown>) => p.then(() => ({})).catch((e: unknown) => (e instanceof AppError ? (e.fieldErrors ?? {}) : { threw: String(e) }));

let n = 0;
/** A fresh IP each time, so the rate limit never gets in the way of the other tests. */
const sender = (userId: string | null = null) => ({ userId, ipKey: `test-legal-${Date.now()}-${n++}` });
const form = (overrides: Record<string, unknown> = {}) => ({
  service: "title_opinion",
  purpose: "buying",
  propertyType: "apartment",
  state: "telangana",
  location: "Kondapur, Hyderabad",
  documents: ["sale_deed", "encumbrance"],
  name: "Legal Applicant",
  email: `legal.${Date.now()}.${n++}@example.test`,
  phone: "98765 43210",
  consent: "yes",
  ...overrides,
});

let admin: Actor;
let support: Actor;
let applicant: Awaited<ReturnType<typeof makeUser>>;
let listing: string;

beforeAll(async () => {
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  support = await (await makeAdmin(["support.view"])).actor();
  applicant = await makeUser("Legal Applicant");
  const host = await (await makeHost("Legal Host", { verified: true })).actor();
  const moderator = await (await makeAdmin(ADMIN_PRESETS.moderation.permissions)).actor();
  listing = await readyStay(host, { title: "Legal test villa in Calangute" });
  await transitionListing(host, listing, "submit", {}, ctx);
  await transitionListing(moderator, listing, "approve", { reason: "Checked the details and photos." }, ctx);
});

describe("legal verification: applying", () => {
  it("takes a request from anyone, tidies the phone, and tells the team", async () => {
    const before = (await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE type = 'legal_request'`)).n;
    const { referenceId } = await applyForLegalVerification(form({ documents: "sale_deed" }), sender());
    expect(referenceId).toMatch(/^LGL-/);
    const row = await one<{ phone: string; documents: string[]; status: string; user_id: string | null }>(
      sql`SELECT phone, documents, status, user_id FROM platform.legal_requests WHERE reference_id = ${referenceId}`,
    );
    expect(row).toMatchObject({ phone: "9876543210", documents: ["sale_deed"], status: "new", user_id: null });
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE type = 'legal_request'`)).n).toBeGreaterThan(before);
  });

  it("needs a phone number and consent, and checks every choice", async () => {
    expect(await fields(applyForLegalVerification(form({ phone: "", consent: undefined }), sender()))).toMatchObject({ phone: expect.any(String), consent: expect.any(String) });
    expect(await fields(applyForLegalVerification(form({ service: "notary", state: "kerala" }), sender()))).toMatchObject({ service: expect.any(String), state: expect.any(String) });
    expect(await fields(applyForLegalVerification(form({ documents: ["sale_deed", "aadhaar"] }), sender()))).toHaveProperty(["documents.1"]);
  });

  it("links a live Trustbrick listing, and refuses a reference that isn't one", async () => {
    const found = await listingForLegal(listing);
    expect(found).toMatchObject({ referenceId: listing, title: "Legal test villa in Calangute", state: "goa" });

    const { referenceId } = await applyForLegalVerification(form({ listing: listing.toLowerCase(), state: "goa" }), sender(applicant.id));
    const row = await one<{ listing_id: string | null }>(sql`SELECT listing_id FROM platform.legal_requests WHERE reference_id = ${referenceId}`);
    expect(row.listing_id).toBe(found!.id);

    expect(await fields(applyForLegalVerification(form({ listing: "LST-00000000" }), sender()))).toHaveProperty("listing");
    expect(await fields(applyForLegalVerification(form({ listing: "hello" }), sender()))).toHaveProperty("listing");
  });

  it("stops one address sending many", async () => {
    const email = `busy.${Date.now()}@example.test`;
    for (let i = 0; i < 3; i++) await applyForLegalVerification(form({ email }), sender());
    expect(await code(applyForLegalVerification(form({ email }), sender()))).toBe("RATE_LIMITED");
  });
});

describe("legal verification: the team's queue", () => {
  let ref: string;

  beforeAll(async () => {
    ref = (await applyForLegalVerification(form({ name: "Queue Applicant", service: "full_due_diligence" }), sender(applicant.id))).referenceId;
  });

  it("lists open requests to people with support access, searchable by reference", async () => {
    const page = await listLegalRequests(admin, { status: "open", q: ref }, 1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ referenceId: ref, name: "Queue Applicant", status: "new", documents: ["sale_deed", "encumbrance"] });
    expect(await code(listLegalRequests(await (await makeAdmin(["users.view"])).actor(), { status: "open" }, 1))).toBe("FORBIDDEN");
  });

  it("moves a request along in order, and the applicant sees each step", async () => {
    expect(await code(updateLegalRequest(support, ref, { status: "contacted" }, ctx))).toBe("FORBIDDEN");
    expect(await code(updateLegalRequest(admin, ref, { status: "completed" }, ctx))).toBe("CONFLICT");

    await updateLegalRequest(admin, ref, { status: "contacted", note: "Quoted by email" }, ctx);
    await updateLegalRequest(admin, ref, { status: "in_progress" }, ctx);
    expect((await listOwnLegalRequests(applicant.id)).find((r) => r.referenceId === ref)?.status).toBe("in_progress");

    await updateLegalRequest(admin, ref, { status: "completed" }, ctx);
    expect(await code(updateLegalRequest(admin, ref, { status: "closed", note: "Changed their mind" }, ctx))).toBe("CONFLICT");

    const audit = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type = 'LEGAL_REQUEST_UPDATED' AND target_reference_id = ${ref}`);
    expect(audit.n).toBe(3);
  });

  it("needs a reason to close a request", async () => {
    const { referenceId } = await applyForLegalVerification(form(), sender());
    expect(await code(updateLegalRequest(admin, referenceId, { status: "closed" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(updateLegalRequest(admin, referenceId, { status: "closed", note: "short" }, ctx))).toBe("VALIDATION_ERROR");
    await updateLegalRequest(admin, referenceId, { status: "closed", note: "Couldn't reach them after three calls" }, ctx);
    const row = await one<{ status: string; status_note: string }>(sql`SELECT status, status_note FROM platform.legal_requests WHERE reference_id = ${referenceId}`);
    expect(row).toEqual({ status: "closed", status_note: "Couldn't reach them after three calls" });
  });

  it("shows applicants only their own requests", async () => {
    const other = await makeUser("Someone Else");
    expect(await listOwnLegalRequests(other.id)).toEqual([]);
    expect((await listOwnLegalRequests(applicant.id)).every((r) => r.referenceId.startsWith("LGL-"))).toBe(true);
  });
});

describe("legal verification: a dedicated service", () => {
  it("keeps its own pages, and offers the other services in the footer", () => {
    for (const link of [...LEGAL_SHELL.sections, ...LEGAL_SHELL.tools, ...LEGAL_SHELL.quickSearches]) expect(link.href.startsWith("/legal-verification")).toBe(true);
    expect(otherServices("legal").map((s) => s.href)).toEqual(["/buy", "/rent", "/pg", "/stays", "/invest"]);
  });
});

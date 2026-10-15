import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import type { EmailMessage } from "@/lib/email/send";
import { AppError } from "@/lib/errors";
import { gstinCheckCharacter, gstinProblem } from "@/lib/organizations/gstin";
import { applyAsAgent, approveAgent, holdAgentSignup, rejectAgent, submitHeldAgentSignup } from "@/lib/services/agents";
import { actorFor, ctx, makeAdmin, makeOrg, makeUser, one, person } from "./support/factory";

// Decision emails are sent after the transaction; keep them here instead.
const sent = vi.hoisted(() => [] as EmailMessage[]);
vi.mock("@/lib/email/send", () => ({ sendEmail: async (m: EmailMessage) => void sent.push(m), capturedEmails: () => [] }));

const failure = (p: Promise<unknown>) =>
  p.then(() => null).catch((e: unknown) => (e instanceof AppError ? { code: e.code, fields: (e.fieldErrors ?? {}) as Record<string, string> } : { code: `THREW ${String(e)}`, fields: {} as Record<string, string> }));

/** A GSTIN that passes the checksum, with a fresh PAN each time. */
function gstin(state = "27") {
  const letters = () => Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const first14 = `${state}${letters()}${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}1Z`;
  return first14 + gstinCheckCharacter(first14);
}

let admin: Actor;
let cityId: string;

const organization = (overrides: Record<string, unknown> = {}) => ({
  phone: "98765 43210",
  cityId,
  reraAgentNumber: "A51800012345",
  applyingAs: "new_organization",
  orgName: "Skyline Homes LLP",
  orgType: "brokerage",
  gstin: gstin(),
  orgAddress: "4th floor, Cyber Towers, Hitec City, Hyderabad 500081",
  ...overrides,
});

beforeAll(async () => {
  admin = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  cityId = (await one<{ id: string }>(sql`SELECT id FROM geography.places WHERE slug = 'hyderabad'`)).id;
});
beforeEach(() => {
  sent.length = 0;
});

describe("GST numbers", () => {
  it("accepts real GSTINs and catches typos, wrong state codes and bad shapes", () => {
    expect(gstinProblem("27AAPFU0939F1ZV")).toBeNull();
    expect(gstinProblem("27aapfu 0939 f1zv")).toBeNull();
    expect(gstinProblem("27AAPFU0939F1ZW")).toMatch(/typo/);
    expect(gstinProblem("99AAPFU0939F1ZV")).toMatch(/state/);
    expect(gstinProblem("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(gstinProblem("27AAPFU0939F1AV")).toMatch(/doesn't look like/);
  });
});

describe("applying through a new organization", () => {
  it("checks every organization field and the GST number's checksum", async () => {
    const applicant = await makeUser("Org Applicant");
    const bad = await failure(applyAsAgent(person(applicant), organization({ orgName: "", gstin: "27AAPFU0939F1ZW", orgAddress: "short", orgWebsite: "javascript:alert(1)" }), ctx));
    expect(bad?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(bad!.fields).sort()).toEqual(["gstin", "orgAddress", "orgName", "orgWebsite"]);
  });

  it("creates the organization pending with the application, and tells the admins", async () => {
    const applicant = await makeUser("Ravi Brokerage");
    const input = organization({ orgName: `Ravi Realty ${Date.now()}` });
    const { referenceId } = await applyAsAgent(person(applicant), input, ctx);
    const row = await one<{ application_type: string; status: string; org_status: string; gstin: string; org_type: string; created_by: string; contact_email: string; case_status: string }>(sql`
      SELECT ap.application_type, ap.status, o.status AS org_status, o.gstin, o.org_type, o.created_by, o.contact_email,
             (SELECT status FROM trust.review_cases WHERE agent_profile_id = ap.id) AS case_status
        FROM orgs.agent_profiles ap JOIN orgs.organizations o ON o.id = ap.requested_organization_id WHERE ap.reference_id = ${referenceId}`);
    expect(row).toMatchObject({ application_type: "new_organization", status: "pending", org_status: "pending", gstin: input.gstin, org_type: "brokerage", created_by: applicant.id, contact_email: applicant.email, case_status: "open" });
    const notice = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.notifications WHERE type = 'agent_application' AND title LIKE ${`%${referenceId}%${input.orgName}%`}`);
    expect(notice.n).toBeGreaterThan(0);
  });

  it("refuses a GST number that's already on Trustbrick, pointing to joining instead", async () => {
    const number = gstin();
    const org = await makeOrg("Existing GST Realty");
    await db.execute(sql`UPDATE orgs.organizations SET gstin = ${number} WHERE id = ${org.id}`);
    const applicant = await makeUser("Late Applicant");
    const clash = await failure(applyAsAgent(person(applicant), organization({ gstin: number }), ctx));
    expect(clash?.code).toBe("VALIDATION_ERROR");
    expect(clash?.fields.gstin).toMatch(/Join an organization/);
  });

  it("on approval: the organization goes live and the applicant is its admin, by email too", async () => {
    const applicant = await makeUser("Meena Owner");
    const input = organization({ orgName: `Meena Estates ${Date.now()}` });
    const { referenceId } = await applyAsAgent(person(applicant), input, ctx);
    await approveAgent(admin, referenceId, { verify: true }, ctx);

    const org = await one<{ id: string; reference_id: string; status: string; verification_status: string }>(sql`SELECT id, reference_id, status, verification_status FROM orgs.organizations WHERE gstin = ${input.gstin}`);
    expect(org).toMatchObject({ status: "active", verification_status: "verified" });
    const actor = await actorFor(applicant.id);
    expect(actor.organization.id).toBe(org.id);
    expect(actor.roles).toEqual(["broker_admin"]);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: applicant.email, subject: expect.stringMatching(/approved/) });
    expect(sent[0].text).toContain(org.reference_id);
    expect(sent[0].text).toContain(input.orgName);
  });

  it("a developer's applicant becomes its developer admin", async () => {
    const applicant = await makeUser("Dev Owner");
    const { referenceId } = await applyAsAgent(person(applicant), organization({ orgType: "developer" }), ctx);
    await approveAgent(admin, referenceId, { verify: false }, ctx);
    expect((await actorFor(applicant.id)).roles).toEqual(["developer_admin"]);
  });

  it("on rejection: the organization is rejected with it, the email gives the reason, and reapplying reuses it", async () => {
    const applicant = await makeUser("Rejected Owner");
    const input = organization();
    const first = await applyAsAgent(person(applicant), input, ctx);
    const reason = "The GST certificate is for a different business name.";
    await rejectAgent(admin, first.referenceId, reason, ctx);

    const org = await one<{ id: string; status: string; status_reason: string }>(sql`SELECT id, status, status_reason FROM orgs.organizations WHERE gstin = ${input.gstin}`);
    expect(org).toMatchObject({ status: "rejected", status_reason: reason });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(applicant.email);
    expect(sent[0].text).toContain(reason);

    // Corrected and sent again: the same organization, pending again.
    await applyAsAgent(person(applicant), { ...input, orgName: "Rejected Owner Realty Pvt Ltd" }, ctx);
    const again = await one<{ id: string; status: string; name: string; n: number }>(sql`
      SELECT id, status, name, (SELECT count(*)::int FROM orgs.organizations WHERE gstin = ${input.gstin}) AS n FROM orgs.organizations WHERE gstin = ${input.gstin}`);
    expect(again).toMatchObject({ id: org.id, status: "pending", name: "Rejected Owner Realty Pvt Ltd", n: 1 });
  });

  it("an individual's decision emails say so, without an organization", async () => {
    const applicant = await makeUser("Solo Agent");
    const { referenceId } = await applyAsAgent(person(applicant), { phone: "9876512345", cityId, applyingAs: "independent" }, ctx);
    await rejectAgent(admin, referenceId, "We couldn't confirm your RERA registration.", ctx);
    expect(sent[0].text).toContain("your agent application");
    expect(sent[0].text).toContain("We couldn't confirm your RERA registration.");
  });
});

describe("applying while signing up", () => {
  it("waits for the email to be confirmed, then sends the application", async () => {
    const applicant = await makeUser("Signup Agent", { verified: false });
    const payload = organization({ orgName: `Signup Realty ${Date.now()}` });
    await holdAgentSignup(applicant.id, payload);
    expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM orgs.agent_profiles WHERE user_id = ${applicant.id}`)).n).toBe(0);

    await db.execute(sql`UPDATE identity.users SET email_verified = true WHERE id = ${applicant.id}`);
    const result = await submitHeldAgentSignup(applicant.id, ctx);
    expect(result?.referenceId).toMatch(/^AGT-/);
    const row = await one<{ application_type: string; status: string; held: number }>(sql`
      SELECT application_type, status, (SELECT count(*)::int FROM orgs.agent_signups WHERE user_id = ${applicant.id}) AS held
        FROM orgs.agent_profiles WHERE user_id = ${applicant.id}`);
    expect(row).toEqual({ application_type: "new_organization", status: "pending", held: 0 });
    // Confirming again (or anyone without a held application) does nothing.
    expect(await submitHeldAgentSignup(applicant.id, ctx)).toBeNull();
  });

  it("drops a held application that can no longer go through", async () => {
    const number = gstin();
    const taken = await makeOrg("Took The GST Realty");
    await db.execute(sql`UPDATE orgs.organizations SET gstin = ${number} WHERE id = ${taken.id}`);
    const applicant = await makeUser("Too Late Agent", { verified: true });
    await holdAgentSignup(applicant.id, organization({ gstin: number }));
    expect(await submitHeldAgentSignup(applicant.id, ctx)).toBeNull();
    const left = await one<{ held: number; profiles: number }>(sql`
      SELECT (SELECT count(*)::int FROM orgs.agent_signups WHERE user_id = ${applicant.id}) AS held,
             (SELECT count(*)::int FROM orgs.agent_profiles WHERE user_id = ${applicant.id}) AS profiles`);
    expect(left).toEqual({ held: 0, profiles: 0 });
  });
});

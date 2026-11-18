import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { seal, unseal } from "@/lib/crypto/sealed";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { fakeWebhook } from "@/lib/payments/fake";
import { decideBankAccount, exportSettlementsCsv, holdSettlement, listSettlements, markSettlementPaid, refundRentPayment, revealLandlordBank, reviewOwnershipProof } from "@/lib/services/rent/admin";
import { namesMatch } from "@/lib/services/rent/common";
import {
  acceptLandlordInvitation,
  inviteExistingLandlord,
  inviteNewLandlord,
  landlordHome,
  landlordPanel,
  ownershipProofForServing,
  previewLandlordInvitation,
  removeLandlord,
  respondToLandlordRequest,
  saveLandlordBankAccount,
  saveLandlordPan,
  uploadOwnershipProof,
} from "@/lib/services/rent/landlords";
import { chargesForTenancy, createDueCharges, landlordSettlements, rentCheckoutStatus, rentReceipt, runRentJob, sendRentReminders, startRentCheckout } from "@/lib/services/rent/payments";
import { acceptTenancyInvitation, confirmTenancy, correctTenancy, createTenancy, currentTenancy, disputeTenancy, endTenancyByAgent, previewTenancyInvitation } from "@/lib/services/rent/tenancies";
import { receiveWebhook } from "@/lib/services/stays/payments";
import { actorFor, ctx, makeAdmin, makeAgent, makeOrg, makeUser, one } from "./support/factory";
import { readyRentListing } from "./support/listings";

type Row = Record<string, unknown>;
const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const tokenOf = (url: string) => url.split("/").pop()!;
const accept = (token: string, extra: Record<string, unknown> = {}) => ({ sessionUserId: null, name: "Lata Landlord", password: "a-strong-password-1", confirm: "a-strong-password-1", phone: "98765 11111", ipKey: "10.0.0.9", ...extra });
// A PDF's first bytes are enough for the type check.
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(200, 32)]);

async function pay(paymentRef: string, outcome: "card" | "upi" | "declined" = "upi") {
  const p = await one<{ amount: string }>(sql`SELECT amount FROM rent.payments WHERE reference_id = ${paymentRef}`);
  const hook = fakeWebhook(paymentRef, outcome, "auto", Number(p.amount));
  return receiveWebhook("fake", hook.body, hook.headers);
}

let agent: Actor;
let otherAgent: Actor;
let ops: Actor;
let support: Actor;
let listing: string;
let propertyId: string;
let propertyRef: string;
let landlord: Actor;
let landlordUser: { id: string; email: string };

afterAll(async () => {
  await db.execute(sql`DELETE FROM platform.system_settings WHERE key = 'payments.rent_online'`);
});

beforeEach(async () => {
  await db.execute(sql`DELETE FROM identity.rate_limits WHERE key LIKE 'action:invite-accept:%' OR key LIKE 'invite-accept:%'`);
});

beforeAll(async () => {
  const org = await makeOrg("Rent Brokerage");
  agent = await (await makeAgent(org.id, "Renting Agent")).actor();
  otherAgent = await (await makeAgent((await makeOrg("Elsewhere Realty")).id, "Other Agent")).actor();
  ops = await (await makeAdmin(ADMIN_PRESETS.operations.permissions)).actor();
  support = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
  listing = await readyRentListing(agent, { title: "3 BHK by the lake", rent: 42000 });
  const p = await one<{ property_id: string; reference_id: string }>(sql`
    SELECT l.property_id, p.reference_id FROM marketplace.listings l JOIN real_estate.properties p ON p.id = l.property_id WHERE l.reference_id = ${listing}`);
  propertyId = p.property_id;
  propertyRef = p.reference_id;
});

describe("sealed secrets", () => {
  it("round-trips, and the stored form doesn't contain the secret", () => {
    const s = seal("123456789012");
    expect(s).not.toContain("123456789012");
    expect(s.startsWith("v1.")).toBe(true);
    expect(unseal(s)).toBe("123456789012");
    expect(seal("x")).not.toBe(seal("x"));
    expect(() => unseal(s.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toThrow();
  });

  it("matches names loosely, but not on initials alone", () => {
    expect(namesMatch("Lata Landlord", "LATA LANDLORD")).toBe(true);
    expect(namesMatch("L. Landlord", "Lata Landlord")).toBe(true);
    expect(namesMatch("Mrs Lata K Landlord", "Lata Landlord")).toBe(true);
    expect(namesMatch("Ravi Kumar", "Lata Landlord")).toBe(false);
    expect(namesMatch("L K", "Lata Kumari")).toBe(false);
  });
});

describe("adding a new landlord", () => {
  let url: string;

  it("only agents with the listing in scope can invite, never themselves", async () => {
    expect(await code(inviteNewLandlord(otherAgent, listing, { name: "Lata Landlord", email: "lata@example.test", phone: "9876511111" }, ctx))).toBe("NOT_FOUND");
    expect(await code(inviteNewLandlord(agent, listing, { name: "Me", email: agent.email, phone: "9876511111" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(inviteNewLandlord(agent, listing, { name: "Lata", email: "not-an-email", phone: "98" }, ctx))).toBe("VALIDATION_ERROR");
  });

  it("creates a one-time link for that email, emailed, with only its hash stored", async () => {
    const r = await inviteNewLandlord(agent, listing, { name: "Lata Landlord", email: "Lata.Landlord@Example.test", phone: "98765 11111" }, ctx);
    url = r.url;
    expect(r.email).toBe("lata.landlord@example.test");
    expect(url).toMatch(/\/invite\/landlord\/[A-Za-z0-9_-]{43}$/);
    const stored = await one<Row>(sql`SELECT row_to_json(i)::text AS j FROM rent.landlord_invitations i WHERE reference_id = ${r.referenceId}`);
    expect(String(stored.j)).not.toContain(tokenOf(url));
    // A second invitation while one waits is refused.
    expect(await code(inviteNewLandlord(agent, listing, { name: "Someone Else", email: "else@example.test", phone: "9876500000" }, ctx))).toBe("CONFLICT");
    expect((await landlordPanel(propertyId)).invitation).toMatchObject({ kind: "new", email: "lata.landlord@example.test", expired: false });
  });

  it("the landlord signs up with it: account, workspace and the property, waiting for proof", async () => {
    const preview = await previewLandlordInvitation(tokenOf(url));
    expect(preview).toMatchObject({ email: "lata.landlord@example.test", title: "3 BHK by the lake", accountExists: false, phone: "9876511111" });
    expect(await code(acceptLandlordInvitation(tokenOf(url), accept(tokenOf(url), { confirm: "different" }), ctx))).toBe("VALIDATION_ERROR");
    const done = await acceptLandlordInvitation(tokenOf(url), accept(tokenOf(url)), ctx);
    expect(done.createdAccount).toBe(true);
    // Used once.
    expect(await previewLandlordInvitation(tokenOf(url))).toBeNull();
    expect(await code(acceptLandlordInvitation(tokenOf(url), accept(tokenOf(url)), ctx))).toBe("NOT_FOUND");

    const u = await one<{ id: string; email: string; email_verified: boolean; phone: string }>(sql`SELECT id, email, email_verified, phone FROM identity.users WHERE email = 'lata.landlord@example.test'`);
    expect(u).toMatchObject({ email_verified: true, phone: "9876511111" });
    landlordUser = u;
    landlord = await actorFor(u.id, done.membershipId);
    expect(landlord.roles).toEqual(["landlord"]);
    expect(landlord.permissions).toMatchObject({ "rent.receive": "own", "dashboard.view": "own" });
    expect(landlord.permissions["listings.create"]).toBeUndefined();
    const home = await landlordHome(landlord);
    expect(home.properties).toHaveLength(1);
    expect(home.properties[0]).toMatchObject({ propertyReferenceId: propertyRef, status: "awaiting_proof", agentName: "Renting Agent" });
    expect((await landlordPanel(propertyId)).landlord).toMatchObject({ name: "Lata Landlord", status: "awaiting_proof", bank: "missing" });
  });
});

describe("proof of ownership and bank account", () => {
  it("the landlord uploads proof; only they and Trustbrick's checkers can open it", async () => {
    expect(await code(uploadOwnershipProof(landlord, propertyRef, "sale_deed", { bytes: Buffer.from("not a pdf at all"), filename: "x.txt" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(uploadOwnershipProof(landlord, propertyRef, "nonsense", { bytes: PDF, filename: "deed.pdf" }, ctx))).toBe("VALIDATION_ERROR");
    await uploadOwnershipProof(landlord, propertyRef, "property_tax_receipt", { bytes: PDF, filename: "tax receipt 2026.pdf" }, ctx);
    const link = await one<{ id: string; status: string }>(sql`SELECT id, status FROM rent.property_landlords WHERE property_id = ${propertyId} AND status <> 'ended'`);
    expect(link.status).toBe("under_review");
    expect(await ownershipProofForServing({ userId: landlordUser.id, actor: landlord }, link.id)).toMatchObject({ mimeType: "application/pdf" });
    expect(await ownershipProofForServing({ userId: agent.userId, actor: agent }, link.id)).toBeNull();
    expect(await ownershipProofForServing({ userId: ops.userId, actor: ops }, link.id)).not.toBeNull();
  });

  it("the bank account must be in the landlord's name and real; the number is stored sealed", async () => {
    const bank = { method: "bank", holderName: "Lata Landlord", accountNumber: "501234567890", confirmAccountNumber: "501234567890", ifsc: "HDFC0001234" };
    expect(await code(saveLandlordBankAccount(landlord, { ...bank, holderName: "Ravi Kumar" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(saveLandlordBankAccount(landlord, { ...bank, accountNumber: "501234560000", confirmAccountNumber: "501234560000" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(saveLandlordBankAccount(landlord, { ...bank, confirmAccountNumber: "501234567891" }, ctx))).toBe("VALIDATION_ERROR");
    const saved = await saveLandlordBankAccount(landlord, bank, ctx);
    expect(saved).toMatchObject({ status: "verified", accountLast4: "7890", bankName: "HDFC Bank", nameAtBank: "LATA LANDLORD", holdUntil: null });
    const stored = await one<Row>(sql`SELECT row_to_json(b)::text AS j FROM rent.landlord_bank_accounts b WHERE landlord_user_id = ${landlordUser.id}`);
    expect(String(stored.j)).not.toContain("501234567890");
    const audited = await one<Row>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE (before::text || after::text) LIKE '%501234567890%'`);
    expect(audited.n).toBe(0);
    await saveLandlordPan(landlord, { pan: "abcde1234f" }, ctx);
    expect((await landlordHome(landlord)).panMasked).toBe("•••••1234F");
  });

  it("Trustbrick approves the proof (support can only look)", async () => {
    const link = await one<{ id: string }>(sql`SELECT id FROM rent.property_landlords WHERE property_id = ${propertyId} AND status <> 'ended'`);
    expect(await code(reviewOwnershipProof(support, link.id, "approve", "", ctx))).toBe("FORBIDDEN");
    expect(await code(reviewOwnershipProof(ops, link.id, "reject", "short", ctx))).toBe("VALIDATION_ERROR");
    await reviewOwnershipProof(ops, link.id, "approve", "Tax receipt matches the name and address.", ctx);
    expect(await one<Row>(sql`SELECT status, approved_at IS NOT NULL AS approved FROM rent.property_landlords WHERE id = ${link.id}`)).toMatchObject({ status: "approved", approved: true });
    expect(await one<Row>(sql`SELECT owner_user_id FROM real_estate.properties WHERE id = ${propertyId}`)).toMatchObject({ owner_user_id: landlordUser.id });
    expect(await code(reviewOwnershipProof(ops, link.id, "approve", "", ctx))).toBe("CONFLICT");
  });
});

describe("an existing landlord", () => {
  let second: string;

  it("is found by exact email, phone or landlord ID, and accepts in their dashboard", async () => {
    second = await readyRentListing(agent, { title: "Studio near the station", rent: 18000 });
    expect(await code(inviteExistingLandlord(agent, second, { who: "nobody@example.test" }, ctx))).toBe("VALIDATION_ERROR");
    // Someone already a landlord isn't invited as new.
    expect(await code(inviteNewLandlord(agent, second, { name: "Lata", email: landlordUser.email, phone: "9876511111" }, ctx))).toBe("VALIDATION_ERROR");
    const r = await inviteExistingLandlord(agent, second, { who: "+91 98765 11111" }, ctx);
    expect(r.landlordName).toBe("Lata Landlord");
    const home = await landlordHome(landlord);
    expect(home.requests).toHaveLength(1);
    // Someone else can't answer it.
    const stranger = await makeUser("Stranger");
    expect(await code(respondToLandlordRequest(stranger.id, stranger.referenceId, r.referenceId, true, ctx))).toBe("NOT_FOUND");
    await respondToLandlordRequest(landlordUser.id, landlord.userReferenceId, r.referenceId, true, ctx);
    expect((await landlordHome(landlord)).properties).toHaveLength(2);
  });

  it("the agent can remove a landlord while there's no tenancy", async () => {
    expect(await code(removeLandlord(agent, second, "no", ctx))).toBe("VALIDATION_ERROR");
    await removeLandlord(agent, second, "Added to the wrong property by mistake.", ctx);
    expect((await landlordHome(landlord)).properties).toHaveLength(1);
    const lp = await one<{ reference_id: string }>(sql`SELECT reference_id FROM rent.landlord_profiles WHERE user_id = ${landlordUser.id}`);
    const again = await inviteExistingLandlord(agent, second, { who: lp.reference_id.toLowerCase() }, ctx);
    expect(again.landlordName).toBe("Lata Landlord");
  });
});

describe("the tenancy", () => {
  let tenantUrl: string;
  let tenancyRef: string;
  let tenant: { id: string; email: string };

  it("the agent sets it up; the tenant gets a one-time link; the landlord is asked to confirm", async () => {
    const terms = { tenantName: "Tara Tenant", tenantEmail: "tara.tenant@example.test", tenantPhone: "9876522222", monthlyRent: "42000", dueDay: "5", deposit: "126000", startDate: "2026-12-01" };
    expect(await code(createTenancy(agent, listing, { ...terms, tenantEmail: landlordUser.email }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(createTenancy(agent, listing, { ...terms, dueDay: "31" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(createTenancy(agent, listing, { ...terms, endDate: "2026-11-01" }, ctx))).toBe("VALIDATION_ERROR");
    expect(await code(createTenancy(otherAgent, listing, terms, ctx))).toBe("NOT_FOUND");
    const r = await createTenancy(agent, listing, terms, ctx);
    tenantUrl = r.url;
    tenancyRef = r.referenceId;
    expect(await code(createTenancy(agent, listing, terms, ctx))).toBe("CONFLICT");
    expect(await currentTenancy(propertyId)).toMatchObject({ status: "pending", monthlyRent: 42000, dueDay: 5, deposit: 126000, tenantAccepted: false, landlordConfirmed: false });
  });

  it("the landlord disputes the terms; the agent corrects them", async () => {
    await disputeTenancy(landlord, tenancyRef, { note: "The rent we agreed is 40,000, not 42,000." }, ctx);
    expect(await currentTenancy(propertyId)).toMatchObject({ status: "disputed", disputeNote: "The rent we agreed is 40,000, not 42,000." });
    await correctTenancy(agent, tenancyRef, { monthlyRent: "40000", dueDay: "5", deposit: "120000", startDate: "2026-12-01" }, ctx);
    expect(await currentTenancy(propertyId)).toMatchObject({ status: "pending", monthlyRent: 40000, disputeNote: null, landlordConfirmed: false });
  });

  it("the tenant accepts and the landlord confirms: it's active, from the first due day", async () => {
    expect(await previewTenancyInvitation(tokenOf(tenantUrl))).toMatchObject({ email: "tara.tenant@example.test", monthlyRent: 40000, landlordName: "Lata Landlord" });
    const done = await acceptTenancyInvitation(tokenOf(tenantUrl), accept(tokenOf(tenantUrl), { name: "Tara Tenant", phone: "9876522222" }), ctx);
    expect(done.createdAccount).toBe(true);
    tenant = await one(sql`SELECT id, email FROM identity.users WHERE email = 'tara.tenant@example.test'`);
    expect(await currentTenancy(propertyId)).toMatchObject({ status: "pending", tenantAccepted: true });
    // Another landlord can't confirm it.
    const other = await actorFor(agent.userId);
    expect(await code(confirmTenancy(other, tenancyRef, ctx))).toBe("FORBIDDEN");
    await confirmTenancy(landlord, tenancyRef, ctx);
    const t = await currentTenancy(propertyId);
    expect(t).toMatchObject({ status: "active", tenantAccepted: true, landlordConfirmed: true });
    expect(t!.firstDueDate! >= "2026-12-05").toBe(true);
    expect(t!.firstDueDate!.slice(8)).toBe("05");
  });

  it("each month's rent appears a week before it's due, only while collection is on", async () => {
    // Make the first rent due in three days.
    await db.execute(sql`UPDATE rent.tenancies SET first_due_date = (now() AT TIME ZONE 'Asia/Kolkata')::date + 3 WHERE reference_id = ${tenancyRef}`);
    await runRentJob();
    expect(await chargesForTenancy(tenancyRef)).toHaveLength(0);
    await db.execute(sql`INSERT INTO platform.system_settings (key, value) VALUES ('payments.rent_online', 'true'::jsonb) ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb`);
    expect(await createDueCharges()).toBeGreaterThanOrEqual(1);
    expect(await createDueCharges()).toBe(0);
    const charges = await chargesForTenancy(tenancyRef);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ amount: 40000, status: "due", overdue: false });
    // Reminded once, three days before.
    const sent = await sendRentReminders();
    expect(sent).toBeGreaterThanOrEqual(1);
    const again = await sendRentReminders();
    const mine = await one<Row>(sql`SELECT reminded_before_at IS NOT NULL AS before FROM rent.charges c JOIN rent.tenancies t ON t.id = c.tenancy_id WHERE t.reference_id = ${tenancyRef}`);
    expect(mine.before).toBe(true);
    expect(again).toBe(0);
  });

  describe("paying", () => {
    let chargeRef: string;
    let paymentRef: string;

    it("only the tenant can pay; the order is for the charge's amount, no fee", async () => {
      chargeRef = (await chargesForTenancy(tenancyRef))[0].referenceId;
      const stranger = await makeUser("Not The Tenant");
      expect(await code(startRentCheckout({ userId: stranger.id, email: stranger.email, name: stranger.name }, chargeRef))).toBe("NOT_FOUND");
      const start = await startRentCheckout({ userId: tenant.id, email: tenant.email, name: "Tara Tenant" }, chargeRef);
      paymentRef = start.paymentReferenceId;
      expect(start).toMatchObject({ amount: 40000, checkout: { kind: "redirect" } });
      expect((await rentCheckoutStatus(tenant.id, paymentRef)).state).toBe("confirming");
      // A second Pay straight away is refused, so a slow UPI isn't paid twice.
      expect(await code(startRentCheckout({ userId: tenant.id, email: tenant.email, name: "Tara Tenant" }, chargeRef))).toBe("CONFLICT");
    });

    it("a declined payment changes nothing; a signed webhook marks it paid, once", async () => {
      await pay(paymentRef, "declined");
      expect((await rentCheckoutStatus(tenant.id, paymentRef)).state).toBe("failed");
      await db.execute(sql`UPDATE rent.payments SET created_at = now() - interval '5 minutes' WHERE reference_id = ${paymentRef}`);
      const retry = await startRentCheckout({ userId: tenant.id, email: tenant.email, name: "Tara Tenant" }, chargeRef);
      paymentRef = retry.paymentReferenceId;
      expect(await pay(paymentRef)).toMatchObject({ status: 200, message: "OK" });
      expect(await pay(paymentRef)).toMatchObject({ status: 200 });
      expect((await rentCheckoutStatus(tenant.id, paymentRef)).state).toBe("paid");
      expect((await chargesForTenancy(tenancyRef))[0]).toMatchObject({ status: "paid" });
    });

    it("the receipt names the landlord and shows their PAN, for HRA", async () => {
      const r = await rentReceipt(tenant.id, paymentRef, unseal);
      expect(r).toMatchObject({ amount: 40000, landlordName: "Lata Landlord", landlordPan: "ABCDE1234F", tenantName: "Tara Tenant", method: "upi" });
      expect(await code(rentReceipt(landlordUser.id, paymentRef, unseal))).toBe("NOT_FOUND");
    });

    it("the landlord is owed it: ready for the back office by the next working day", async () => {
      const [s] = await landlordSettlements(landlordUser.id);
      expect(s).toMatchObject({ amount: 40000, status: "ready", holdReason: null });
      expect(s.dueBy).not.toBeNull();
    });

    it("a second payment for the same month is returned in full", async () => {
      const dup = await one<{ id: string }>(sql`SELECT id FROM rent.charges WHERE reference_id = ${chargeRef}`);
      // Paid twice: the second order was opened before the first was confirmed.
      const second = await one<{ reference_id: string }>(sql`
        INSERT INTO rent.payments (id, reference_id, provider_order_id, charge_id, tenancy_id, tenant_user_id, landlord_user_id, amount, provider)
        SELECT gen_random_uuid(), r, r, ${dup.id}, t.id, ${tenant.id}, ${landlordUser.id}, 40000, 'fake'
          FROM (SELECT platform.gen_reference_id('RPY') AS r) x, rent.tenancies t WHERE t.reference_id = ${tenancyRef}
        RETURNING reference_id`);
      await pay(second.reference_id);
      expect((await rentCheckoutStatus(tenant.id, second.reference_id)).state).toBe("returned");
      expect(await one<Row>(sql`SELECT status, unwanted, refund_status FROM rent.payments WHERE reference_id = ${second.reference_id}`)).toMatchObject({ status: "refunded", unwanted: true, refund_status: "processed" });
      expect(await landlordSettlements(landlordUser.id)).toHaveLength(1);
    });
  });

  describe("settling from the back office", () => {
    it("the payment file holds full bank details, and exporting it is audited", async () => {
      expect(await code(exportSettlementsCsv(support, ctx))).toBe("FORBIDDEN");
      const { csv, count } = await exportSettlementsCsv(ops, ctx);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(csv).toContain("501234567890");
      expect(csv).toContain("HDFC0001234");
      expect(await one<Row>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type = 'RENT_SETTLEMENTS_EXPORTED' AND actor_user_id = ${ops.userId}`)).toMatchObject({ n: 1 });
      const lp = await one<{ reference_id: string }>(sql`SELECT reference_id FROM rent.landlord_profiles WHERE user_id = ${landlordUser.id}`);
      expect(await code(revealLandlordBank(ops, lp.reference_id, "", ctx))).toBe("VALIDATION_ERROR");
      expect(await revealLandlordBank(ops, lp.reference_id, "Paying this month's rent by NEFT.", ctx)).toMatchObject({ accountNumber: "501234567890", ifsc: "HDFC0001234" });
    });

    it("holding, then recording it paid with the bank's reference", async () => {
      const [s] = await listSettlements(ops, "ready");
      await holdSettlement(ops, s.referenceId, true, "The tenant says they paid twice; checking.", ctx);
      expect(await code(markSettlementPaid(ops, s.referenceId, { utr: "UTIBN12345678" }, ctx))).toBe("CONFLICT");
      await holdSettlement(ops, s.referenceId, false, null, ctx);
      expect(await code(markSettlementPaid(ops, s.referenceId, { utr: "x" }, ctx))).toBe("VALIDATION_ERROR");
      await markSettlementPaid(ops, s.referenceId, { utr: "hdfcn52026112345" }, ctx);
      const [paid] = await landlordSettlements(landlordUser.id);
      expect(paid).toMatchObject({ status: "paid", utr: "HDFCN52026112345", paidTo: "Account ending 7890" });
      expect(await code(markSettlementPaid(ops, s.referenceId, { utr: "HDFCN52026112345" }, ctx))).toBe("CONFLICT");
      // Settled rent can't be refunded from here.
      const pay = await one<{ reference_id: string }>(sql`SELECT p.reference_id FROM rent.payments p JOIN rent.settlements st ON st.payment_id = p.id WHERE st.reference_id = ${s.referenceId}`);
      expect(await code(refundRentPayment(ops, pay.reference_id, { reason: "Tenant asked for it back.", reopen: "on" }, ctx))).toBe("CONFLICT");
    });

    it("a changed bank account holds new settlements for 48 hours", async () => {
      await saveLandlordBankAccount(landlord, { method: "upi", holderName: "Lata Landlord", vpa: "lata@okhdfc" }, ctx);
      const bank = (await landlordHome(landlord)).bank!;
      expect(bank).toMatchObject({ method: "upi", status: "verified" });
      expect(bank.holdUntil).not.toBeNull();
      // Next month's rent, paid now, waits.
      const t = await one<{ id: string }>(sql`SELECT id FROM rent.tenancies WHERE reference_id = ${tenancyRef}`);
      const c = await one<{ reference_id: string }>(sql`INSERT INTO rent.charges (id, tenancy_id, due_date, amount) VALUES (gen_random_uuid(), ${t.id}, (now() AT TIME ZONE 'Asia/Kolkata')::date + 33, 40000) RETURNING reference_id`);
      const start = await startRentCheckout({ userId: tenant.id, email: tenant.email, name: "Tara Tenant" }, c.reference_id);
      await pay(start.paymentReferenceId);
      const [latest] = await landlordSettlements(landlordUser.id);
      expect(latest).toMatchObject({ status: "on_hold" });
      expect(latest.holdReason).toContain("changed their bank account");
      // A refund before settlement: the month is due again.
      await refundRentPayment(ops, start.paymentReferenceId, { reason: "Paid by mistake before the due date.", reopen: "on" }, ctx);
      expect(await one<Row>(sql`SELECT status FROM rent.charges WHERE reference_id = ${c.reference_id}`)).toMatchObject({ status: "due" });
      expect(await one<Row>(sql`SELECT status FROM rent.payments WHERE reference_id = ${start.paymentReferenceId}`)).toMatchObject({ status: "refunded" });
      const [after] = await landlordSettlements(landlordUser.id);
      expect(after.status).toBe("cancelled");
    });

    it("a bank account the provider couldn't check is verified by a person", async () => {
      const lp = await one<{ reference_id: string }>(sql`SELECT reference_id FROM rent.landlord_profiles WHERE user_id = ${landlordUser.id}`);
      await db.execute(sql`UPDATE rent.landlord_bank_accounts SET status = 'pending', verified_at = NULL WHERE landlord_user_id = ${landlordUser.id}`);
      expect(await code(decideBankAccount(support, lp.reference_id, "verify", "Called the landlord and checked.", ctx))).toBe("FORBIDDEN");
      await decideBankAccount(ops, lp.reference_id, "verify", "A ₹1 transfer reached the account in her name.", ctx);
      expect((await landlordHome(landlord)).bank).toMatchObject({ status: "verified" });
    });
  });

  it("ending the tenancy stops rent after the last day", async () => {
    const today = (await one<{ d: string }>(sql`SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date)::text AS d`)).d;
    // It began two months ago.
    await db.execute(sql`UPDATE rent.tenancies SET start_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 60 WHERE reference_id = ${tenancyRef}`);
    expect(await code(endTenancyByAgent(agent, tenancyRef, { endDate: "2020-01-01", reason: "The tenant is moving out." }, ctx))).toBe("VALIDATION_ERROR");
    await endTenancyByAgent(agent, tenancyRef, { endDate: today, reason: "The tenant is moving out." }, ctx);
    expect(await one<Row>(sql`SELECT status FROM rent.tenancies WHERE reference_id = ${tenancyRef}`)).toMatchObject({ status: "ended" });
    const due = await one<Row>(sql`SELECT count(*)::int AS n FROM rent.charges c JOIN rent.tenancies t ON t.id = c.tenancy_id WHERE t.reference_id = ${tenancyRef} AND c.status = 'due'`);
    expect(due.n).toBe(0);
    expect(await currentTenancy(propertyId)).toBeNull();
  });
});

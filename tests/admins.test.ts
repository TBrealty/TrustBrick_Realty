import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import type { Actor } from "@/lib/authz/actor";
import { loadActor, loadWorkspaces } from "@/lib/authz/actor";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  acceptInvitation,
  inviteAdmin,
  listAdmins,
  previewInvitation,
  reinstateAdmin,
  revokeInvitation,
  setAdminPermissions,
  suspendAdmin,
} from "@/lib/services/admins";
import { ctx, makeAdmin, makeSession, makeSuperadmin, makeUser, one } from "./support/factory";

const code = (p: Promise<unknown>) => p.then(() => "OK").catch((e: unknown) => (e instanceof AppError ? e.code : `THREW ${String(e)}`));
const PASSWORD = "correct horse battery staple";

let superadmin: Actor;
let superadminRef: string;

/** Invitations email a token; the test reads it back by replacing the stored hash with a known one. */
async function inviteWithKnownToken(email: string, permissions: string[]) {
  const { referenceId } = await inviteAdmin(superadmin, { email, permissions }, PASSWORD, ctx);
  const token = `${"t".repeat(20)}${uuidv7().replace(/-/g, "").slice(0, 23)}`;
  await db.execute(sql`UPDATE orgs.admin_invitations SET token_hash = ${createHash("sha256").update(token).digest("hex")} WHERE reference_id = ${referenceId}`);
  return { referenceId, token };
}

beforeAll(async () => {
  const sa = await makeSuperadmin();
  superadminRef = sa.referenceId;
  await db.execute(sql`INSERT INTO identity.accounts (id, user_id, provider_id, account_id, password)
                       VALUES (${uuidv7()}, ${sa.user.id}, 'credential', ${sa.user.id}, ${await hashPassword(PASSWORD)})`);
  superadmin = await sa.actor();
});

describe("inviting admins", () => {
  it("requires the SuperAdmin's password", async () => {
    expect(await code(inviteAdmin(superadmin, { email: "a@example.test", permissions: ["users.view"] }, "wrong password", ctx))).toBe("VALIDATION_ERROR");
  });

  it("strips SuperAdmin-only permissions from an invitation", async () => {
    const email = `strip.${uuidv7().slice(-6)}@example.test`;
    const { token } = await inviteWithKnownToken(email, ["users.view", "admins.manage", "settings.manage", "not.a.permission"]);
    const result = await acceptInvitation(token, { sessionUserId: null, name: "Stripped Admin", password: "a very long password", ipKey: "t1" }, ctx);
    expect(result.createdAccount).toBe(true);
    const user = await one<{ id: string }>(sql`SELECT id FROM identity.users WHERE email = ${email}`);
    const [ws] = await loadWorkspaces(user.id);
    const actor = await loadActor(user.id, ws.membershipId);
    expect(can(actor, "users.view", "platform")).toBe(true);
    expect(can(actor, "admins.manage", "platform")).toBe(false);
    expect(can(actor, "settings.manage", "platform")).toBe(false);
    expect(actor?.staff?.referenceId).toMatch(/^ADM-/);
  });

  it("creates a verified account, audited, and the token works once", async () => {
    const email = `new.${uuidv7().slice(-6)}@example.test`;
    const { token } = await inviteWithKnownToken(email, ["users.view", "agents.view"]);
    expect((await previewInvitation(token))?.email).toBe(email);
    await acceptInvitation(token, { sessionUserId: null, name: "New Admin", password: "a very long password", ipKey: "t2" }, ctx);
    const row = await one<{ email_verified: boolean }>(sql`SELECT email_verified FROM identity.users WHERE email = ${email}`);
    expect(row.email_verified).toBe(true);
    expect(await previewInvitation(token)).toBeNull();
    expect(await code(acceptInvitation(token, { sessionUserId: null, name: "Again", password: "a very long password", ipKey: "t3" }, ctx))).toBe("NOT_FOUND");
    const audit = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM platform.audit_events WHERE event_type IN ('ADMIN_INVITED', 'ADMIN_CREATED') AND (metadata->>'email' = ${email} OR target_type = 'admin')`);
    expect(audit.n).toBeGreaterThanOrEqual(2);
  });

  it("an existing account must be logged in as the invited email", async () => {
    const existing = await makeUser("Existing Person");
    const { token } = await inviteWithKnownToken(existing.email, ["users.view"]);
    const stranger = await makeUser("Stranger");
    expect(await code(acceptInvitation(token, { sessionUserId: stranger.id, ipKey: "t4" }, ctx))).toBe("UNAUTHORIZED");
    expect(await code(acceptInvitation(token, { sessionUserId: existing.id, ipKey: "t5" }, ctx))).toBe("OK");
  });

  it("expired and revoked invitations can't be used", async () => {
    const a = await inviteWithKnownToken(`exp.${uuidv7().slice(-6)}@example.test`, ["users.view"]);
    await db.execute(sql`UPDATE orgs.admin_invitations SET expires_at = now() - interval '1 minute' WHERE reference_id = ${a.referenceId}`);
    expect(await code(acceptInvitation(a.token, { sessionUserId: null, name: "Late", password: "a very long password", ipKey: "t6" }, ctx))).toBe("NOT_FOUND");

    const b = await inviteWithKnownToken(`rev.${uuidv7().slice(-6)}@example.test`, ["users.view"]);
    await revokeInvitation(superadmin, b.referenceId, ctx);
    expect(await code(acceptInvitation(b.token, { sessionUserId: null, name: "Revoked", password: "a very long password", ipKey: "t7" }, ctx))).toBe("NOT_FOUND");
  });

  it("a normal admin cannot invite or manage admins, even with every grantable permission", async () => {
    const admin = await (await makeAdmin()).actor();
    expect(await code(inviteAdmin(admin, { email: "x@example.test", permissions: ["users.view"] }, PASSWORD, ctx))).toBe("FORBIDDEN");
    expect(await code(listAdmins(admin))).toBe("FORBIDDEN");
    expect(await code(setAdminPermissions(admin, superadminRef, [], PASSWORD, ctx))).toBe("FORBIDDEN");
  });
});

describe("managing admins", () => {
  it("changes permissions with an audited before and after", async () => {
    const target = await makeAdmin(["users.view"]);
    await setAdminPermissions(superadmin, target.referenceId, ["users.view", "users.suspend", "admins.create"], PASSWORD, ctx);
    const actor = await target.actor();
    expect(can(actor, "users.suspend", "platform")).toBe(true);
    expect(can(actor, "admins.create", "platform")).toBe(false);
    const audit = await one<{ before: { permissions: string[] }; after: { permissions: string[] } }>(sql`
      SELECT before, after FROM platform.audit_events WHERE event_type = 'ADMIN_PERMISSION_CHANGED' AND target_reference_id = ${target.referenceId}`);
    expect(audit.before.permissions).toEqual(["users.view"]);
    expect(audit.after.permissions).toEqual(["users.suspend", "users.view"]);
  });

  it("suspension ends the admin's sessions and workspace; reinstating restores it", async () => {
    const target = await makeAdmin(["users.view"]);
    await makeSession(target.user.id);
    expect(await code(suspendAdmin(superadmin, target.referenceId, "short", PASSWORD, ctx))).toBe("VALIDATION_ERROR");
    await suspendAdmin(superadmin, target.referenceId, "Left the company this week.", PASSWORD, ctx);
    const sessions = await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM identity.sessions WHERE user_id = ${target.user.id}`);
    expect(sessions.n).toBe(0);
    expect(await loadActor(target.user.id, target.membershipId)).toBeNull();
    await reinstateAdmin(superadmin, target.referenceId, PASSWORD, ctx);
    expect(await loadActor(target.user.id, target.membershipId)).not.toBeNull();
  });

  it("SuperAdmins can't be changed from the portal, and nobody changes their own access", async () => {
    const other = await makeSuperadmin();
    expect(await code(suspendAdmin(superadmin, other.referenceId, "Trying to remove a peer.", PASSWORD, ctx))).toBe("FORBIDDEN");
    expect(await code(setAdminPermissions(superadmin, superadminRef, [], PASSWORD, ctx))).toBe("FORBIDDEN");
  });
});

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import { loadActor, loadWorkspaces } from "@/lib/authz/actor";
import { ADMIN_PRESETS } from "@/lib/authz/catalog";
import { db } from "@/lib/db";
import { addMembership, internalOrgId, makeAdmin, makeAgent, makeOrg, makeSuperadmin, makeUser } from "./support/factory";

describe("actor resolution and permissions", () => {
  it("a customer has no workspace", async () => {
    const user = await makeUser("Customer");
    expect(await loadWorkspaces(user.id)).toEqual([]);
  });

  it("a SuperAdmin manages admins and settings and sees everything, but doesn't operate", async () => {
    const sa = await (await makeSuperadmin()).actor();
    expect(sa.workspace).toBe("platform");
    expect(sa.staff?.level).toBe("superadmin");
    for (const p of ["admins.create", "admins.manage", "settings.manage", "users.view", "agents.view", "listings.view", "audit.view", "dashboard.view"] as const) {
      expect(can(sa, p, "platform")).toBe(true);
    }
    for (const p of ["users.suspend", "listings.approve", "organizations.manage", "agents.create", "agents.verify"] as const) {
      expect(can(sa, p, "platform")).toBe(false);
    }
    expect(can(sa, "listings.create")).toBe(false);
  });

  it("an Admin holds exactly what was granted, and never SuperAdmin-only powers", async () => {
    const admin = await (await makeAdmin(ADMIN_PRESETS.support.permissions)).actor();
    expect(can(admin, "users.view", "platform")).toBe(true);
    expect(can(admin, "users.suspend", "platform")).toBe(false);
    expect(can(admin, "listings.approve", "platform")).toBe(false);
    expect(can(admin, "admins.create", "platform")).toBe(false);
  });

  it("an agent's permissions are scoped to their own work", async () => {
    const org = await makeOrg();
    const agent = await (await makeAgent(org.id)).actor();
    expect(agent.workspace).toBe("professional");
    expect(agent.permissions["listings.view"]).toBe("own");
    expect(can(agent, "listings.create")).toBe(true);
    expect(can(agent, "users.view", "platform")).toBe(false);
    expect(can(agent, "dashboard.view", "platform")).toBe(false);
  });

  it("platform permissions granted outside the internal organization are ignored", async () => {
    const org = await makeOrg();
    const agent = await makeAgent(org.id);
    await db.execute(sql`INSERT INTO orgs.membership_permissions (membership_id, permission_code, scope) VALUES
      (${agent.membershipId}, 'users.suspend', 'platform'), (${agent.membershipId}, 'listings.view', 'platform')`);
    const actor = await agent.actor();
    expect(can(actor, "users.suspend", "platform")).toBe(false);
    expect(actor.permissions["listings.view"]).toBe("own");
  });

  it("platform roles only work in the internal organization, and professional roles only outside it", async () => {
    const org = await makeOrg();
    const user = await makeUser("Confused");
    await addMembership(user.id, org.id, ["superadmin"]);
    await addMembership(user.id, await internalOrgId(), ["agent"]);
    expect(await loadWorkspaces(user.id)).toEqual([]);
  });

  it("an agent role needs an active agent profile", async () => {
    const org = await makeOrg();
    const agent = await makeAgent(org.id);
    await db.execute(sql`UPDATE orgs.agent_profiles SET status = 'suspended' WHERE id = ${agent.profileId}`);
    expect(await loadActor(agent.user.id, agent.membershipId)).toBeNull();
  });

  it("suspended users, memberships and organizations have no workspace", async () => {
    const org = await makeOrg();
    const a = await makeAgent(org.id);
    await db.execute(sql`UPDATE identity.users SET status = 'suspended' WHERE id = ${a.user.id}`);
    expect(await loadActor(a.user.id, a.membershipId)).toBeNull();

    const b = await makeAgent(org.id);
    await db.execute(sql`UPDATE orgs.memberships SET status = 'suspended' WHERE id = ${b.membershipId}`);
    expect(await loadActor(b.user.id, b.membershipId)).toBeNull();

    const c = await makeAgent(org.id);
    await db.execute(sql`UPDATE orgs.organizations SET status = 'suspended' WHERE id = ${org.id}`);
    expect(await loadActor(c.user.id, c.membershipId)).toBeNull();
  });

  it("a membership belonging to someone else is never loaded", async () => {
    const org = await makeOrg();
    const a = await makeAgent(org.id);
    const b = await makeAgent(org.id);
    expect(await loadActor(a.user.id, b.membershipId)).toBeNull();
  });

  it("a person with two memberships has two workspaces to choose from", async () => {
    const org = await makeOrg();
    const agent = await makeAgent(org.id);
    const other = await makeOrg("Second Brokerage");
    await addMembership(agent.user.id, other.id, ["broker_admin"]);
    expect((await loadWorkspaces(agent.user.id)).length).toBe(2);
  });
});

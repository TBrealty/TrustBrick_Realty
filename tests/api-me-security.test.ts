import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as signIn from "@/app/api/v1/auth/sign-in/route";
import * as signUp from "@/app/api/v1/auth/sign-up/route";
import * as me from "@/app/api/v1/me/route";
import * as preferences from "@/app/api/v1/me/notification-preferences/route";
import * as password from "@/app/api/v1/me/password/route";
import * as security from "@/app/api/v1/me/security/route";
import * as sessions from "@/app/api/v1/me/sessions/route";
import { db } from "@/lib/db";

type Call = { method?: string; token?: string; body?: unknown };
async function call(handler: (request: Request) => Promise<Response>, url: string, o: Call = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const response = await handler(new Request(`http://localhost:3000${url}`, { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }));
  return { status: response.status, body: (await response.json()) as { data?: Record<string, unknown>; error?: { fieldErrors?: Record<string, string> } } };
}

const PASSWORD = "a-long-test-password-2026";
const NEW_PASSWORD = "another-long-password-2026";

async function signInAs(email: string, pass = PASSWORD) {
  const r = await call(signIn.POST, "/api/v1/auth/sign-in", { method: "POST", body: { email, password: pass } });
  return { status: r.status, token: r.body.data ? String(r.body.data.token) : null };
}

describe("profile and security from the app", () => {
  it("lists sessions, signs out the others, changes the password and sets notification preferences", async () => {
    const email = `security.${Math.random().toString(36).slice(2, 8)}@example.test`;
    expect((await call(signUp.POST, "/api/v1/auth/sign-up", { method: "POST", body: { name: "Security Person", email, password: PASSWORD } })).status).toBe(201);
    await db.execute(sql`UPDATE identity.users SET email_verified = true WHERE email = ${email}`);
    let phone = (await signInAs(email)).token!;
    const laptop = (await signInAs(email)).token!;

    const page = await call(security.GET, "/api/v1/me/security", { token: phone });
    expect(page.status).toBe(200);
    const listed = page.body.data!.sessions as { current: boolean }[];
    expect(listed).toHaveLength(2);
    expect(listed.filter((s) => s.current)).toHaveLength(1);
    const types = page.body.data!.notifications as { type: string; enabled: boolean; locked: boolean }[];
    expect(types.find((t) => t.type === "security")).toMatchObject({ enabled: true, locked: true });

    // Signing out everywhere else keeps this phone signed in.
    expect((await call(sessions.DELETE, "/api/v1/me/sessions", { method: "DELETE", token: phone })).body.data).toMatchObject({ signedOut: 1 });
    expect((await call(me.GET, "/api/v1/me", { token: laptop })).status).toBe(401);
    expect((await call(me.GET, "/api/v1/me", { token: phone })).status).toBe(200);

    // Password: the current one is checked, the new one must match and be long enough.
    const wrong = await call(password.POST, "/api/v1/me/password", { method: "POST", token: phone, body: { currentPassword: "not-my-password", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error!.fieldErrors).toMatchObject({ currentPassword: expect.any(String) });
    const mismatch = await call(password.POST, "/api/v1/me/password", { method: "POST", token: phone, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: "different-password-2026" } });
    expect(mismatch.body.error!.fieldErrors).toMatchObject({ confirmPassword: expect.any(String) });
    const ok = await call(password.POST, "/api/v1/me/password", { method: "POST", token: phone, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } });
    expect(ok.status).toBe(200);
    // Every session ends with the old password; this device carries on with the new token.
    expect((await call(me.GET, "/api/v1/me", { token: phone })).status).toBe(401);
    phone = String(ok.body.data!.token);
    expect((await call(me.GET, "/api/v1/me", { token: phone })).status).toBe(200);
    expect((await signInAs(email)).status).toBe(401);
    expect((await signInAs(email, NEW_PASSWORD)).status).toBe(200);

    // Preferences: whatever isn't enabled is muted, except security notices.
    const enabled = types.filter((t) => t.type !== "lead_new").map((t) => t.type).filter((t) => t !== "security");
    expect((await call(preferences.PUT, "/api/v1/me/notification-preferences", { method: "PUT", token: phone, body: { enabled } })).status).toBe(200);
    const after = (await call(security.GET, "/api/v1/me/security", { token: phone })).body.data!.notifications as { type: string; enabled: boolean }[];
    expect(after.find((t) => t.type === "security")!.enabled).toBe(true);
    if (types.some((t) => t.type === "lead_new")) expect(after.find((t) => t.type === "lead_new")!.enabled).toBe(false);
  });
});

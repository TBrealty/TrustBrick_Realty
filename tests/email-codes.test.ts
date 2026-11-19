import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as authCatchAll from "@/app/api/auth/[...all]/route";
import * as forgot from "@/app/api/v1/auth/forgot-password/route";
import * as resend from "@/app/api/v1/auth/resend-code/route";
import * as resetPassword from "@/app/api/v1/auth/reset-password/route";
import * as signIn from "@/app/api/v1/auth/sign-in/route";
import * as signUp from "@/app/api/v1/auth/sign-up/route";
import * as verify from "@/app/api/v1/auth/verify-email/route";
import * as me from "@/app/api/v1/me/route";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";

type Body = { data?: Record<string, any>; error?: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(handler: (r: Request) => Promise<Response>, url: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handler(new Request(`http://localhost:3000${url}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Body };
}
/** The code the email would carry: made fresh on the server (the test can't read the email). */
const codeFor = (email: string, type: "email-verification" | "forget-password") => auth.api.createVerificationOTP({ body: { email, type } });

const PASSWORD = "a-strong-password-7";
const unique = () => `code.${Math.random().toString(36).slice(2, 9)}@example.test`;

beforeEach(async () => {
  await db.execute(sql`DELETE FROM identity.rate_limits`);
});

describe("signing up with a code", () => {
  it("checks the password typed twice", async () => {
    const r = await call(signUp.POST, "/api/v1/auth/sign-up", { name: "Twice Typed", email: unique(), password: PASSWORD, confirmPassword: "something-else-9" });
    expect(r.status).toBe(422);
    expect(r.body.error!.fieldErrors).toMatchObject({ confirmPassword: "The passwords don't match." });
  });

  it("a new account is confirmed with the emailed code, which signs them in", async () => {
    const email = unique();
    const up = await call(signUp.POST, "/api/v1/auth/sign-up", { name: "Code Person", email, password: PASSWORD, confirmPassword: PASSWORD });
    expect(up.status).toBe(201);
    expect(up.body.data).toMatchObject({ next: "code" });
    // Not confirmed yet: signing in says so, and sends a new code.
    expect((await call(signIn.POST, "/api/v1/auth/sign-in", { email, password: PASSWORD })).body.error).toMatchObject({ reason: "EMAIL_NOT_VERIFIED" });
    // A wrong code is refused.
    const wrong = await call(verify.POST, "/api/v1/auth/verify-email", { email, code: "000000" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error!.fieldErrors.code).toMatch(/isn't right/);
    const code = await codeFor(email, "email-verification");
    const ok = await call(verify.POST, "/api/v1/auth/verify-email", { email, code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(ok.status).toBe(200);
    expect(ok.body.data!.token).toBeTruthy();
    const who = await call(me.GET, "/api/v1/me", undefined, ok.body.data!.token);
    expect(who.body.data!.user).toMatchObject({ email });
    expect((await db.execute(sql`SELECT email_verified FROM identity.users WHERE email = ${email}`)).rows[0]).toMatchObject({ email_verified: true });
    // Used once.
    expect((await call(verify.POST, "/api/v1/auth/verify-email", { email, code })).status).toBe(422);
  });

  it("a code dies after 5 wrong tries, and the right one no longer works", async () => {
    const email = unique();
    await call(signUp.POST, "/api/v1/auth/sign-up", { name: "Guess Target", email, password: PASSWORD });
    const code = await codeFor(email, "email-verification");
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) await call(verify.POST, "/api/v1/auth/verify-email", { email, code: wrong });
    const after = await call(verify.POST, "/api/v1/auth/verify-email", { email, code });
    expect(after.status).toBe(422);
    expect(after.body.error!.fieldErrors.code).toMatch(/Too many wrong tries|isn't right/);
  });

  it("a new code at most once a minute, and the same answer for any address", async () => {
    const email = unique();
    await call(signUp.POST, "/api/v1/auth/sign-up", { name: "Resend Person", email, password: PASSWORD });
    expect((await call(resend.POST, "/api/v1/auth/resend-code", { email })).status).toBe(200);
    expect((await call(resend.POST, "/api/v1/auth/resend-code", { email })).status).toBe(429);
    expect((await call(resend.POST, "/api/v1/auth/resend-code", { email: unique() })).status).toBe(200);
  });
});

describe("resetting a password with a code", () => {
  it("the code and a new password, typed twice; old sessions end", async () => {
    const email = unique();
    await call(signUp.POST, "/api/v1/auth/sign-up", { name: "Reset Person", email, password: PASSWORD });
    await db.execute(sql`UPDATE identity.users SET email_verified = true WHERE email = ${email}`);
    const before = await call(signIn.POST, "/api/v1/auth/sign-in", { email, password: PASSWORD });
    expect(before.status).toBe(200);
    expect((await call(forgot.POST, "/api/v1/auth/forgot-password", { email })).status).toBe(200);
    const code = await codeFor(email, "forget-password");
    expect((await call(resetPassword.POST, "/api/v1/auth/reset-password", { email, code, password: "a-new-password-12", confirmPassword: "different-12345" })).status).toBe(422);
    expect((await call(resetPassword.POST, "/api/v1/auth/reset-password", { email, code: "999999", password: "a-new-password-12" })).status).toBe(422);
    expect((await call(resetPassword.POST, "/api/v1/auth/reset-password", { email, code, password: "a-new-password-12", confirmPassword: "a-new-password-12" })).status).toBe(200);
    expect((await call(me.GET, "/api/v1/me", undefined, before.body.data!.token)).status).toBe(401);
    expect((await call(signIn.POST, "/api/v1/auth/sign-in", { email, password: PASSWORD })).status).toBe(401);
    expect((await call(signIn.POST, "/api/v1/auth/sign-in", { email, password: "a-new-password-12" })).status).toBe(200);
  });
});

describe("closed doors", () => {
  it("logging in with only a code, and the old link endpoints, are switched off", async () => {
    for (const path of ["/api/auth/sign-in/email-otp", "/api/auth/email-otp/send-verification-otp", "/api/auth/request-password-reset", "/api/auth/send-verification-email"]) {
      const res = await authCatchAll.POST(new Request(`http://localhost:3000${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: unique(), otp: "123456", type: "sign-in" }) }));
      expect([path, res.status]).toEqual([path, 404]);
    }
  });
});

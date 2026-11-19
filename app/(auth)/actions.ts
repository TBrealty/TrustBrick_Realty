"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/auth";
import { clientIp, limit, RULES, type RateLimitResult } from "@/lib/auth/rate-limit";
import { safeRedirectPath } from "@/lib/auth/session";
import { loadWorkspaces } from "@/lib/authz/actor";
import { env } from "@/lib/env";
import { type AgentFormState, CODE_LENGTH, CODE_MINUTES, type Field, type FormState, PENDING_EMAIL_COOKIE, RESET_EMAIL_COOKIE } from "@/lib/auth/form";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { holdAgentSignup, parseAgentApplication } from "@/lib/services/agents";
import { getSetting } from "@/lib/services/settings";
import { ACCOUNT_INTENTS } from "@/lib/intents";
import { PLANS_PROMO_COOKIE } from "@/lib/subscriptions/terms";


// ── Validation ────────────────────────────────────────────────────────────────

const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

const emailField = z.preprocess(
  trimmed,
  z.email({ error: "Enter a valid email address." }).max(254, { error: "That email address is too long." }),
);

const newPasswordField = z
  .string({ error: "Choose a password." })
  .min(PASSWORD_MIN, { error: `Use at least ${PASSWORD_MIN} characters.` })
  .max(PASSWORD_MAX, { error: `Use ${PASSWORD_MAX} characters or fewer.` });

const signUpSchema = z.object({
  name: z.preprocess(
    trimmed,
    z.string().min(1, { error: "Tell us your name." }).max(120, { error: "Use 120 characters or fewer." }),
  ),
  email: emailField,
  password: newPasswordField,
  intent: z.preprocess(blankToUndefined, z.enum(ACCOUNT_INTENTS).optional()),
});

const signInSchema = z.object({
  email: emailField,
  // Deliberately no length rules on login: a length hint would describe the policy to a guesser.
  password: z.string().min(1, { error: "Enter your password." }),
});

const codeField = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") : v),
  z.string().length(CODE_LENGTH, { error: `Enter the ${CODE_LENGTH}-digit code from the email.` }),
);

const resetSchema = z
  .object({
    code: codeField,
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    error: "The passwords do not match.",
  });

const PASSWORDS_DIFFER = "The passwords don't match. Type the same password twice.";

/** The short-lived httpOnly cookie that carries an address between the steps of a flow. */
async function rememberEmail(name: string, email: string) {
  (await cookies()).set(name, email, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/", maxAge: 30 * 60 });
}

/** What a wrong, expired or used-up code says. */
function codeProblem(code: string | undefined): string | null {
  if (code === "INVALID_OTP") return "That code isn't right. Check the email and try again.";
  if (code === "OTP_EXPIRED") return "That code has expired. Send yourself a new one.";
  if (code === "TOO_MANY_ATTEMPTS") return "Too many wrong tries for that code. Send yourself a new one.";
  return null;
}

function fieldErrors(error: z.ZodError): FormState["fieldErrors"] {
  const out: FormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as Field | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as { body?: { code?: string }; status?: string; statusCode?: number };
  if (e.statusCode === 429 || e.status === "TOO_MANY_REQUESTS") return "TOO_MANY_REQUESTS";
  return e.body?.code;
}

function tooManyAttempts(result: Extract<RateLimitResult, { limited: true }>, values?: FormState["values"]): FormState {
  const minutes = Math.ceil(result.retryAfterSeconds / 60);
  const wait = result.retryAfterSeconds < 90 ? "a minute" : `${minutes} minutes`;
  return { status: "error", message: `Too many attempts. Please wait ${wait} and try again.`, values };
}

const somethingWentWrong: FormState = {
  status: "error",
  message: "Something went wrong on our side. Please try again in a moment.",
};

// ── Sign up ───────────────────────────────────────────────────────────────────

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: text(form, "name"), email: text(form, "email"), intent: text(form, "intent") };
  const parsed = signUpSchema.safeParse({ ...values, password: text(form, "password") });
  const confirmError = text(form, "confirmPassword") !== text(form, "password") ? PASSWORDS_DIFFER : undefined;
  if (!parsed.success || confirmError) {
    return { status: "error", fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...(confirmError ? { confirmPassword: confirmError } : {}) }, values };
  }

  const ip = await clientIp();
  const limited = await limit([{ key: `sign-up:ip:${ip}`, rule: RULES.signUpByIp }]);
  if (limited.limited) return tooManyAttempts(limited, values);

  const { name, email, password, intent } = parsed.data;
  try {
    // If the email is already registered, Better Auth returns a synthetic success and
    // emails the real owner instead, so this path looks identical either way.
    await auth.api.signUpEmail({
      body: { name, email, password, intent },
      headers: await headers(),
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      return { status: "error", fieldErrors: { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` }, values };
    }
    if (code === "TOO_MANY_REQUESTS") return { status: "error", message: "Too many attempts. Please wait and try again.", values };
    console.error("[auth] sign-up failed", error);
    return { ...somethingWentWrong, values };
  }

  await rememberEmail(PENDING_EMAIL_COOKIE, email);
  redirect("/check-email");
}

// ── Sign up as an agent ───────────────────────────────────────────────────────

/**
 * Creates the account and keeps the agent application with it; the application is sent to
 * Trustbrick's team when the email is confirmed (lib/auth/auth.ts, afterEmailVerification).
 *
 * Like plain sign-up, the result never reveals whether the email was registered already. If it
 * was, the real owner gets the "you already have an account" email and nothing is attached to
 * their account: they apply from /become-an-agent after logging in.
 */
export async function agentSignUpAction(_prev: AgentFormState, form: FormData): Promise<AgentFormState> {
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string" && key !== "password" && !key.startsWith("$ACTION")) values[key] = value;

  const account = signUpSchema.pick({ name: true, email: true, password: true }).safeParse({ name: values.name, email: values.email, password: text(form, "password") });
  const application = Object.fromEntries(Object.entries(values).filter(([key]) => key !== "name" && key !== "email"));
  let errors: Record<string, string> = account.success ? {} : { ...fieldErrors(account.error) };
  if (text(form, "confirmPassword") !== text(form, "password")) errors.confirmPassword = PASSWORDS_DIFFER;
  try {
    parseAgentApplication(application);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "VALIDATION_ERROR") throw error;
    errors = { ...errors, ...error.fieldErrors };
  }
  if (!account.success || Object.keys(errors).length > 0) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: errors, values };

  if (!(await getSetting("agents.applications_open"))) {
    return { status: "error", message: "We're not accepting new agent applications right now. You can still create an account and apply later.", values };
  }
  const ip = await clientIp();
  const limited = await limit([{ key: `sign-up:ip:${ip}`, rule: RULES.signUpByIp }]);
  if (limited.limited) return { status: "error", message: tooManyAttempts(limited).message, values };

  const { name, email, password } = account.data;
  const existing = await db.execute(sql`SELECT 1 FROM identity.users WHERE email = ${email}`);
  try {
    await auth.api.signUpEmail({ body: { name, email, password }, headers: await headers() });
  } catch (error) {
    const code = errorCode(error);
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      return { status: "error", fieldErrors: { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` }, values };
    }
    if (code === "TOO_MANY_REQUESTS") return { status: "error", message: "Too many attempts. Please wait and try again.", values };
    console.error("[auth] agent sign-up failed", error);
    return { ...somethingWentWrong, status: "error", values };
  }
  if (!existing.rows[0]) {
    const created = await db.execute(sql`SELECT id FROM identity.users WHERE email = ${email}`);
    const id = (created.rows[0] as { id: string } | undefined)?.id;
    if (id) await holdAgentSignup(id, application);
  }

  await rememberEmail(PENDING_EMAIL_COOKIE, email);
  redirect("/check-email?as=agent");
}

// ── Log in ────────────────────────────────────────────────────────────────────

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: text(form, "email") };
  const parsed = signInSchema.safeParse({ email: values.email, password: text(form, "password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const { email, password } = parsed.data;
  const ip = await clientIp();
  const limited = await limit([
    { key: `sign-in:ip:${ip}`, rule: RULES.signInByIp },
    // Per-account limit stops a distributed guess against one person from many addresses.
    { key: `sign-in:email:${email.toLowerCase()}`, rule: RULES.signInByEmail },
  ]);
  if (limited.limited) return tooManyAttempts(limited, values);

  let userId: string | null = null;
  let unconfirmed = false;
  try {
    const signedIn = await auth.api.signInEmail({
      body: { email, password, rememberMe: form.get("remember") === "on" },
      headers: await headers(),
    });
    userId = signedIn.user.id;
  } catch (error) {
    const code = errorCode(error);
    if (code === "INVALID_EMAIL_OR_PASSWORD") {
      return { status: "error", message: "That email and password do not match. Check them and try again.", values };
    }
    // Only reachable with the correct password, so it reveals nothing to a guesser. A fresh code is
    // on its way: the code page signs them in.
    if (code === "EMAIL_NOT_VERIFIED") unconfirmed = true;
    else if (code === "ACCOUNT_SUSPENDED") {
      return { status: "error", message: "This account is suspended. If you think this is a mistake, contact Trustbrick support.", values };
    } else if (code === "TOO_MANY_REQUESTS") return { status: "error", message: "Too many attempts. Please wait and try again.", values };
    else {
      console.error("[auth] sign-in failed", error);
      return { ...somethingWentWrong, values };
    }
  }
  if (unconfirmed) {
    await rememberEmail(PENDING_EMAIL_COOKIE, email);
    const next = safeRedirectPath(form.get("next"), "");
    redirect(`/check-email?resent=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  redirect(await afterSignIn(userId, form.get("next")));
}

/**
 * Where someone goes once signed in: where they were headed (the page that asked them to log in),
 * else agents, hosts, landlords and staff to their workspace, and customers to the home page.
 */
async function afterSignIn(userId: string | null, next: FormDataEntryValue | null): Promise<string> {
  const fallback = userId && (await loadWorkspaces(userId)).length > 0 ? "/dashboard" : "/";
  // Ask the next page to show the plans pop-up once. It decides what (if anything) to show.
  (await cookies()).set(PLANS_PROMO_COOKIE, "1", { path: "/", maxAge: 60 * 10, sameSite: "lax", secure: env.NODE_ENV === "production" });
  return safeRedirectPath(next, fallback);
}

// ── Confirm the email with its code ─────────────────────────────────────────

/**
 * The code from the sign-up email, typed on the same page: the email is confirmed and they're
 * signed in, in this tab. The address comes from the short-lived cookie, never the form.
 */
export async function verifyEmailCodeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  if (!email) return { status: "error", message: "This step has timed out. Log in with your email and password to get a new code." };
  const parsed = z.object({ code: codeField }).safeParse({ code: text(form, "code") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const ip = await clientIp();
  const limited = await limit([{ key: `code-check:ip:${ip}`, rule: RULES.codeCheckByIp }]);
  if (limited.limited) return tooManyAttempts(limited);

  let userId: string | null = null;
  try {
    const result = await auth.api.verifyEmailOTP({ body: { email, otp: parsed.data.code }, headers: await headers() });
    userId = result.user.id;
  } catch (error) {
    const code = errorCode(error);
    const problem = codeProblem(code);
    if (problem) return { status: "error", fieldErrors: { code: problem } };
    if (code === "USER_NOT_FOUND") return { status: "error", fieldErrors: { code: "That code isn't right. Check the email and try again." } };
    console.error("[auth] code check failed", error);
    return somethingWentWrong;
  }
  (await cookies()).delete(PENDING_EMAIL_COOKIE);
  // A new agent's application went to the team as the email was confirmed (lib/auth/auth.ts).
  if (text(form, "as") === "agent") redirect("/become-an-agent?applied=1");
  redirect(await afterSignIn(userId, form.get("next")));
}

// ── Resend the code ───────────────────────────────────────────────────────────

export async function resendVerificationAction(): Promise<FormState> {
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  if (!email) return { status: "error", message: "This step has timed out. Log in with your email and password to get a new code." };

  const ip = await clientIp();
  const limited = await limit([
    { key: `code-send:email:${email.toLowerCase()}:minute`, rule: RULES.codeResendByEmail },
    { key: `code-send:email:${email.toLowerCase()}`, rule: RULES.codeSendByEmail },
    { key: `resend:ip:${ip}`, rule: RULES.resetRequestByIp },
  ]);
  if (limited.limited) {
    return { status: "error", message: limited.retryAfterSeconds <= 60 ? "A new code was just sent. Wait a minute before asking for another." : tooManyAttempts(limited).message };
  }

  // Only for an account that still needs confirming: a confirmed one logs in with its password.
  const pending = await db.execute(sql`SELECT 1 FROM identity.users WHERE email = ${email.toLowerCase()} AND NOT email_verified`);
  if (pending.rows[0]) {
    try {
      await auth.api.sendVerificationOTP({ body: { email, type: "email-verification" }, headers: await headers() });
    } catch (error) {
      console.error("[auth] resend code failed", error);
    }
  }
  return { status: "success", message: `If that address still needs confirming, a new code is on its way. It expires in ${CODE_MINUTES} minutes.` };
}

// ── Forgot password ───────────────────────────────────────────────────────────

/**
 * Sends a password reset code (if there is an account) and goes on to the page where it's typed,
 * with a new password. The response is the same either way, so it reveals nothing.
 */
export async function requestPasswordResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: text(form, "email") };
  const parsed = z.object({ email: emailField }).safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const email = parsed.data.email.toLowerCase();
  const ip = await clientIp();
  const limited = await limit([
    { key: `reset-request:ip:${ip}`, rule: RULES.resetRequestByIp },
    { key: `reset-request:email:${email}`, rule: RULES.resetRequestByEmail },
  ]);
  if (limited.limited) return tooManyAttempts(limited, values);

  try {
    await auth.api.requestPasswordResetEmailOTP({ body: { email }, headers: await headers() });
  } catch (error) {
    // Never surface this: the response must look the same whether or not the account exists.
    console.error("[auth] password reset request failed", error);
  }
  await rememberEmail(RESET_EMAIL_COOKIE, email);
  redirect("/reset-password");
}

// ── Reset password ────────────────────────────────────────────────────────────

/** The code from the reset email and the new password, typed twice. Every session is logged out. */
export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = (await cookies()).get(RESET_EMAIL_COOKIE)?.value;
  if (!email) return { status: "error", message: "This step has timed out. Ask for a new code." };
  const parsed = resetSchema.safeParse({ code: text(form, "code"), password: text(form, "password"), confirmPassword: text(form, "confirmPassword") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const ip = await clientIp();
  const limited = await limit([{ key: `reset-submit:ip:${ip}`, rule: RULES.resetSubmitByIp }]);
  if (limited.limited) return tooManyAttempts(limited);

  try {
    await auth.api.resetPasswordEmailOTP({ body: { email, otp: parsed.data.code, password: parsed.data.password }, headers: await headers() });
  } catch (error) {
    const code = errorCode(error);
    const problem = codeProblem(code);
    if (problem) return { status: "error", fieldErrors: { code: problem } };
    if (code === "USER_NOT_FOUND") return { status: "error", fieldErrors: { code: "That code isn't right. Check the email and try again." } };
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
      return { status: "error", fieldErrors: { password: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` } };
    }
    console.error("[auth] password reset failed", error);
    return somethingWentWrong;
  }
  (await cookies()).delete(RESET_EMAIL_COOKIE);
  redirect("/login?reset=1");
}

/** Another reset code, for the address in the cookie (at most once a minute). */
export async function resendResetCodeAction(): Promise<FormState> {
  const email = (await cookies()).get(RESET_EMAIL_COOKIE)?.value;
  if (!email) return { status: "error", message: "This step has timed out. Ask for a new code." };
  const ip = await clientIp();
  const limited = await limit([
    { key: `code-send:reset:${email}:minute`, rule: RULES.codeResendByEmail },
    { key: `reset-request:email:${email}`, rule: RULES.resetRequestByEmail },
    { key: `reset-request:ip:${ip}`, rule: RULES.resetRequestByIp },
  ]);
  if (limited.limited) {
    return { status: "error", message: limited.retryAfterSeconds <= 60 ? "A new code was just sent. Wait a minute before asking for another." : tooManyAttempts(limited).message };
  }
  try {
    await auth.api.requestPasswordResetEmailOTP({ body: { email }, headers: await headers() });
  } catch (error) {
    console.error("[auth] reset code resend failed", error);
  }
  return { status: "success", message: `If there's an account for that email, a new code is on its way. It expires in ${CODE_MINUTES} minutes.` };
}

// ── Log out ───────────────────────────────────────────────────────────────────

export async function signOutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    console.error("[auth] sign-out failed", error);
  }
  redirect("/");
}

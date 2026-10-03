"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/app/(auth)/actions";
import { initialFormState, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/form";
import { FormAlert, IntentField, PasswordField, SubmitButton, TextField } from "./fields";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      <TextField label="Full name" name="name" autoComplete="name" defaultValue={state.values?.name} error={errors.name} autoFocus />
      <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} error={errors.email} />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters. A short phrase is easier to remember and harder to guess.`}
      />
      <IntentField defaultValue={state.values?.intent} error={errors.intent} />
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
      <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
        We&rsquo;ll send a link to confirm your email before your account is active.
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      {next && <input type="hidden" name="next" value={next} />}
      <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} error={errors.email} autoFocus />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        error={errors.password}
        aside={
          <Link href="/forgot-password" className="link-rule text-[0.8125rem] text-stone-deep hover:text-ink">
            Forgot password?
          </Link>
        }
      />
      <label className="flex cursor-pointer items-center gap-3 text-[0.875rem] text-graphite">
        <input type="checkbox" name="remember" defaultChecked className="size-4 accent-ink" />
        Keep me logged in on this device
      </label>
      <SubmitButton pendingLabel="Logging in…">Log in</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">{state.message}</FormAlert>
        <p className="text-[0.9375rem] leading-relaxed text-graphite">
          Didn&rsquo;t get it? Check your spam folder, or{" "}
          <Link href="/forgot-password" className="link-rule text-ink">
            try a different email
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} error={errors.email} autoFocus />
      <SubmitButton pendingLabel="Sending link…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && (
        <FormAlert tone="error">
          {state.message}{" "}
          <Link href="/forgot-password" className="link-rule font-medium">
            Request a new link
          </Link>
        </FormAlert>
      )}
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters.`}
        autoFocus
      />
      <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" error={errors.confirmPassword} />
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
      <p className="text-[0.8125rem] leading-relaxed text-stone-deep">For your security, this logs you out on every other device.</p>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message && <FormAlert tone={state.status === "success" ? "success" : "error"}>{state.message}</FormAlert>}
      <ResendButton />
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="link-rule text-[0.9375rem] font-medium text-ink disabled:opacity-60">
      {pending ? "Sending…" : "Resend the link"}
    </button>
  );
}

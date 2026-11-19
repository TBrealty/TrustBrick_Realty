"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  resendResetCodeAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  verifyEmailCodeAction,
} from "@/app/(auth)/actions";
import { CODE_LENGTH, CODE_MINUTES, initialFormState, PASSWORD_MIN } from "@/lib/auth/form";
import { CodeField, FormAlert, IntentField, NewPasswordPair, PasswordField, SubmitButton, TextField } from "./fields";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      <TextField label="Full name" name="name" autoComplete="name" defaultValue={state.values?.name} error={errors.name} autoFocus />
      <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} error={errors.email} />
      <NewPasswordPair errors={errors} hint={`At least ${PASSWORD_MIN} characters. A short phrase is easier to remember and harder to guess.`} />
      <IntentField defaultValue={state.values?.intent} error={errors.intent} />
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
      <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
        We&rsquo;ll email you a {CODE_LENGTH}-digit code to confirm your address; you type it on the next page. By creating an account you agree to the{" "}
        <a href="/terms" className="link-rule text-ink">
          Terms of Use
        </a>{" "}
        and{" "}
        <a href="/privacy" className="link-rule text-ink">
          Privacy Policy
        </a>
        .
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

  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      <TextField label="Email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} error={errors.email} autoFocus />
      <SubmitButton pendingLabel="Sending code…">Send me a code</SubmitButton>
    </form>
  );
}

/** The reset code from the email, and the new password typed twice. */
export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      <form action={action} noValidate className="space-y-6">
        {state.message && (
          <FormAlert tone="error">
            {state.message}{" "}
            <Link href="/forgot-password" className="link-rule font-medium">
              Ask for a new code
            </Link>
          </FormAlert>
        )}
        <CodeField error={errors.code} autoFocus />
        <NewPasswordPair errors={errors} label="New password" hint={`At least ${PASSWORD_MIN} characters.`} />
        <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
        <p className="text-[0.8125rem] leading-relaxed text-stone-deep">For your security, this logs you out on every other device.</p>
      </form>
      <ResendCodeForm action={resendResetCodeAction} />
    </div>
  );
}

/**
 * The code from the sign-up email: typed here, the email is confirmed and they're signed in, in
 * this tab. `as` and `next` say where to go after.
 */
export function VerifyCodeForm({ agent, next }: { agent: boolean; next?: string }) {
  const [state, action] = useActionState(verifyEmailCodeAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-6">
      {state.message && <FormAlert tone="error">{state.message}</FormAlert>}
      {agent && <input type="hidden" name="as" value="agent" />}
      {next && <input type="hidden" name="next" value={next} />}
      <CodeField error={errors.code} autoFocus />
      <SubmitButton pendingLabel="Checking…">Confirm and continue</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  return <ResendCodeForm action={resendVerificationAction} />;
}

function ResendCodeForm({ action: send }: { action: () => Promise<{ status: string; message?: string }> }) {
  const [state, action] = useActionState(send, initialFormState);
  return (
    <form action={action} className="space-y-4">
      {state.message && <FormAlert tone={state.status === "success" ? "success" : "error"}>{state.message}</FormAlert>}
      <p className="text-[0.9375rem] text-graphite">
        Didn&rsquo;t get it? Check your spam folder, or <ResendButton />
      </p>
      <p className="text-[0.8125rem] text-stone-deep">Codes expire after {CODE_MINUTES} minutes. A new code replaces the old one.</p>
    </form>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="link-rule font-medium text-ink disabled:opacity-60">
      {pending ? "sending…" : "send a new code"}
    </button>
  );
}



import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResetPasswordForm } from "@/components/auth/forms";
import { CODE_LENGTH, CODE_MINUTES, RESET_EMAIL_COOKIE } from "@/lib/auth/form";

export const metadata: Metadata = { title: "Choose a new password — Trustbrick", robots: { index: false, follow: false } };

/** After asking for a reset: the code from the email and a new password, on this same page. */
export default async function ResetPasswordPage() {
  // The address comes from a short-lived httpOnly cookie set when the code was asked for.
  const email = (await cookies()).get(RESET_EMAIL_COOKIE)?.value;
  const isDev = process.env.NODE_ENV === "development";

  if (!email) {
    return (
      <>
        <AuthHeading
          eyebrow="Password"
          title={
            <>
              This step has <em>timed out.</em>
            </>
          }
        >
          Ask for a new code, then choose your new password here.
        </AuthHeading>
        <Link href="/forgot-password" className="btn btn-dark w-full">
          <span>Get a new code</span>
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        eyebrow="Password"
        title={
          <>
            Choose a new <em>password.</em>
          </>
        }
      >
        If there&rsquo;s an account for <strong className="font-medium text-ink">{email}</strong>, we&rsquo;ve sent it a {CODE_LENGTH}-digit code. Type it below with your new password. It
        expires in {CODE_MINUTES} minutes.
      </AuthHeading>
      <ResetPasswordForm />
      <p className="mt-6 text-[0.9375rem] text-graphite">
        Wrong address?{" "}
        <Link href="/forgot-password" className="link-rule font-medium text-ink">
          Start again
        </Link>
      </p>
      {isDev && (
        <p className="mt-10 border border-dashed border-line-light px-4 py-3 text-[0.8125rem] leading-relaxed text-stone-deep">
          <span className="eyebrow mr-2 text-brick">Dev</span>
          Emails are captured locally.{" "}
          <Link href="/dev/mailbox" className="link-rule font-medium text-ink" target="_blank">
            Open the dev mailbox
          </Link>
        </p>
      )}
    </>
  );
}

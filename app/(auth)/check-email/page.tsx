import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResendVerificationForm } from "@/components/auth/forms";
import { PENDING_EMAIL_COOKIE } from "@/lib/auth/form";

export const metadata: Metadata = { title: "Check your email — Trustbrick" };

export default async function CheckEmailPage() {
  // The address comes from a short-lived httpOnly cookie, never from the URL.
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <>
      <AuthHeading
        eyebrow="Almost there"
        title={
          <>
            Check your <em>inbox.</em>
          </>
        }
      >
        {email ? (
          <>
            We sent a confirmation link to <strong className="font-medium text-ink">{email}</strong>. Open it to activate your account.
          </>
        ) : (
          <>We sent you a confirmation link. Open it to activate your account.</>
        )}
      </AuthHeading>

      <div className="space-y-6 border-t border-line-light pt-8">
        <p className="text-[0.9375rem] leading-relaxed text-graphite">
          The link expires in 24 hours. Can&rsquo;t find it? Check your spam folder.
        </p>
        {email && <ResendVerificationForm />}
        <p className="text-[0.9375rem] text-graphite">
          Wrong address?{" "}
          <Link href="/signup" className="link-rule font-medium text-ink">
            Start again
          </Link>
        </p>
      </div>

      {isDev && (
        <p className="mt-10 border border-dashed border-line-light px-4 py-3 text-[0.8125rem] leading-relaxed text-stone-deep">
          <span className="eyebrow mr-2 text-brick">Dev</span>
          No email provider is configured, so messages are captured locally.{" "}
          <Link href="/dev/mailbox" className="link-rule font-medium text-ink">
            Open the dev mailbox
          </Link>
        </p>
      )}
    </>
  );
}

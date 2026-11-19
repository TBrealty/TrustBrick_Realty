import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResendVerificationForm, VerifyCodeForm } from "@/components/auth/forms";
import { CODE_LENGTH, CODE_MINUTES, PENDING_EMAIL_COOKIE } from "@/lib/auth/form";
import { safeRedirectPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Confirm your email — Trustbrick", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ as?: string; next?: string; resent?: string }> };

/**
 * After signing up (or logging in before confirming): type the code from the email. The right code
 * confirms the email and signs them in, in this same tab.
 */
export default async function CheckEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const agent = params.as === "agent";
  const next = safeRedirectPath(params.next, "") || undefined;
  // The address comes from a short-lived httpOnly cookie, never from the URL.
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE)?.value;
  const isDev = process.env.NODE_ENV === "development";

  if (!email) {
    return (
      <>
        <AuthHeading
          eyebrow="Confirm your email"
          title={
            <>
              This step has <em>timed out.</em>
            </>
          }
        >
          Log in with your email and password: if your email still needs confirming, we&rsquo;ll send you a new code.
        </AuthHeading>
        <Link href="/login" className="btn btn-dark w-full">
          <span>Log in</span>
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        eyebrow="Almost there"
        title={
          <>
            Enter your <em>code.</em>
          </>
        }
      >
        {params.resent ? "Your email isn't confirmed yet. " : ""}We sent a {CODE_LENGTH}-digit code to <strong className="font-medium text-ink">{email}</strong>. Type it here to confirm your email
        and you&rsquo;re in. It expires in {CODE_MINUTES} minutes.
      </AuthHeading>

      <div className="space-y-8">
        {agent && (
          <p className="border-l-2 border-sage bg-sage/10 px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
            Your agent application is saved. It goes to our team as soon as you confirm your email, and we&rsquo;ll email you when it&rsquo;s decided.
          </p>
        )}
        <VerifyCodeForm agent={agent} next={next} />
        <div className="space-y-4 border-t border-line-light pt-6">
          <ResendVerificationForm />
          <p className="text-[0.8125rem] leading-relaxed text-stone-deep">
            Already have an account with this email? Then we&rsquo;ve emailed you instead:{" "}
            <Link href="/login" className="link-rule text-ink">
              log in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className="link-rule text-ink">
              reset your password
            </Link>
            .
          </p>
          <p className="text-[0.9375rem] text-graphite">
            Wrong address?{" "}
            <Link href={agent ? "/signup?as=agent" : "/signup"} className="link-rule font-medium text-ink">
              Start again
            </Link>
          </p>
        </div>
      </div>

      {isDev && (
        <p className="mt-10 border border-dashed border-line-light px-4 py-3 text-[0.8125rem] leading-relaxed text-stone-deep">
          <span className="eyebrow mr-2 text-brick">Dev</span>
          No email provider is configured, so messages are captured locally.{" "}
          <Link href="/dev/mailbox" className="link-rule font-medium text-ink" target="_blank">
            Open the dev mailbox
          </Link>
        </p>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResetPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Choose a new password — Trustbrick" };

type Props = { searchParams: Promise<{ token?: string; error?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, error } = await searchParams;

  // Better Auth redirects here with ?error=INVALID_TOKEN when the link is expired or reused.
  if (!token || error) {
    return (
      <>
        <AuthHeading
          eyebrow="Password"
          title={
            <>
              This link has <em>expired.</em>
            </>
          }
        >
          Reset links work once and expire after 30 minutes. Request a new one and use it straight away.
        </AuthHeading>
        <Link href="/forgot-password" className="btn btn-dark w-full">
          <span>Request a new link</span>
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
      />
      <ResetPasswordForm token={token} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { FormAlert } from "@/components/auth/fields";
import { SignInForm } from "@/components/auth/forms";
import { getSession, safeRedirectPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Log in — Trustbrick" };

type Props = { searchParams: Promise<{ next?: string; reset?: string; verify?: string; invited?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  // Only an explicit, same-site destination is carried through; otherwise the login action decides.
  const next = safeRedirectPath(params.next, "");
  if (await getSession()) redirect(next || "/dashboard");

  return (
    <>
      <AuthHeading
        eyebrow="Log in"
        title={
          <>
            Welcome <em>back.</em>
          </>
        }
      >
        New to Trustbrick?{" "}
        <Link href="/signup" className="link-rule font-medium text-ink">
          Create an account
        </Link>
      </AuthHeading>

      {params.reset === "1" && (
        <div className="mb-6">
          <FormAlert tone="success">Your password has been changed. Log in with your new password.</FormAlert>
        </div>
      )}
      {(params.invited === "1" || params.invited === "agent") && (
        <div className="mb-6">
          <FormAlert tone="success">
            Your {params.invited === "agent" ? "agent" : "administrator"} account is ready. Log in with the password you just chose.
          </FormAlert>
        </div>
      )}
      {params.verify === "expired" && (
        <div className="mb-6">
          <FormAlert tone="info">That confirmation link has expired or was already used. Log in and we will send you a fresh one.</FormAlert>
        </div>
      )}

      {/* Only pass `next` through when it is a real destination, never the default. */}
      <SignInForm next={params.next ? next : undefined} />
    </>
  );
}

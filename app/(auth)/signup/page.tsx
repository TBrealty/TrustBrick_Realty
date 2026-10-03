import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { SignUpForm } from "@/components/auth/forms";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign up — Trustbrick" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/account/profile");

  return (
    <>
      <AuthHeading
        eyebrow="Sign up"
        title={
          <>
            Create your <em>account.</em>
          </>
        }
      >
        Already have one?{" "}
        <Link href="/login" className="link-rule font-medium text-ink">
          Log in
        </Link>
      </AuthHeading>
      <SignUpForm />
    </>
  );
}

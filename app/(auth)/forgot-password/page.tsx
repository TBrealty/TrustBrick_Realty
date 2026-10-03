import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Reset your password — Trustbrick" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        eyebrow="Password"
        title={
          <>
            Forgot your <em>password?</em>
          </>
        }
      >
        Enter the email you signed up with and we will send you a link to choose a new one. Remembered it?{" "}
        <Link href="/login" className="link-rule font-medium text-ink">
          Log in
        </Link>
      </AuthHeading>
      <ForgotPasswordForm />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AcceptRentInviteForm } from "@/components/rent/AcceptRentInviteForm";
import { getSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { previewLandlordInvitation } from "@/lib/services/rent/landlords";

export const metadata: Metadata = { title: "Receive your rent · Trustbrick", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** "Add new landlord": the landlord's sign-up link from their agent. */
export default async function LandlordInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([previewLandlordInvitation(token), getSession()]);

  return (
    <main className="grid min-h-svh grid-cols-1 place-items-center bg-paper px-4 py-16 text-ink">
      <div className="wcard w-full max-w-md p-6 sm:p-8">
        <LogoMark className="size-9" />
        {!invite ? (
          <>
            <h1 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.02em]">This link isn&apos;t valid</h1>
            <p className="mt-2 text-[0.875rem] text-stone-deep">It may have expired, been cancelled or already been used. Ask your agent to send a new one.</p>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.02em]">Receive your rent through Trustbrick</h1>
            <p className="mt-2 text-[0.875rem] text-stone-deep">
              {invite.invitedBy} added <strong className="font-medium text-ink">{invite.email}</strong> as the landlord of{" "}
              <strong className="font-medium text-ink">{invite.title}</strong>, {invite.place}. Your tenant pays the rent online and Trustbrick pays it into your bank account.
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-[0.8125rem] text-graphite">
              <li>Create your account (or log in).</li>
              <li>Upload proof that you own the property. Trustbrick checks it.</li>
              <li>Add the bank account your rent goes to, in your own name.</li>
            </ol>
            <p className="mt-3 text-[0.75rem] text-stone-deep">The link works only for this email and expires {formatDateTime(invite.expiresAt)} (IST).</p>
            {invite.accountExists && session?.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <div className="mt-6">
                <p className="text-[0.875rem]">This email already has a Trustbrick account. Log in as {invite.email} to accept.</p>
                <Link href={`/login?next=${encodeURIComponent(`/invite/landlord/${token}`)}`} className="wbtn wbtn-primary mt-4">
                  Log in to accept
                </Link>
              </div>
            ) : (
              <AcceptRentInviteForm token={token} kind="landlord" newAccount={!invite.accountExists} defaultName={invite.name} defaultPhone={invite.phone ?? undefined} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AcceptRentInviteForm } from "@/components/rent/AcceptRentInviteForm";
import { getSession } from "@/lib/auth/session";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { ordinal, previewTenancyInvitation } from "@/lib/services/rent/tenancies";

export const metadata: Metadata = { title: "Your tenancy · Trustbrick", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The tenant's link from their agent: accept the tenancy, then pay rent online each month. */
export default async function TenancyInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, session] = await Promise.all([previewTenancyInvitation(token), getSession()]);

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
            <h1 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.02em]">Your tenancy of {invite.title}</h1>
            <p className="mt-2 text-[0.875rem] text-stone-deep">
              {invite.agentName} set up your tenancy on Trustbrick for <strong className="font-medium text-ink">{invite.email}</strong>. You&apos;ll pay the rent online each month, with
              no fee, and get a receipt.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-light py-3 text-[0.875rem]">
              <dt className="text-stone-deep">Home</dt>
              <dd>{invite.address}</dd>
              <dt className="text-stone-deep">Landlord</dt>
              <dd>{invite.landlordName}</dd>
              <dt className="text-stone-deep">Monthly rent</dt>
              <dd>{formatMoney(invite.monthlyRent)}</dd>
              <dt className="text-stone-deep">Due on</dt>
              <dd>The {ordinal(invite.dueDay)} of each month</dd>
              <dt className="text-stone-deep">Deposit</dt>
              <dd>{invite.deposit ? formatMoney(invite.deposit) : "None"}</dd>
              <dt className="text-stone-deep">From</dt>
              <dd>{formatDay(invite.startDate)}</dd>
            </dl>
            <p className="mt-3 text-[0.75rem] text-stone-deep">If anything here is wrong, tell {invite.agentName} before accepting. The link works only for this email and expires {formatDateTime(invite.expiresAt)} (IST).</p>
            {invite.accountExists && session?.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <div className="mt-6">
                <p className="text-[0.875rem]">This email already has a Trustbrick account. Log in as {invite.email} to accept.</p>
                <Link href={`/login?next=${encodeURIComponent(`/invite/tenant/${token}`)}`} className="wbtn wbtn-primary mt-4">
                  Log in to accept
                </Link>
              </div>
            ) : (
              <AcceptRentInviteForm token={token} kind="tenant" newAccount={!invite.accountExists} defaultName={invite.name} defaultPhone={invite.phone ?? undefined} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

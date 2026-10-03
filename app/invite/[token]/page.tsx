import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AcceptInvitationForm } from "@/components/workspace/AcceptInvitationForm";
import { getSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { previewAgentInvitation } from "@/lib/services/agent-invitations";
import { previewInvitation } from "@/lib/services/admins";

export const metadata: Metadata = { title: "Accept invitation · Trustbrick", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [adminInvite, agentInvite, session] = await Promise.all([previewInvitation(token), previewAgentInvitation(token), getSession()]);
  const invite = adminInvite ?? agentInvite;
  const kind = adminInvite ? "admin" : "agent";

  return (
    <main className="grid grid-cols-1 min-h-svh place-items-center bg-paper px-4 py-16 text-ink">
      <div className="wcard w-full max-w-md p-6 sm:p-8">
        <LogoMark className="size-9" />
        {!invite ? (
          <>
            <h1 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.02em]">This invitation isn&apos;t valid</h1>
            <p className="mt-2 text-[0.875rem] text-stone-deep">It may have expired, been revoked or already been used. Ask the person who invited you to send a new one.</p>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[1.5rem] font-semibold tracking-[-0.02em]">{agentInvite ? "Set up your Trustbrick agent account" : "Become a Trustbrick administrator"}</h1>
            <p className="mt-2 text-[0.875rem] text-stone-deep">
              {invite.invitedBy} invited <strong className="font-medium text-ink">{invite.email}</strong>
              {agentInvite && (
                <>
                  {" "}
                  as {agentInvite.role === "Agent" ? "an agent" : `a ${agentInvite.role.toLowerCase()}`}
                  {agentInvite.organization ? ` at ${agentInvite.organization}` : " working independently"}
                </>
              )}
              . The invitation expires {formatDateTime(invite.expiresAt)} (IST).
            </p>
            {invite.accountExists && session?.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <div className="mt-6">
                <p className="text-[0.875rem]">This email already has a Trustbrick account. Log in as {invite.email} to accept.</p>
                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="wbtn wbtn-primary mt-4">
                  Log in to accept
                </Link>
              </div>
            ) : (
              <AcceptInvitationForm token={token} kind={kind} newAccount={!invite.accountExists} defaultName={invite.name ?? ""} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

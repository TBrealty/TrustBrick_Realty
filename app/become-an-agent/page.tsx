import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/navigation/AppHeader";
import { AgentApplicationForm } from "@/components/workspace/AgentApplicationForm";
import { requireSession } from "@/lib/auth/session";
import { loadWorkspaces } from "@/lib/authz/actor";
import { agentApplicationFor } from "@/lib/services/agents";
import { cityOptions } from "@/lib/services/organizations";
import { getSetting } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Become an agent · Trustbrick", robots: { index: false } };

export default async function BecomeAnAgentPage() {
  const session = await requireSession("/become-an-agent");
  const [application, open, cities, workspaces] = await Promise.all([
    agentApplicationFor(session.user.id),
    getSetting("agents.applications_open"),
    cityOptions(),
    loadWorkspaces(session.user.id),
  ]);

  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main className="shell max-w-3xl py-12 sm:py-16">
        <p className="eyebrow flex items-center gap-3 text-brick">
          <span aria-hidden className="h-px w-8 bg-current" />
          For agents
        </p>
        <h1 className="display mt-5 text-[clamp(2.5rem,6vw,4rem)] leading-[0.95]">
          List properties on <em>Trustbrick.</em>
        </h1>
        <p className="mt-5 max-w-xl text-[1rem] text-graphite">
          Agents onboard properties, handle enquiries and schedule visits from their own workspace. Every listing is reviewed before it goes live, and every
          application is reviewed by a person.
        </p>

        <section className="mt-10 border border-line-light bg-paper p-6 sm:p-8">
          {application.state === "pending" && (
            <Notice title="Your application is being reviewed">
              Reference <span className="font-mono">{application.referenceId}</span>. We&apos;ll notify you when it&apos;s decided.
            </Notice>
          )}
          {application.state === "active" && (
            <Notice title="You're an approved agent">
              {workspaces.length > 0 ? (
                <Link href="/dashboard" className="btn btn-dark mt-4 min-h-11 text-[0.875rem]">
                  Open your workspace
                </Link>
              ) : (
                "Your workspace isn't available right now. Contact Trustbrick support."
              )}
            </Notice>
          )}
          {application.state === "suspended" && <Notice title="Your agent access is suspended">{application.reason ?? "Contact Trustbrick support for details."}</Notice>}
          {(application.state === "none" || application.state === "rejected") &&
            (open ? (
              <>
                {application.state === "rejected" && (
                  <p className="mb-6 border-l-2 border-brick bg-brick/6 px-4 py-3 text-[0.875rem]">
                    Your previous application wasn&apos;t approved{application.reason ? `: “${application.reason}”` : "."} You can correct the details and apply again.
                  </p>
                )}
                <h2 className="text-[1.25rem] font-semibold">Apply</h2>
                <p className="mt-1 text-[0.875rem] text-stone-deep">Applying as {session.user.email}.</p>
                <AgentApplicationForm cities={cities} />
              </>
            ) : (
              <Notice title="Applications are paused">We&apos;re not accepting new agent applications right now. Please check back soon.</Notice>
            ))}
        </section>
      </main>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[1.25rem] font-semibold">{title}</h2>
      <div className="mt-2 text-[0.9375rem] text-graphite">{children}</div>
    </div>
  );
}

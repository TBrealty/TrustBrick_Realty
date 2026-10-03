import type { Metadata } from "next";
import Link from "next/link";
import { HostApplicationForm } from "@/components/listings/HostApplicationForm";
import { ServicePage } from "@/components/navigation/ServicePage";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { requireSession } from "@/lib/auth/session";
import { loadWorkspaces } from "@/lib/authz/actor";
import { cityOptions } from "@/lib/services/organizations";
import { getSetting } from "@/lib/services/settings";
import { hostApplicationFor } from "@/lib/services/stays/hosts";

export const metadata: Metadata = { title: "Become a host · Trustbrick", robots: { index: false } };

const STEPS = [
  ["Apply", "Tell us who you are. A Trustbrick admin checks your identity, usually within two working days."],
  ["List your home", "Add photos, a nightly price and your house rules. Every listing is reviewed before it goes live."],
  ["Host", "Accept requests, or turn on instant book. Guests pay you at the property; Trustbrick charges nothing for now."],
];

export default async function BecomeAHostPage({ searchParams }: { searchParams: Promise<{ applied?: string }> }) {
  const session = await requireSession("/become-a-host");
  const [application, open, cities, workspaces, { applied }] = await Promise.all([
    hostApplicationFor(session.user.id),
    getSetting("stays.host_applications_open"),
    cityOptions(),
    loadWorkspaces(session.user.id),
    searchParams,
  ]);
  const hostWorkspace = workspaces.some((w) => w.roles.includes("host"));

  return (
    // Hosting is part of Home Stay, so the page sits in its shell.
    <ServicePage shell={SERVICE_SHELLS.stay!} current="host" mainClassName="shell max-w-3xl py-12 sm:py-16">
        <p className="eyebrow flex items-center gap-3 text-brick">
          <span aria-hidden className="h-px w-8 bg-current" />
          Hosting
        </p>
        <h1 className="display mt-5 text-[clamp(2.5rem,6vw,4rem)] leading-[0.95]">
          Host guests in <em>your home.</em>
        </h1>
        <p className="mt-5 max-w-xl text-[1rem] text-graphite">
          Share a whole home or a private room by the night. You set the price, the rules and the dates; Trustbrick checks hosts and listings so guests can book
          with confidence.
        </p>

        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-t border-ink pt-4">
              <p className="font-mono text-[0.75rem] text-stone-deep">0{i + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-[0.875rem] text-graphite">{body}</p>
            </li>
          ))}
        </ol>

        <section className="mt-10 border border-line-light bg-paper p-6 sm:p-8">
          {applied && application.state === "pending" && (
            <p role="status" className="mb-5 border-l-2 border-sage bg-sage/10 px-4 py-3 text-[0.9375rem]">
              Application sent. We&apos;ll email you when it&apos;s decided.
            </p>
          )}
          {application.state === "pending" && (
            <Notice title="Your application is being reviewed">
              Reference <span className="font-mono">{application.referenceId}</span>. We&apos;ll notify you when it&apos;s decided.
            </Notice>
          )}
          {application.state === "active" && (
            <Notice title="You're a Trustbrick host">
              {hostWorkspace ? (
                <span className="mt-4 flex flex-wrap gap-3">
                  <Link href="/properties/new" className="btn btn-dark min-h-11 text-[0.875rem]">
                    <span>List a home</span>
                  </Link>
                  <Link href="/dashboard" className="btn btn-ghost-dark min-h-11 text-[0.875rem]">
                    <span>Open hosting</span>
                  </Link>
                </span>
              ) : (
                "Your hosting workspace isn't available right now. Contact Trustbrick support."
              )}
            </Notice>
          )}
          {application.state === "suspended" && <Notice title="Your hosting is suspended">{application.reason ?? "Contact Trustbrick support for details."}</Notice>}
          {(application.state === "none" || application.state === "rejected") &&
            (open ? (
              <>
                {application.state === "rejected" && (
                  <p className="mb-6 border-l-2 border-brick bg-brick/6 px-4 py-3 text-[0.875rem]">
                    Your previous application wasn&apos;t approved{application.reason ? `: “${application.reason}”` : "."} You can correct the details and apply again.
                  </p>
                )}
                <h2 className="text-[1.25rem] font-semibold">Apply to host</h2>
                <p className="mt-1 text-[0.875rem] text-stone-deep">Applying as {session.user.email}.</p>
                <HostApplicationForm cities={cities} />
              </>
            ) : (
              <Notice title="Applications are paused">We&apos;re not accepting new hosts right now. Please check back soon.</Notice>
            ))}
        </section>
    </ServicePage>
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

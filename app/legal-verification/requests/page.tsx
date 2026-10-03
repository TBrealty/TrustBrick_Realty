import type { Metadata } from "next";
import Link from "next/link";
import { ServicePage } from "@/components/navigation/ServicePage";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { getSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { LEGAL_SERVICE_INFO, LEGAL_STATUS_LABELS } from "@/lib/legal/services";
import { LEGAL_SHELL } from "@/lib/listings/services";
import { listOwnLegalRequests } from "@/lib/services/legal";
import type { LegalRequestStatus, LegalService } from "@/lib/vocab";

export const metadata: Metadata = { title: "Your legal verification requests — Trustbrick", robots: { index: false } };

const STEPS: LegalRequestStatus[] = ["new", "contacted", "in_progress", "completed"];
const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

function Progress({ status }: { status: LegalRequestStatus }) {
  if (status === "closed") return null;
  const at = STEPS.indexOf(status);
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0">
          <span aria-hidden className={`block h-1 rounded-full ${i <= at ? "bg-sage" : "bg-sand"}`} />
          <span className={`mt-1.5 block truncate text-[0.75rem] ${i === at ? "font-medium text-ink" : "text-stone-deep"}`}>
            {LEGAL_STATUS_LABELS[s].label}
            {i === at && <span className="sr-only"> (current)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function RequestsPage() {
  const session = await getSession();
  const requests = session ? await listOwnLegalRequests(session.user.id) : [];

  return (
    <ServicePage shell={LEGAL_SHELL} current="requests" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Your requests" title={<>Where your <em>verification</em> is.</>}>
        Requests you made while logged in, and how far along each one is. The team calls or emails you at each step.
      </ToolIntro>

      {!session ? (
        <div className="mt-10 max-w-xl border border-line-light bg-card p-6 sm:p-8">
          <p className="font-medium">Log in to see your requests</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">
            Requests made while logged in appear here. If you applied without an account, the team will keep you posted by phone and email; quote your LGL- reference if you write to us.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/login?next=${encodeURIComponent("/legal-verification/requests")}`} className="btn btn-dark btn-compact">
              <span>Log in</span>
            </Link>
            <Link href="/legal-verification/apply" className="btn btn-ghost-dark btn-compact">
              <span>Apply for verification</span>
            </Link>
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="mt-10 max-w-xl border border-line-light bg-card p-6 sm:p-8">
          <p className="font-medium">No requests yet</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite">When you apply for a verification, you&apos;ll be able to follow it here.</p>
          <Link href="/legal-verification/apply" className="btn btn-dark btn-compact mt-6">
            <span>Apply for verification</span>
          </Link>
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {requests.map((r) => (
            <li key={r.referenceId} className="border border-line-light bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium">{LEGAL_SERVICE_INFO[r.service as LegalService]?.label ?? r.service}</p>
                <span className="font-mono text-[0.8125rem] text-stone-deep">{r.referenceId}</span>
              </div>
              <p className="mt-1 text-[0.875rem] text-graphite">
                {r.location} · applied {formatDate(r.createdAt, DAY)}
              </p>
              <Progress status={r.status} />
              <p className={`mt-4 text-[0.875rem] leading-relaxed ${r.status === "closed" ? "text-brick" : "text-graphite"}`}>
                {LEGAL_STATUS_LABELS[r.status].forApplicant}
                {r.statusChangedAt && <span className="text-stone-deep"> Updated {formatDate(r.statusChangedAt, DAY)}.</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  );
}

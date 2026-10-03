import type { Metadata } from "next";
import Link from "next/link";
import { LegalRequestForm } from "@/components/legal/LegalRequestForm";
import { ServicePage } from "@/components/navigation/ServicePage";
import { ToolIntro } from "@/components/tools/ToolIntro";
import { getSession } from "@/lib/auth/session";
import { LEGAL_SHELL } from "@/lib/listings/services";
import { listingForLegal } from "@/lib/services/legal";
import { normalizeReferenceId } from "@/lib/reference";
import { LEGAL_SERVICES, type LegalService } from "@/lib/vocab";

export const metadata: Metadata = {
  title: "Apply for legal verification — Trustbrick",
  description: "Ask for a property's documents to be verified, or a title search and legal opinion, by an independent advocate. We call you to agree the scope and fee first.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const NEXT = [
  ["We call you", "To understand the property and what you need, and to agree the scope and the fee in writing."],
  ["You share the documents", "Copies go to the advocate handling your request, never through a public form."],
  ["The advocate checks", "The papers, and, for a title search, the records at the Sub-Registrar and revenue offices."],
  ["You get the report", "Signed by the advocate, with what's clear, what's missing and what to ask the seller."],
] as const;

export default async function ApplyPage({ searchParams }: Props) {
  const [q, session] = await Promise.all([searchParams, getSession()]);
  const service = LEGAL_SERVICES.find((s) => s === one(q.service)) as LegalService | undefined;
  const listingRef = one(q.listing);
  const listing = listingRef ? await listingForLegal(normalizeReferenceId(listingRef)) : null;
  const place = listing ? [listing.locality, listing.city].filter(Boolean).join(", ") || null : null;

  return (
    <ServicePage shell={LEGAL_SHELL} current="apply" mainClassName="shell pt-8 pb-20 sm:pt-12">
      <ToolIntro eyebrow="Apply" title={<>Apply for <em>legal verification.</em></>}>
        Tell us about the property and what you need. It takes about two minutes; nothing is charged until you&apos;ve agreed the fee.
      </ToolIntro>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
        <LegalRequestForm
          defaults={{
            service: service ?? (listing ? "title_opinion" : undefined),
            state: listing?.state ?? undefined,
            location: place ?? undefined,
            listing: listing ? { referenceId: listing.referenceId, title: listing.title, place } : undefined,
            name: session?.user.name ?? "",
            email: session?.user.email ?? "",
            signedIn: Boolean(session),
          }}
        />

        <aside aria-labelledby="after-title" className="lg:sticky lg:top-[calc(var(--sticky-top,var(--header-h))+1.5rem)] lg:self-start">
          <h2 id="after-title" className="eyebrow text-stone-deep">
            After you apply
          </h2>
          <ol className="mt-5 space-y-5">
            {NEXT.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
                <span className="font-mono text-[0.8125rem] text-stone-deep tabular-nums">0{i + 1}</span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-[0.875rem] leading-relaxed text-graphite">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          {!session && (
            <p className="mt-8 border-t border-line-light pt-5 text-[0.875rem] leading-relaxed text-graphite">
              <Link href={`/login?next=${encodeURIComponent("/legal-verification/apply")}`} className="font-medium underline">
                Log in
              </Link>{" "}
              first to follow your request&apos;s progress online. You can apply without an account too.
            </p>
          )}
        </aside>
      </div>
    </ServicePage>
  );
}

import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { ListingTrust } from "@/lib/listings/queries";

const day = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });

/**
 * "Checked by Trustbrick": the checks this listing has actually passed, in plain words. A check
 * that wasn't done is left out rather than shown as failed; only what the product records.
 */
export function TrustPanel({ trust, reraId, id }: { trust: ListingTrust; reraId: string | null; id?: string }) {
  const { person, organization } = trust;
  const checks: string[] = [];
  if (trust.reviewedAt) checks.push(`Reviewed and approved by our team on ${day(trust.reviewedAt)}`);
  if (person?.approved) {
    checks.push(
      person.role === "host"
        ? person.verified
          ? `${person.name} is an approved host, identity checked`
          : `${person.name} is an approved host`
        : person.verified
          ? `${person.name} is a verified agent: identity and RERA checked`
          : `${person.name} is an approved agent`,
    );
  }
  if (organization?.verified) checks.push(`${organization.name} is verified: GST and company details checked`);
  if (reraId) checks.push(`RERA registration ${reraId}`);
  if (trust.propertyVerified) checks.push("The property itself was checked by Trustbrick");

  return (
    <div id={id} className="scroll-mt-28 border border-sage/35 bg-sage/[0.07] p-4">
      <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-sage-deep">
        <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M8 1.5 2.5 3.5v4c0 3.3 2.3 5.8 5.5 7 3.2-1.2 5.5-3.7 5.5-7v-4z" />
          <path d="m5.5 8 1.75 1.75L10.75 6" />
        </svg>
        Checked by Trustbrick
      </p>
      <ul className="mt-2.5 space-y-1.5 text-[0.8125rem] leading-snug text-graphite">
        {checks.map((c) => (
          <li key={c} className="flex gap-2">
            <span aria-hidden className="font-semibold text-sage-deep">
              ✓
            </span>
            {c}
          </li>
        ))}
      </ul>
      {organization && !organization.verified && <p className="mt-2 text-[0.8125rem] text-stone-deep">Listed through {organization.name}.</p>}
      <Link href="/#trust" className="link-rule mt-3 inline-block text-[0.8125rem] font-medium text-brick">
        How we check listings →
      </Link>
    </div>
  );
}

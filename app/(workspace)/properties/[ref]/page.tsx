import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingActions } from "@/components/workspace/ListingActions";
import { ListingCommissionCard } from "@/components/workspace/ListingCommissionCard";
import { ListingOverview } from "@/components/workspace/ListingOverview";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, SampleNotice, StatCard, Status, StatusBadge, Timeline } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import type { CaseFlags } from "@/lib/db/schema/trust";
import { AppError } from "@/lib/errors";
import { formatDay, formatListingPrice } from "@/lib/format";
import { STATUS_LABELS, STATUS_TONES, isEditable } from "@/lib/listings/lifecycle";
import { isReferenceId } from "@/lib/reference";
import { auditTrailFor } from "@/lib/services/audit-log";
import { latestListingForProperty } from "@/lib/services/listings/access";
import { dealContextFor, listingCommission } from "@/lib/services/commission";
import { getListingForActor } from "@/lib/services/listings/queries";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ submitted?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function PropertyDetailPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { submitted } = await searchParams;
  const actor = await requirePermission("listings.view", `/properties/${ref}`);
  if (isReferenceId(ref, "PRP")) {
    const latest = await latestListingForProperty(actor, ref, "listings.view");
    if (!latest) notFound();
    redirect(`/properties/${latest}`);
  }
  const listing = await getListingForActor(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const audit = can(actor, "audit.view", "platform") ? await auditTrailFor(actor, [listing.referenceId, listing.propertyReferenceId]) : null;
  const openCase = listing.cases.find((c) => c.status === "open" || c.status === "in_review");
  const canEdit = actor.workspace === "professional" && can(actor, "listings.edit") && isEditable(listing.status);
  const [deal, commission] = await Promise.all([["published", "paused"].includes(listing.status) ? dealContextFor(listing) : null, listingCommission(actor, listing)]);

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/properties">Properties</BackLink>}
        title={listing.title}
        meta={
          <>
            <StatusBadge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</StatusBadge>
            <span className="inline-flex items-center gap-1">
              Listing <ReferenceId value={listing.referenceId} />
            </span>
            <span className="inline-flex items-center gap-1">
              Property <ReferenceId value={listing.propertyReferenceId} />
            </span>
            {listing.isSample && <span className="rounded-[2px] bg-ink px-1.5 py-0.5 font-mono text-[0.625rem] tracking-wider text-paper uppercase">Sample</span>}
          </>
        }
        actions={
          <>
            {listing.status === "published" && (
              <Link href={`/listings/${listing.referenceId}`} className="wbtn wbtn-ghost wbtn-sm" target="_blank">
                View public page ↗
              </Link>
            )}
            <ListingActions actor={actor} referenceId={listing.referenceId} status={listing.status} purpose={listing.purpose} caseReferenceId={openCase?.referenceId} deal={deal} />
          </>
        }
      />

      {submitted && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          Submitted for approval. It&apos;s waiting for a Trustbrick admin to approve or reject it, with a remark; you&apos;ll get a notification either way.
        </p>
      )}
      {listing.isSample && <SampleNotice>This listing is development sample data. It is not a real property.</SampleNotice>}
      {listing.status === "published" && listing.cases[0]?.status === "approved" && listing.cases[0].decisionReason && (
        <p className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">Approved by Trustbrick:</strong> {listing.cases[0].decisionReason}
        </p>
      )}
      {listing.statusReason && ["changes_requested", "rejected", "unpublished", "paused", "removed"].includes(listing.status) && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">{listing.status === "paused" ? "Paused" : listing.status === "rejected" ? "Rejected by Trustbrick" : "Reviewer's note"}:</strong> {listing.statusReason}
          {actor.workspace === "professional" && isEditable(listing.status) && (
            <>
              {" "}
              <Link href={`/properties/${ref}/edit`} className="font-medium text-ink underline">
                Make the changes
              </Link>
            </>
          )}
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Price" value={formatListingPrice(listing.pricing.price, listing.purpose)} />
        <StatCard label="Views" value={listing.stats.views} hint={`${listing.stats.uniqueViewers} unique viewers`} />
        <StatCard label="Leads" value={listing.stats.leads} href={can(actor, "leads.view") ? `/leads?q=${listing.referenceId}` : undefined} />
        <StatCard label="Visits" value={listing.stats.visits} />
        <StatCard label="Saved by" value={listing.stats.saves} hint="customers" />
      </div>

      {/* One box per step of the form: photos, location, amenities, details, pricing. */}
      <ListingOverview listing={listing} editHref={canEdit ? (step) => `/properties/${ref}/edit?step=${step}` : undefined} />

      {commission && (
        <div className="mt-5">
          <ListingCommissionCard data={commission} team={actor.workspace === "platform"} personal={actor.organization.orgType === "personal"} editPricingHref={canEdit ? `/properties/${ref}/edit?step=pricing` : undefined} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {listing.cases.length > 0 && (
          <Card title="Reviews">
            <ul className="space-y-4">
              {listing.cases.map((k) => {
                const flags = k.flags as CaseFlags;
                return (
                  <li key={k.referenceId} className="rounded-[3px] border border-line-light p-3 text-[0.8125rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReferenceId value={k.referenceId} href={can(actor, "listings.approve", "platform") || can(actor, "verification.view", "platform") ? `/approvals/${k.referenceId}` : undefined} />
                      <Status value={k.status} />
                      <span className="text-stone-deep">{formatDay(k.createdAt)}</span>
                    </div>
                    {k.decisionReason && (
                      <p className="mt-2 text-graphite">
                        <span className="text-stone-deep">Remark:</span> “{k.decisionReason}”
                      </p>
                    )}
                    {(flags.quality?.length ?? 0) > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-stone-deep">
                        {flags.quality!.map((q) => (
                          <li key={q.code}>{q.message}</li>
                        ))}
                      </ul>
                    )}
                    {(flags.duplicates?.length ?? 0) > 0 && actor.workspace === "platform" && (
                      <p className="mt-2 text-amber">Possible duplicates: {flags.duplicates!.map((d) => d.referenceId).join(", ")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
          <Card title="Responsibility">
          <DescriptionList
            columns={1}
            items={[
              [
                "Agent",
                listing.agent ? (
                  <span key="a">
                    {listing.agent.name}
                    {listing.agent.referenceId && (
                      <>
                        {" "}
                        <ReferenceId value={listing.agent.referenceId} href={can(actor, "agents.view", "platform") ? `/agents/${listing.agent.referenceId}` : undefined} copy={false} />
                      </>
                    )}
                  </span>
                ) : null,
              ],
              [
                "Organization",
                <span key="o">
                  {listing.organization.name}{" "}
                  <ReferenceId value={listing.organization.referenceId} href={can(actor, "organizations.view", "platform") ? `/organizations/${listing.organization.referenceId}` : undefined} copy={false} />
                </span>,
              ],
              ["Created", formatDay(listing.createdAt)],
              ["Submitted", listing.submittedAt ? formatDay(listing.submittedAt) : null],
              ["Published", listing.publishedAt ? formatDay(listing.publishedAt) : null],
            ]}
          />
        </Card>
        <Card title="Status history">
          <Timeline
            items={listing.history.map((h, i) => ({
              id: String(i),
              title: (
                <>
                  {h.fromStatus ? `${STATUS_LABELS[h.fromStatus as keyof typeof STATUS_LABELS] ?? h.fromStatus} → ` : ""}
                  <strong className="font-medium">{STATUS_LABELS[h.toStatus as keyof typeof STATUS_LABELS] ?? h.toStatus}</strong>
                </>
              ),
              body: h.reason ? `“${h.reason}”` : undefined,
              at: h.createdAt,
              actor: h.actorName ?? (h.action === "auto_approve" ? "Automatic" : null),
            }))}
          />
        </Card>
        {audit && (
          <Card title="Audit trail">
            <Timeline
              items={audit.map((e) => ({ id: e.id, title: <span className="font-mono text-[0.75rem]">{e.eventType}</span>, at: e.createdAt, actor: e.actorName ?? e.actorRole }))}
              empty="No audited actions yet."
            />
          </Card>
        )}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TourDecision } from "@/components/tours/TourDecision";
import { TourViewer } from "@/components/tours/TourViewer";
import { ListingActions } from "@/components/workspace/ListingActions";
import { ListingOverview } from "@/components/workspace/ListingOverview";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, SampleNotice, Status, StatusBadge } from "@/components/workspace/ui";
import { requireActor } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/listings/lifecycle";
import { getListingForActor } from "@/lib/services/listings/queries";
import { getCase } from "@/lib/services/moderation";
import { REPORT_REASON_LABELS, listReports } from "@/lib/services/reports";
import { tourChangesWithNames } from "@/lib/services/tour-review";
import { tourDataForProperty } from "@/lib/services/tours";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Review ${(await params).ref}` };
}

export default async function CasePage({ params }: Props) {
  const { ref } = await params;
  const actor = await requireActor(`/approvals/${ref}`);
  const kase = await getCase(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  // Agent applications and organization checks are decided on their own pages.
  if (kase.subject.kind === "agent") redirect(`/agents/${kase.subject.referenceId}`);
  if (kase.subject.kind === "organization") redirect(`/organizations/${kase.subject.referenceId}`);

  const listing = await getListingForActor(actor, kase.subject.referenceId);
  if (kase.caseType === "tour_review") return <TourCase kase={kase} listing={listing} />;
  const reports = kase.openReports > 0 ? (await listReports(actor, { status: "open" }, 1)).rows.filter((r) => r.listingReferenceId === listing.referenceId) : [];
  const decided = !["open", "in_review"].includes(kase.status);

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/approvals">Approvals</BackLink>}
        title={listing.title}
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              Case <ReferenceId value={kase.referenceId} />
            </span>
            <Status value={kase.status} />
            <span className="inline-flex items-center gap-1">
              Listing <ReferenceId value={listing.referenceId} href={`/properties/${listing.referenceId}`} />
            </span>
            <StatusBadge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</StatusBadge>
          </>
        }
        actions={<ListingActions actor={actor} referenceId={listing.referenceId} status={listing.status} purpose={listing.purpose} />}
      />
      {listing.isSample && <SampleNotice>This listing is development sample data.</SampleNotice>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card title="Automated checks" description="Signals for you to weigh. None of them rejects anything on its own.">
            {(kase.flags.duplicates?.length ?? 0) === 0 && (kase.flags.quality?.length ?? 0) === 0 ? (
              <p className="text-[0.8125rem] text-sage">✓ No duplicate candidates or quality notes.</p>
            ) : (
              <div className="space-y-4">
                {(kase.flags.duplicates?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-[0.8125rem] font-medium text-amber">Possible duplicates</h3>
                    <ul className="mt-2 space-y-2">
                      {kase.flags.duplicates!.map((d) => (
                        <li key={d.referenceId} className="rounded-[3px] border border-line-light px-3 py-2 text-[0.8125rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <ReferenceId value={d.referenceId} href={`/properties/${d.referenceId}`} />
                            <span>{d.title}</span>
                          </div>
                          <p className="mt-1 text-stone-deep">{d.reasons.join(" · ")}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(kase.flags.quality?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-[0.8125rem] font-medium">Quality notes</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8125rem] text-graphite">
                      {kase.flags.quality!.map((q) => (
                        <li key={q.code}>{q.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          {reports.length > 0 && (
            <Card title={`Open reports (${reports.length})`} actions={<Link href="/reports" className="wbtn wbtn-secondary wbtn-sm">All reports</Link>}>
              <ul className="space-y-2 text-[0.8125rem]">
                {reports.map((r) => (
                  <li key={r.referenceId} className="rounded-[3px] border border-line-light px-3 py-2">
                    <p className="font-medium">{REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS]}</p>
                    {r.details && <p className="mt-0.5 text-graphite">“{r.details}”</p>}
                    <p className="mt-1 text-stone-deep">
                      <ReferenceId value={r.referenceId} copy={false} /> · {r.reporterName ?? "Anonymous"} · {formatDateTime(r.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* The whole listing, box by box, as the agent filled it in. */}
          <ListingOverview listing={listing} />
        </div>

        <div className="space-y-6">
          <Card title="Case">
            <DescriptionList
              columns={1}
              items={[
                ["Submitted by", kase.submittedBy],
                ["Submitted", formatDateTime(kase.createdAt)],
                ["Reviewer", kase.assignedTo],
                ["Decision", decided ? <Status key="s" value={kase.status} /> : "Waiting"],
                ["Decided by", kase.decidedBy],
                ["Remark", kase.decisionReason],
              ]}
            />
          </Card>
          <Card title="Agent">
            <DescriptionList
              columns={1}
              items={[
                ["Agent", listing.agent ? <span key="a">{listing.agent.name} {listing.agent.referenceId && <ReferenceId value={listing.agent.referenceId} href={`/agents/${listing.agent.referenceId}`} copy={false} />}</span> : null],
                ["Organization", <span key="o">{listing.organization.name} <ReferenceId value={listing.organization.referenceId} href={`/organizations/${listing.organization.referenceId}`} copy={false} /></span>],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

type Kase = Awaited<ReturnType<typeof getCase>>;
type Listing = Awaited<ReturnType<typeof getListingForActor>>;

/**
 * A change to a live listing's tour. It's already showing, so the question is only whether it
 * stays: approve it, or hide the tour with a remark.
 */
async function TourCase({ kase, listing }: { kase: Kase; listing: Listing }) {
  const [changes, tour] = await Promise.all([tourChangesWithNames(kase.flags), tourDataForProperty(listing.propertyId)]);
  const decided = !["open", "in_review"].includes(kase.status);
  const empty = tour.rooms.length === 0 && !tour.model && !tour.link;
  // For a tour, "rejected" means it was hidden.
  const outcome =
    kase.status === "rejected" ? (
      <span key="s" className="rounded-full bg-brick/10 px-2 py-0.5 text-[0.75rem] font-medium text-brick">
        Tour hidden
      </span>
    ) : (
      <Status key="s" value={kase.status} />
    );
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/approvals?type=tour_review">Approvals · Virtual tours</BackLink>}
        title={`Virtual tour: ${listing.title}`}
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              Case <ReferenceId value={kase.referenceId} />
            </span>
            {outcome}
            <span className="inline-flex items-center gap-1">
              Listing <ReferenceId value={listing.referenceId} href={`/properties/${listing.referenceId}`} />
            </span>
            <StatusBadge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</StatusBadge>
          </>
        }
      />
      {listing.isSample && <SampleNotice>This listing is development sample data.</SampleNotice>}
      {tour.hidden && (
        <p className="mb-5 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3.5 py-2.5 text-[0.8125rem] text-graphite">
          <strong className="font-medium text-ink">Hidden from guests and buyers</strong> since {formatDateTime(tour.hidden.at)}
          {tour.hidden.reason ? `: “${tour.hidden.reason}”` : "."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card
            title="What changed"
            description={
              tour.hidden && !decided
                ? "Made while the tour was hidden, so nobody outside the team has seen them. Approving shows the tour again."
                : "Made on the live listing, so each change was showing to Plus members as soon as it was made."
            }
          >
            <ol className="space-y-2 text-[0.8125rem]">
              {changes.map((c, i) => (
                <li key={`${c.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line-light pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-ink">{c.what}</span>
                  <span className="text-stone-deep">
                    {c.by ?? "Someone"} · {formatDateTime(c.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="The tour now" description={tour.hidden ? "What Plus members will see if you approve." : "Exactly what Plus members see."}>
            {empty ? <p className="text-[0.875rem] text-stone-deep">The tour is empty now: everything in it was removed.</p> : <TourViewer tour={tour} title={listing.title} />}
          </Card>
        </div>

        <div className="space-y-6">
          {!decided && (
            <Card title="Decision">
              <TourDecision caseReference={kase.referenceId} listingReference={listing.referenceId} hidden={Boolean(tour.hidden)} />
            </Card>
          )}
          <Card title="Case">
            <DescriptionList
              columns={1}
              items={[
                ["First change", formatDateTime(kase.createdAt)],
                ["By", kase.submittedBy],
                ["Decision", decided ? outcome : "Waiting"],
                ["Decided by", kase.decidedBy],
                ["Remark", kase.decisionReason],
              ]}
            />
          </Card>
          <Card title={listing.purpose === "stay" ? "Host" : "Agent"}>
            <DescriptionList
              columns={1}
              items={[
                [listing.purpose === "stay" ? "Host" : "Agent", listing.agent ? <span key="a">{listing.agent.name} {listing.agent.referenceId && <ReferenceId value={listing.agent.referenceId} href={`/agents/${listing.agent.referenceId}`} copy={false} />}</span> : null],
                ["Organization", <span key="o">{listing.organization.name} <ReferenceId value={listing.organization.referenceId} href={`/organizations/${listing.organization.referenceId}`} copy={false} /></span>],
              ]}
            />
          </Card>
          <Link href={`/properties/${listing.referenceId}`} className="wbtn wbtn-secondary w-full">
            Open the whole listing
          </Link>
        </div>
      </div>
    </>
  );
}

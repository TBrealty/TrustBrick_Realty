import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

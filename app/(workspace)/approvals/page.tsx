import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Pagination, Status, Tabs, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requireActor } from "@/lib/authz/session";
import { QUEUES, type Queue, listCases, moderationFilters, queueCounts } from "@/lib/services/moderation";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Approvals" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TYPES = [
  { key: "listing_review", label: "Listings", permission: "listings.approve" },
  { key: "tour_review", label: "Virtual tours", permission: "listings.approve" },
  { key: "agent_application", label: "Agent applications", permission: "agents.verify" },
  { key: "organization_verification", label: "Organizations", permission: "organizations.verify" },
] as const;

export default async function ModerationPage({ searchParams }: Props) {
  const actor = await requireActor("/approvals");
  const params = await searchParams;
  const visible = TYPES.filter((t) => can(actor, t.permission, "platform") || can(actor, "verification.view", "platform"));
  if (visible.length === 0) forbidden();
  const parsed = moderationFilters.parse(params);
  const type = visible.some((t) => t.key === parsed.type) ? parsed.type : visible[0].key;
  const filters = { ...parsed, type };
  const page = parsePage(params.page);
  const [result, counts] = await Promise.all([listCases(actor, filters, page), queueCounts(actor, type)]);
  const queues: Queue[] =
    type === "listing_review" ? (Object.keys(QUEUES) as Queue[]) : type === "tour_review" ? ["pending", "rejected", "recent"] : ["pending", "in_review", "rejected", "recent"];
  const queueLabel = (q: Queue) => (type === "tour_review" && q === "pending" ? "Waiting for a check" : type === "tour_review" && q === "rejected" ? "Hidden" : QUEUES[q]);

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Everything waiting for a decision. Oldest first, so nothing waits longer than it has to. Automated checks only flag; people decide."
      />
      <Tabs label="Case type" items={visible.map((t) => ({ href: `/approvals?type=${t.key}`, label: t.label, active: t.key === type }))} />
      <div className="mb-4 flex flex-wrap gap-2" role="list" aria-label="Queues">
        {queues.map((q) => (
          <Link
            key={q}
            role="listitem"
            href={`/approvals?type=${type}&queue=${q}`}
            aria-current={filters.queue === q ? "page" : undefined}
            className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[0.8125rem] ${filters.queue === q ? "border-ink bg-ink text-paper" : "border-line-light bg-card text-graphite hover:border-ink/40"}`}
          >
            {queueLabel(q)}
            <span className="tabular-nums opacity-75">{counts[q]}</span>
          </Link>
        ))}
      </div>
      <Card padded={false}>
        <DataTable
          caption={`${queueLabel(filters.queue)} cases`}
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="Nothing in this queue">When something is submitted it appears here, and the people who can decide it are notified.</EmptyState>}
          columns={[
            { header: "Case", cell: (r) => <ReferenceId value={r.referenceId} href={`/approvals/${r.referenceId}`} /> },
            {
              header: "Subject",
              cell: (r) => (
                <div className="min-w-48">
                  <Link href={`/approvals/${r.referenceId}`} className="font-medium hover:underline">
                    {r.subject.title}
                  </Link>
                  <div>
                    <ReferenceId value={r.subject.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <Status value={r.status} /> },
            {
              header: "Flags",
              cell: (r) => (
                <div className="flex flex-wrap gap-1.5 text-[0.75rem]">
                  {r.duplicates > 0 && <span className="rounded-full bg-amber/12 px-2 py-0.5 text-amber">{r.duplicates} possible duplicate{r.duplicates > 1 ? "s" : ""}</span>}
                  {r.qualityFlags > 0 && <span className="rounded-full bg-ink/6 px-2 py-0.5 text-graphite">{r.qualityFlags} quality note{r.qualityFlags > 1 ? "s" : ""}</span>}
                  {r.openReports > 0 && <span className="rounded-full bg-brick/10 px-2 py-0.5 text-brick">{r.openReports} report{r.openReports > 1 ? "s" : ""}</span>}
                  {r.tourChanges > 0 && <span className="rounded-full bg-slate/10 px-2 py-0.5 whitespace-nowrap text-slate">{r.tourChanges} change{r.tourChanges > 1 ? "s" : ""}{r.tourHidden || r.status === "rejected" ? "" : ", live now"}</span>}
                  {r.tourHidden && ["open", "in_review"].includes(r.status) && <span className="rounded-full bg-brick/10 px-2 py-0.5 whitespace-nowrap text-brick">Tour hidden: fix to check</span>}
                  {r.duplicates + r.qualityFlags + r.openReports + r.tourChanges === 0 && <span className="text-stone-deep">None</span>}
                </div>
              ),
              hideBelow: "md",
            },
            { header: "Submitted by", cell: (r) => r.submittedBy ?? "—", hideBelow: "lg" },
            { header: "Reviewer", cell: (r) => r.assignedTo ?? "—", hideBelow: "xl" },
            { header: "Waiting", cell: (r) => <When at={r.createdAt} /> },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/approvals" />
      </Card>
    </>
  );
}

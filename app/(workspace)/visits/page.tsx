import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { VisitControls } from "@/components/workspace/VisitControls";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { formatDateTime } from "@/lib/format";
import { VISIT_STATUS_LABELS, listVisits, visitFilters } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Visits" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function VisitsPage({ searchParams }: Props) {
  const actor = await requirePermission("visits.view", "/visits");
  const params = await searchParams;
  const filters = visitFilters.parse(params);
  const result = await listVisits(actor, filters, parsePage(params.page));
  const manage = can(actor, "visits.manage") && actor.workspace === "professional";

  return (
    <>
      <PageHeader title="Visits" description="Site visits customers asked for. Requests waiting for a confirmed time come first. Times are IST." />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" aria-label="Filter visits">
          <AutoSubmit>
            <FilterSelect name="status" label="Status" value={filters.status} options={Object.entries(VISIT_STATUS_LABELS)} />
            <label className="flex h-9 items-center gap-2 text-[0.8125rem]">
              <input type="checkbox" name="upcoming" value="1" defaultChecked={filters.upcoming} className="size-4 accent-ink" />
              Upcoming only
            </label>
          </AutoSubmit>
          <noscript>
            <button type="submit" className="wbtn wbtn-secondary">
              Apply
            </button>
          </noscript>
        </form>
        <DataTable
          caption="Visits"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No visits">When a customer asks to visit one of your properties, it appears here.</EmptyState>}
          columns={[
            {
              header: "When",
              cell: (r) => (
                <div className="min-w-40">
                  <p className="font-medium">{r.scheduledAt ? formatDateTime(r.scheduledAt) : r.requestedFor ? `Asked: ${formatDateTime(r.requestedFor)}` : "Not set"}</p>
                  <ReferenceId value={r.referenceId} copy={false} />
                </div>
              ),
            },
            { header: "Customer", cell: (r) => (r.leadReferenceId ? <Link href={`/leads/${r.leadReferenceId}`} className="hover:underline">{r.contactName}</Link> : (r.contactName ?? "—")) },
            { header: "Property", cell: (r) => (r.listingReferenceId ? <Link href={`/properties/${r.listingReferenceId}`} className="line-clamp-1 hover:underline">{r.listingTitle}</Link> : "—"), hideBelow: "md" },
            { header: "Status", cell: (r) => <Status value={r.status} label={VISIT_STATUS_LABELS[r.status]} /> },
            ...(actor.permissions["visits.view"] !== "own" ? [{ header: "Agent", cell: (r: (typeof result.rows)[number]) => r.agentName ?? "—", hideBelow: "lg" as const }] : []),
            ...(manage ? [{ header: <span className="sr-only">Actions</span>, cell: (r: (typeof result.rows)[number]) => <VisitControls visit={r} /> }] : []),
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/visits" />
      </Card>
    </>
  );
}

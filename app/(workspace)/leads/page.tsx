import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { LEAD_STATUS_LABELS, leadFilters, listLeads } from "@/lib/services/crm";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Leads" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LeadsPage({ searchParams }: Props) {
  const actor = await requirePermission("leads.view", "/leads");
  const params = await searchParams;
  const filters = leadFilters.parse(params);
  const result = await listLeads(actor, filters, parsePage(params.page));
  const scope = actor.permissions["leads.view"];

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          scope === "platform"
            ? "Every enquiry customers have made on Trustbrick. Read-only here; agents work their own leads."
            : "Customers who enquired about your listings. New ones first, then by latest activity."
        }
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter leads">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="LEAD- or LST- reference, name, phone or email" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="status" label="Stage" value={filters.status} options={Object.entries(LEAD_STATUS_LABELS)} />
            <label className="flex h-9 items-center gap-2 text-[0.8125rem]">
              <input type="checkbox" name="open" value="1" defaultChecked={filters.open} className="size-4 accent-ink" />
              Open only
            </label>
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Leads"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No leads yet">When a customer contacts you from a live listing, the lead appears here and you&apos;re notified.</EmptyState>}
          columns={[
            {
              header: "Customer",
              cell: (r) => (
                <div className="min-w-40">
                  <Link href={`/leads/${r.referenceId}`} className="font-medium hover:underline">
                    {r.contactName}
                  </Link>
                  <div>
                    <ReferenceId value={r.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            { header: "Phone", cell: (r) => r.contactPhone ?? "—", hideBelow: "md" },
            { header: "Listing", cell: (r) => (r.listingReferenceId ? <Link href={`/properties/${r.listingReferenceId}`} className="line-clamp-1 hover:underline">{r.listingTitle}</Link> : "—"), hideBelow: "lg" },
            { header: "Stage", cell: (r) => <Status value={r.status} label={LEAD_STATUS_LABELS[r.status]} /> },
            ...(scope !== "own" ? [{ header: "Agent", cell: (r: (typeof result.rows)[number]) => r.agentName ?? "—", hideBelow: "lg" as const }] : []),
            { header: "Came in", cell: (r) => <When at={r.createdAt} />, hideBelow: "sm" },
            { header: "Last activity", cell: (r) => <When at={r.lastActivityAt} />, hideBelow: "xl" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/leads" />
      </Card>
    </>
  );
}

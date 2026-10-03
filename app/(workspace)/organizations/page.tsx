import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ViewSummary } from "@/components/workspace/SummaryDialog";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { ORG_TYPE_LABELS, listOrganizations, organizationFilters } from "@/lib/services/organizations";
import { parsePage } from "@/lib/services/pagination";

export const metadata: Metadata = { title: "Organizations" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OrganizationsPage({ searchParams }: Props) {
  const actor = await requirePermission("organizations.view", "/organizations", "platform");
  const params = await searchParams;
  const filters = organizationFilters.parse(params);
  const result = await listOrganizations(actor, filters, parsePage(params.page));

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Brokerages, developers, property managers, PG operators and vendors. Independent agents' personal organizations are hidden unless you filter for them."
        actions={
          can(actor, "organizations.manage", "platform") ? (
            <Link href="/organizations/new" className="wbtn wbtn-primary">
              + Add organization
            </Link>
          ) : undefined
        }
      />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter organizations">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="ORG- reference or name" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect
              name="status"
              label="Status"
              value={filters.status}
              options={[
                ["pending", "Pending"],
                ["active", "Active"],
                ["suspended", "Suspended"],
                ["rejected", "Rejected"],
                ["archived", "Archived"],
              ]}
            />
            <FilterSelect name="type" label="Type" value={filters.type} options={Object.entries(ORG_TYPE_LABELS).filter(([k]) => k !== "internal")} />
            <FilterSelect
              name="verification"
              label="Verification"
              value={filters.verification}
              options={[
                ["verified", "Verified"],
                ["unverified", "Unverified"],
                ["pending", "Pending"],
                ["rejected", "Rejected"],
              ]}
            />
            <label className="flex h-9 items-center gap-2 text-[0.8125rem]">
              <input type="checkbox" name="includeSample" value="1" defaultChecked={filters.includeSample} className="size-4 accent-ink" />
              Include sample data
            </label>
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Organizations"
          rows={result.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No organizations match">{!filters.includeSample ? "Sample organizations are hidden; tick “Include sample data” to see them." : undefined}</EmptyState>}
          columns={[
            {
              header: "Organization",
              cell: (r) => (
                <div className="min-w-44">
                  <Link href={`/organizations/${r.referenceId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <ReferenceId value={r.referenceId} copy={false} />
                    {r.isSample && <span className="rounded-[2px] bg-ink px-1 font-mono text-[0.625rem] text-paper uppercase">Sample</span>}
                  </div>
                </div>
              ),
            },
            { header: "Type", cell: (r) => ORG_TYPE_LABELS[r.orgType] ?? r.orgType, hideBelow: "sm" },
            { header: "Status", cell: (r) => <Status value={r.status} /> },
            { header: "Verification", cell: (r) => <Status value={r.verificationStatus} />, hideBelow: "md" },
            { header: "City", cell: (r) => r.city ?? "—", hideBelow: "lg" },
            { header: "Agents", cell: (r) => r.agents, align: "right", hideBelow: "md" },
            { header: "Live / all listings", cell: (r) => `${r.liveListings} / ${r.listings}`, align: "right", hideBelow: "lg" },
            { header: "Added", cell: (r) => <When at={r.createdAt} />, hideBelow: "xl" },
            { header: "Action", cell: (r) => <ViewSummary kind="organization" referenceId={r.referenceId} name={r.name} />, align: "right" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/organizations" />
      </Card>
    </>
  );
}

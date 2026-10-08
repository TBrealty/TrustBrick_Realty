import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { PlanBadge } from "@/components/subscriptions/PlanBadge";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ViewSummary } from "@/components/workspace/SummaryDialog";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { parsePage } from "@/lib/services/pagination";
import { hostFilters, listHosts } from "@/lib/services/stays/hosts";

export const metadata: Metadata = { title: "Hosts" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostsPage({ searchParams }: Props) {
  const actor = await requirePermission("hosts.view", "/hosts", "platform");
  const params = await searchParams;
  const filters = hostFilters.parse(params);
  const result = await listHosts(actor, filters, parsePage(params.page));

  return (
    <>
      <PageHeader title="Hosts" description="People who host homestays. Applications wait here until someone checks the applicant's identity and approves them." />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter hosts">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="HST- or USR- reference, name, email or phone" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect
              name="status"
              label="Status"
              value={filters.status}
              options={[
                ["pending", "Pending approval"],
                ["active", "Active"],
                ["suspended", "Suspended"],
                ["rejected", "Rejected"],
              ]}
            />
            {can(actor, "subscriptions.view", "platform") && (
              <FilterSelect
                name="subscription"
                label="Subscription"
                value={filters.subscription}
                options={[
                  ["subscribed", "Subscribed"],
                  ["paused", "Paused"],
                  ["free", "Free"],
                ]}
              />
            )}
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Hosts"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No hosts match">People apply at Become a host.</EmptyState>}
          columns={[
            {
              header: "Host",
              cell: (r) => (
                <div className="min-w-44">
                  <Link href={`/hosts/${r.referenceId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ReferenceId value={r.referenceId} copy={false} />
                    {r.plan && <PlanBadge plan={r.plan} />}
                  </div>
                </div>
              ),
            },
            {
              header: "Contact",
              cell: (r) => (
                <div className="text-[0.8125rem]">
                  <p>{r.email}</p>
                  <p className="text-stone-deep">{r.phone}</p>
                </div>
              ),
              hideBelow: "md",
            },
            { header: "City", cell: (r) => r.city ?? "—", hideBelow: "lg" },
            { header: "Status", cell: (r) => <Status value={r.status} /> },
            { header: "Identity", cell: (r) => <Status value={r.verificationStatus} />, hideBelow: "md" },
            { header: "Live / all stays", cell: (r) => `${r.liveStays} / ${r.stays}`, align: "right", hideBelow: "sm" },
            { header: "Bookings", cell: (r) => r.bookings, align: "right", hideBelow: "lg" },
            { header: "Applied", cell: (r) => <When at={r.createdAt} />, hideBelow: "xl" },
            {
              header: "Action",
              align: "right",
              // A pending application is reviewed on its page; anyone else opens the View card.
              cell: (r) =>
                r.status === "pending" ? (
                  <Link href={`/hosts/${r.referenceId}`} className="wbtn wbtn-secondary wbtn-sm">
                    Review
                  </Link>
                ) : (
                  <ViewSummary kind="host" referenceId={r.referenceId} name={r.name} />
                ),
            },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/hosts" />
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { PlanBadge } from "@/components/subscriptions/PlanBadge";
import Link from "next/link";
import { AutoSubmit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ViewSummary } from "@/components/workspace/SummaryDialog";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { parsePage } from "@/lib/services/pagination";
import { listUsers, userFilters } from "@/lib/services/users";

export const metadata: Metadata = { title: "Users" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UsersPage({ searchParams }: Props) {
  const actor = await requirePermission("users.view", "/users", "platform");
  const params = await searchParams;
  const filters = userFilters.parse(params);
  const result = await listUsers(actor, filters, parsePage(params.page));

  return (
    <>
      <PageHeader title="Users" description="Every account on Trustbrick: customers, agents and staff. Passwords, tokens and sessions are never shown." />
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter users">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="USR- reference, name, email or phone" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect
              name="kind"
              label="Kind"
              value={filters.kind}
              options={[
                ["customer", "Customers"],
                ["agent", "Agents"],
                ["staff", "Staff"],
              ]}
            />
            <FilterSelect
              name="status"
              label="Status"
              value={filters.status}
              options={[
                ["active", "Active"],
                ["suspended", "Suspended"],
                ["deactivated", "Deactivated"],
              ]}
            />
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
            <FilterSelect
              name="verified"
              label="Email"
              value={filters.verified}
              options={[
                ["yes", "Confirmed"],
                ["no", "Not confirmed"],
              ]}
            />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Users"
          rows={result.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No users match" />}
          columns={[
            {
              header: "Person",
              cell: (r) => (
                <div className="min-w-44">
                  <Link href={`/users/${r.referenceId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ReferenceId value={r.referenceId} copy={false} />
                    {r.plan && <PlanBadge plan={r.plan} />}
                  </div>
                </div>
              ),
            },
            { header: "Email", cell: (r) => <span className="break-all">{r.email}</span>, hideBelow: "md" },
            {
              header: "Kind",
              cell: (r) => (r.isStaff ? "Staff" : r.agentReferenceId ? "Agent" : "Customer"),
              hideBelow: "sm",
            },
            { header: "Status", cell: (r) => <Status value={r.status} /> },
            { header: "Email confirmed", cell: (r) => (r.emailVerified ? "Yes" : <span className="text-amber">No</span>), hideBelow: "lg" },
            { header: "Joined", cell: (r) => <When at={r.createdAt} />, hideBelow: "lg" },
            { header: "Last active", cell: (r) => <When at={r.lastActiveAt} />, hideBelow: "xl" },
            { header: "Action", cell: (r) => <ViewSummary kind="user" referenceId={r.referenceId} name={r.name} />, align: "right" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/users" />
      </Card>
    </>
  );
}

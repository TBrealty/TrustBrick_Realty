import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmit, ConfirmAction } from "@/components/workspace/forms";
import { PlanBadge } from "@/components/subscriptions/PlanBadge";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { ViewSummary } from "@/components/workspace/SummaryDialog";
import { Card, DataTable, EmptyState, FilterSelect, PageHeader, Pagination, Status, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { listAgentInvitations } from "@/lib/services/agent-invitations";
import { agentFilters, listAgents } from "@/lib/services/agents";
import { parsePage } from "@/lib/services/pagination";
import { revokeAgentInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Agents" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AgentsPage({ searchParams }: Props) {
  const actor = await requirePermission("agents.view", "/agents", "org");
  const params = await searchParams;
  const filters = agentFilters.parse(params);
  const platform = actor.permissions["agents.view"] === "platform";
  const canCreate = can(actor, "agents.create", "platform");
  const [result, invitations] = await Promise.all([
    listAgents(actor, filters, parsePage(params.page)),
    platform ? listAgentInvitations(actor) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={platform ? "Agents" : `Agents at ${actor.organization.name}`}
        description={platform ? "Every agent profile: applications, active agents and suspensions." : "The agents in your organization."}
        actions={
          canCreate ? (
            <Link href="/agents/new" className="wbtn wbtn-primary">
              + Add agent
            </Link>
          ) : undefined
        }
      />
      {params.invited && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Invitation sent. The agent&apos;s account and workspace are created when they accept; the link expires in 72 hours.
        </p>
      )}
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter agents">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="AGT- or USR- reference, name, email or phone" className="winput" />
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
            <FilterSelect
              name="sort"
              label="Sort"
              value={filters.sort}
              any={false}
              options={[
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["name", "Name"],
                ["listings", "Most listings"],
              ]}
            />
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="Agents"
          rows={result.rows}
          rowKey={(r) => r.referenceId}
          empty={<EmptyState title="No agents match">Agents appear here when an admin adds them or their application is approved.</EmptyState>}
          columns={[
            {
              header: "Agent",
              cell: (r) => (
                <div className="min-w-44">
                  <Link href={`/agents/${r.referenceId}`} className="font-medium hover:underline">
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
            { header: "Organization", cell: (r) => r.organization ?? <span className="text-stone-deep">Not yet assigned</span>, hideBelow: "lg" },
            { header: "Status", cell: (r) => <Status value={r.status} /> },
            { header: "Verification", cell: (r) => <Status value={r.verificationStatus} />, hideBelow: "md" },
            { header: "Listings", cell: (r) => r.listings, align: "right", hideBelow: "sm" },
            { header: "Leads", cell: (r) => r.leads, align: "right", hideBelow: "lg" },
            { header: "Joined", cell: (r) => <When at={r.createdAt} />, hideBelow: "xl" },
            { header: "Last active", cell: (r) => <When at={r.lastActiveAt} />, hideBelow: "xl" },
            { header: "Action", cell: (r) => <ViewSummary kind="agent" referenceId={r.referenceId} name={r.name} />, align: "right" },
          ]}
        />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={params} basePath="/agents" />
      </Card>
      {platform && invitations.length > 0 && (
        <Card title="Invitations" padded={false} className="mt-6">
          <DataTable
            caption="Agent invitations"
            empty={null}
            rows={invitations}
            rowKey={(i) => i.referenceId}
            columns={[
              {
                header: "Invited",
                cell: (i) => (
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-[0.8125rem] text-stone-deep">{i.email}</p>
                    <ReferenceId value={i.referenceId} copy={false} />
                  </div>
                ),
              },
              { header: "Role", cell: (i) => i.role, hideBelow: "md" },
              { header: "Organization", cell: (i) => i.organization ?? <span className="text-stone-deep">Independent</span>, hideBelow: "lg" },
              { header: "Status", cell: (i) => <Status value={i.status} /> },
              { header: "By", cell: (i) => i.invitedBy, hideBelow: "lg" },
              { header: "Expires", cell: (i) => (i.status === "pending" ? <When at={i.expiresAt} /> : "—"), hideBelow: "md" },
              {
                header: <span className="sr-only">Actions</span>,
                cell: (i) =>
                  i.status === "pending" && canCreate ? (
                    <ConfirmAction
                      label="Revoke"
                      title={`Revoke the invitation for ${i.email}?`}
                      description="The link stops working immediately."
                      variant="danger"
                      action={revokeAgentInvitationAction}
                      hidden={{ ref: i.referenceId }}
                    />
                  ) : null,
              },
            ]}
          />
        </Card>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoSubmit } from "@/components/workspace/forms";
import { Card, DataTable, EmptyState, FilterSelect, StatusBadge, When } from "@/components/workspace/ui";
import { ORG_ROLES, ROLES } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { canViewMembers, listMembers, listTeams, memberFilters } from "@/lib/services/members";
import { TeamHeader } from "./tabs";

export const metadata: Metadata = { title: "People" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TeamPage({ searchParams }: Props) {
  const actor = await requirePermission("members.view", "/team", "team");
  if (!canViewMembers(actor)) notFound();
  const params = await searchParams;
  const filters = memberFilters.parse(params);
  const [members, everyone, teams] = await Promise.all([listMembers(actor, filters), listMembers(actor), listTeams(actor)]);

  return (
    <>
      <TeamHeader actor={actor} active="people" counts={{ people: everyone.length, teams: teams.length }} />
      {params.removed && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Removed. Their work is with the person you chose, and they&apos;ve been told by email.
        </p>
      )}
      <Card padded={false}>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line-light p-4" role="search" aria-label="Filter people">
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-[0.75rem] text-stone-deep">
              Search
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Name, email, phone or USR- reference" className="winput" />
          </div>
          <AutoSubmit>
            <FilterSelect name="role" label="Role" value={filters.role} options={ORG_ROLES.map((r) => [r, ROLES[r].name])} />
            {teams.length > 0 && <FilterSelect name="team" label="Team" value={filters.team} options={teams.map((t) => [t.id, t.name])} />}
          </AutoSubmit>
          <button type="submit" className="wbtn wbtn-secondary">
            Search
          </button>
        </form>
        <DataTable
          caption="People"
          rows={members}
          rowKey={(m) => m.membershipId}
          empty={<EmptyState title="Nobody matches">Try another search, or clear the filters.</EmptyState>}
          columns={[
            {
              header: "Person",
              cell: (m) => (
                <div className="min-w-44">
                  <Link href={`/team/${m.userReferenceId}`} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  {m.isYou && <span className="ml-1.5 text-[0.75rem] text-stone-deep">(you)</span>}
                  <p className="text-[0.8125rem] text-stone-deep">{m.email}</p>
                </div>
              ),
            },
            {
              header: "Role",
              cell: (m) => (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>{m.roleName}</span>
                  {m.agentStatus === "suspended" && <StatusBadge tone="danger">Agent access suspended</StatusBadge>}
                </div>
              ),
            },
            { header: "Teams", cell: (m) => (m.teams.length ? m.teams.map((t) => t.name).join(", ") : <span className="text-stone-deep">—</span>), hideBelow: "lg" },
            { header: "Listings", cell: (m) => m.listings, align: "right", hideBelow: "sm" },
            { header: "Open leads", cell: (m) => m.openLeads, align: "right", hideBelow: "md" },
            { header: "Visits ahead", cell: (m) => m.upcomingVisits, align: "right", hideBelow: "xl" },
            { header: "Last active", cell: (m) => <When at={m.lastActiveAt} />, hideBelow: "lg" },
          ]}
        />
      </Card>
      <RoleGuide />
    </>
  );
}

/** What each role can do, so whoever adds people can choose well. */
function RoleGuide() {
  return (
    <Card title="The roles" className="mt-6">
      <dl className="grid gap-x-8 gap-y-4 text-[0.8125rem] sm:grid-cols-2 xl:grid-cols-3">
        {ORG_ROLES.map((r) => (
          <div key={r}>
            <dt className="font-medium text-ink">{ROLES[r].name}</dt>
            <dd className="mt-0.5 text-stone-deep">{ROLES[r].description}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

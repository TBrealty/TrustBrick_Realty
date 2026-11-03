import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, Select, Submit, TextInput } from "@/components/workspace/forms";
import { Card, EmptyState, StatusBadge } from "@/components/workspace/ui";
import { AGENT_ORG_ROLES } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { canManageMembers, canViewMembers, listMembers, listTeams } from "@/lib/services/members";
import { createTeamAction, deleteTeamAction, renameTeamAction, teamMemberAction } from "../actions";
import { TeamHeader } from "../tabs";

export const metadata: Metadata = { title: "Teams" };

/**
 * Teams give Supervisors their scope: a Supervisor sees and works the listings, leads and visits
 * of the teams they're in. Owners and Managers arrange them; only agents and supervisors join.
 */
export default async function TeamsPage() {
  const actor = await requirePermission("members.view", "/team/teams", "team");
  if (!canViewMembers(actor)) notFound();
  const manages = canManageMembers(actor);
  const [teams, members] = await Promise.all([listTeams(actor), listMembers(actor)]);
  const joinable = members.filter((m) => m.role && AGENT_ORG_ROLES.includes(m.role));

  return (
    <>
      <TeamHeader actor={actor} active="teams" counts={{ people: members.length, teams: teams.length }} />
      {manages && (
        <Card title="New team" description="Group agents under a Supervisor, for example by city, locality or kind of property." className="mb-6">
          <ActionForm action={createTeamAction} className="flex flex-wrap items-end gap-3" resetOnSuccess>
            <TextInput label="Team name" name="name" required placeholder="Hyderabad West" fieldClassName="min-w-56 flex-1" />
            <Submit>Create team</Submit>
          </ActionForm>
        </Card>
      )}
      {teams.length === 0 ? (
        <Card>
          <EmptyState title={manages ? "No teams yet" : "You're not in a team yet"}>
            {manages ? "Create one above, then add its supervisor and agents." : "An Owner or Manager adds you to one."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {teams.map((team) => {
            const inTeam = new Set(team.members.map((m) => m.userReferenceId));
            const candidates = joinable.filter((m) => !inTeam.has(m.userReferenceId));
            return (
              <Card
                key={team.id}
                title={team.name}
                description={`${team.members.length} ${team.members.length === 1 ? "person" : "people"} · ${team.listings} listings · ${team.openLeads} open leads`}
                actions={
                  manages ? (
                    <ConfirmAction
                      label="Delete"
                      title={`Delete the ${team.name} team?`}
                      description="Its people stay in your organization and keep their work. A Supervisor in no other team no longer sees anyone else's work."
                      variant="danger"
                      action={deleteTeamAction}
                      hidden={{ team: team.id }}
                    />
                  ) : undefined
                }
              >
                {team.members.length === 0 ? (
                  <p className="text-[0.8125rem] text-stone-deep">Nobody in this team yet.</p>
                ) : (
                  <ul className="divide-y divide-line-light">
                    {team.members.map((m) => (
                      <li key={m.userReferenceId} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <Link href={`/team/${m.userReferenceId}`} className="font-medium hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-2 text-[0.8125rem] text-stone-deep">{m.roleName}</span>
                          {m.isLead && (
                            <span className="ml-2">
                              <StatusBadge tone="info">Leads the team</StatusBadge>
                            </span>
                          )}
                        </div>
                        {manages && (
                          <ActionForm action={teamMemberAction}>
                            <input type="hidden" name="team" value={team.id} />
                            <input type="hidden" name="member" value={m.userReferenceId} />
                            <input type="hidden" name="op" value="remove" />
                            <Submit variant="secondary" className="wbtn-sm">
                              Take out
                            </Submit>
                          </ActionForm>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {manages && (
                  <div className="mt-5 space-y-4 border-t border-line-light pt-5">
                    {candidates.length > 0 && (
                      <ActionForm action={teamMemberAction} className="flex flex-wrap items-end gap-3">
                        <input type="hidden" name="team" value={team.id} />
                        <input type="hidden" name="op" value="add" />
                        <Select
                          label="Add a supervisor or agent"
                          name="member"
                          required
                          placeholder="Choose"
                          fieldClassName="min-w-56 flex-1"
                          options={candidates.map((m) => ({ value: m.userReferenceId, label: `${m.name} · ${m.roleName}` }))}
                        />
                        <Submit variant="secondary">Add</Submit>
                      </ActionForm>
                    )}
                    <ActionForm action={renameTeamAction} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="team" value={team.id} />
                      <TextInput label="Rename" name="name" defaultValue={team.name} required fieldClassName="min-w-56 flex-1" />
                      <Submit variant="secondary">Save name</Submit>
                    </ActionForm>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

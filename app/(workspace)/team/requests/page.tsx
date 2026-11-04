import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, Select, Submit } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DescriptionList, EmptyState, When } from "@/components/workspace/ui";
import { ROLES } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { canManageMembers, listJoinRequests, listMemberInvitations, listMembers, listTeams, rolesYouCanGive } from "@/lib/services/members";
import { approveJoinAction, declineJoinAction } from "../actions";
import { TeamHeader } from "../tabs";

export const metadata: Metadata = { title: "Requests to join" };

/**
 * Agents who applied to join with the organization's ORG- reference. The organization decides:
 * it knows whether they work there, and it answers for the people it lets in.
 */
export default async function JoinRequestsPage({ searchParams }: { searchParams: Promise<{ declined?: string }> }) {
  const actor = await requirePermission("members.manage", "/team/requests", "org");
  if (!canManageMembers(actor)) notFound();
  const [requests, members, teams, invitations] = await Promise.all([listJoinRequests(actor), listMembers(actor), listTeams(actor), listMemberInvitations(actor)]);
  const roles = rolesYouCanGive(actor);
  const { declined } = await searchParams;

  return (
    <>
      <TeamHeader
        actor={actor}
        active="requests"
        counts={{ people: members.length, teams: teams.length, requests: requests.length, invitations: invitations.filter((i) => i.status === "pending").length }}
      />
      {declined && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Declined. They&apos;ve been told your reason by email.
        </p>
      )}
      <p className="mb-5 max-w-3xl text-[0.875rem] text-stone-deep">
        Agents can ask to join {actor.organization.name} with its reference, <ReferenceId value={actor.organization.referenceId} />. Approve only people who
        work with you: they get into your workspace straight away, in the role you choose.
      </p>
      {requests.length === 0 ? (
        <Card>
          <EmptyState title="No requests waiting">When an agent asks to join, it appears here and you&apos;re notified.</EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {requests.map((r) => (
            <Card key={r.agentReferenceId} title={r.name} description={<>Asked <When at={r.submittedAt} /></>}>
              <DescriptionList
                items={[
                  ["Email", <a key="e" href={`mailto:${r.email}`} className="break-all underline">{r.email}</a>],
                  ["Phone", <a key="p" href={`tel:${r.phone}`} className="underline">{r.phone}</a>],
                  ["City", r.city],
                  ["RERA registration", r.reraAgentNumber],
                  ["Experience", r.experienceYears === null ? null : `${r.experienceYears} years`],
                  ["Application", <ReferenceId key="a" value={r.agentReferenceId} copy={false} />],
                ]}
              />
              {r.bio && <p className="mt-4 text-[0.875rem] text-graphite">“{r.bio}”</p>}
              <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line-light pt-5">
                <ActionForm action={approveJoinAction} className="flex flex-1 flex-wrap items-end gap-3">
                  <input type="hidden" name="ref" value={r.agentReferenceId} />
                  <Select label="Role" name="role" defaultValue="agent" fieldClassName="min-w-40" options={roles.map((code) => ({ value: code, label: ROLES[code].name }))} />
                  {teams.length > 0 && (
                    <Select label="Team" name="teamId" placeholder="No team" fieldClassName="min-w-40" options={teams.map((t) => ({ value: t.id, label: t.name }))} />
                  )}
                  <Submit>Approve</Submit>
                </ActionForm>
                <ConfirmAction
                  label="Decline"
                  title={`Decline ${r.name}'s request?`}
                  description="They're told your reason and can apply again."
                  variant="danger"
                  size="md"
                  action={declineJoinAction}
                  hidden={{ ref: r.agentReferenceId }}
                  reason={{ required: true, label: "Reason (they'll see it)", placeholder: "e.g. We don't have an agent by this name." }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

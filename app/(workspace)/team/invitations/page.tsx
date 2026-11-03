import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, Status, When } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { canManageMembers, listMemberInvitations, listMembers, listTeams } from "@/lib/services/members";
import { revokeMemberInvitationAction } from "../actions";
import { TeamHeader } from "../tabs";

export const metadata: Metadata = { title: "Invitations" };

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  const actor = await requirePermission("members.manage", "/team/invitations", "org");
  if (!canManageMembers(actor)) notFound();
  const [invitations, members, teams, params] = await Promise.all([listMemberInvitations(actor), listMembers(actor), listTeams(actor), searchParams]);
  const pending = invitations.filter((i) => i.status === "pending").length;

  return (
    <>
      <TeamHeader actor={actor} active="invitations" counts={{ people: members.length, teams: teams.length, invitations: pending }} />
      {params.invited && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Invitation sent. They join your workspace when they accept; the link expires in 72 hours.
        </p>
      )}
      <Card padded={false}>
        <DataTable
          caption="Invitations"
          rows={invitations}
          rowKey={(i) => i.referenceId}
          empty={<EmptyState title="No invitations in the last 30 days">Add someone with “Add person”: they get an email to join.</EmptyState>}
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
            { header: "Role", cell: (i) => i.roleName },
            { header: "Team", cell: (i) => i.team ?? <span className="text-stone-deep">—</span>, hideBelow: "lg" },
            { header: "Status", cell: (i) => <Status value={i.status} /> },
            { header: "By", cell: (i) => i.invitedBy, hideBelow: "lg" },
            { header: "Expires", cell: (i) => (i.status === "pending" ? <When at={i.expiresAt} /> : "—"), hideBelow: "md" },
            {
              header: <span className="sr-only">Actions</span>,
              cell: (i) =>
                i.canRevoke ? (
                  <ConfirmAction
                    label="Revoke"
                    title={`Revoke the invitation for ${i.email}?`}
                    description="The link stops working immediately. You can invite them again later."
                    variant="danger"
                    action={revokeMemberInvitationAction}
                    hidden={{ ref: i.referenceId }}
                  />
                ) : null,
              align: "right",
            },
          ]}
        />
      </Card>
    </>
  );
}

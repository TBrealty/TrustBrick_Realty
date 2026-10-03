import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DataTable, EmptyState, PageHeader, Status, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { listAdmins, listInvitations } from "@/lib/services/admins";
import { revokeInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  const actor = await requirePermission("admins.view", "/admins", "platform");
  const { invited } = await searchParams;
  const [admins, invitations] = await Promise.all([listAdmins(actor), listInvitations(actor)]);
  const canInvite = can(actor, "admins.create", "platform");

  return (
    <>
      <PageHeader
        title="Admins"
        description="Everyone with access to the platform workspace. SuperAdmins are created only by the bootstrap script, never here."
        actions={
          canInvite ? (
            <Link href="/admins/invite" className="wbtn wbtn-primary">
              + Invite an admin
            </Link>
          ) : undefined
        }
      />
      {invited && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Invitation sent. It expires in 72 hours and works once.
        </p>
      )}
      <Card title="Administrators" padded={false} className="mb-6">
        <DataTable
          caption="Administrators"
          rows={admins}
          rowKey={(a) => a.referenceId}
          empty={<EmptyState title="No administrators" />}
          columns={[
            {
              header: "Admin",
              cell: (a) => (
                <div>
                  {a.level === "admin" ? (
                    <Link href={`/admins/${a.referenceId}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.name}</span>
                  )}
                  <div>
                    <ReferenceId value={a.referenceId} copy={false} />
                  </div>
                </div>
              ),
            },
            { header: "Email", cell: (a) => a.email, hideBelow: "md" },
            { header: "Level", cell: (a) => (a.level === "superadmin" ? "SuperAdmin" : "Admin") },
            { header: "Permissions", cell: (a) => (a.level === "superadmin" ? "Admins, settings, view all" : `${a.permissions.length}`), align: "right", hideBelow: "sm" },
            { header: "Status", cell: (a) => <Status value={a.status} /> },
            { header: "Invited by", cell: (a) => a.createdBy ?? "Bootstrap", hideBelow: "lg" },
            { header: "Last active", cell: (a) => <When at={a.lastActiveAt} />, hideBelow: "lg" },
          ]}
        />
      </Card>
      <Card title="Invitations" padded={false}>
        <DataTable
          caption="Admin invitations"
          rows={invitations}
          rowKey={(i) => i.referenceId}
          empty={<EmptyState title="No invitations" />}
          columns={[
            {
              header: "Invited",
              cell: (i) => (
                <div>
                  <p>{i.email}</p>
                  <ReferenceId value={i.referenceId} copy={false} />
                </div>
              ),
            },
            { header: "Status", cell: (i) => <Status value={i.status} /> },
            { header: "Permissions", cell: (i) => i.permissions.length, align: "right", hideBelow: "sm" },
            { header: "By", cell: (i) => i.invitedBy, hideBelow: "md" },
            { header: "Expires", cell: (i) => (i.status === "pending" ? <When at={i.expiresAt} /> : "—"), hideBelow: "md" },
            {
              header: <span className="sr-only">Actions</span>,
              cell: (i) =>
                i.status === "pending" && canInvite ? (
                  <ConfirmAction label="Revoke" title={`Revoke the invitation for ${i.email}?`} description="The link stops working immediately." variant="danger" action={revokeInvitationAction} hidden={{ ref: i.referenceId }} />
                ) : null,
            },
          ]}
        />
      </Card>
    </>
  );
}

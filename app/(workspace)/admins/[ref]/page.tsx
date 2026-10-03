import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/workspace/forms";
import { EditPermissionsForm } from "@/components/workspace/InviteAdminForm";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, Status, Timeline, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { getAdmin } from "@/lib/services/admins";
import { auditTrailFor } from "@/lib/services/audit-log";
import { reinstateAdminAction, suspendAdminAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function AdminPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("admins.view", `/admins/${ref}`, "platform");
  const admin = await getAdmin(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const audit = can(actor, "audit.view", "platform") ? await auditTrailFor(actor, [admin.referenceId, admin.userReferenceId]) : null;
  const editable = admin.level === "admin" && admin.userId !== actor.userId && can(actor, "admins.manage", "platform");

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/admins">Admins</BackLink>}
        title={admin.name}
        meta={
          <>
            <ReferenceId value={admin.referenceId} />
            <span>{admin.level === "superadmin" ? "SuperAdmin" : "Admin"}</span>
            <Status value={admin.status} />
          </>
        }
        actions={
          editable ? (
            admin.status === "active" ? (
              <ConfirmAction
                label="Suspend"
                title={`Suspend ${admin.name}?`}
                description="They're logged out everywhere and lose the platform workspace until reinstated."
                variant="danger"
                action={suspendAdminAction}
                hidden={{ ref }}
                reason={{ required: true }}
                password
                phrase={ref}
              />
            ) : (
              <ConfirmAction label="Reinstate" title={`Reinstate ${admin.name}?`} variant="primary" action={reinstateAdminAction} hidden={{ ref }} password />
            )
          ) : undefined
        }
      />
      {!editable && admin.level === "superadmin" && (
        <p className="mb-5 rounded-[3px] border-l-2 border-slate bg-slate/8 px-3.5 py-2.5 text-[0.8125rem]">SuperAdmin access is managed only with the bootstrap script, from a trusted shell.</p>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card title="Account">
            <DescriptionList
              items={[
                ["Email", admin.email],
                ["Account", <ReferenceId key="u" value={admin.userReferenceId} href={`/users/${admin.userReferenceId}`} />],
                ["Added", formatDay(admin.createdAt)],
                ["Invited by", admin.createdBy ?? "Bootstrap"],
                ["Last active", <When key="l" at={admin.lastActiveAt} />],
              ]}
            />
          </Card>
          {editable ? (
            <Card title="Permissions" description="Changes are audited with the before and after, and the admin is notified.">
              <EditPermissionsForm referenceId={admin.referenceId} initial={admin.permissions} />
            </Card>
          ) : (
            admin.level === "admin" && (
              <Card title="Permissions">
                <ul className="flex flex-wrap gap-1.5">
                  {admin.permissions.map((p) => (
                    <li key={p} className="rounded-full bg-ink/6 px-2 py-0.5 font-mono text-[0.75rem]">
                      {p}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          )}
        </div>
        {audit && (
          <Card title="Audit history">
            <Timeline items={audit.map((e) => ({ id: e.id, title: <span className="font-mono text-[0.75rem]">{e.eventType}</span>, at: e.createdAt, actor: e.actorName ?? e.actorRole }))} empty="No audited actions yet." />
          </Card>
        )}
      </div>
    </>
  );
}

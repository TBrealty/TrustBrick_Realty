import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonSubscriptionsCard } from "@/components/subscriptions/PersonSubscriptionsCard";
import { ActionForm, ConfirmAction, Submit, TextInput } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, StatCard, Status, Timeline, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { auditTrailFor } from "@/lib/services/audit-log";
import { subscriptionsForPerson } from "@/lib/services/subscriptions";
import { getUser } from "@/lib/services/users";
import { reinstateUserAction, suspendUserAction, updateUserAction, verifyUserAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function UserPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("users.view", `/users/${ref}`, "platform");
  const user = await getUser(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const audit = can(actor, "audit.view", "platform") ? await auditTrailFor(actor, [user.referenceId, ...(user.agentReferenceId ? [user.agentReferenceId] : [])]) : null;
  const canSuspend = can(actor, "users.suspend", "platform") && !user.isStaff && user.id !== actor.userId;
  const canManage = can(actor, "users.manage", "platform") && (!user.isStaff || can(actor, "admins.manage", "platform"));
  const subscriptions = can(actor, "subscriptions.view", "platform") ? await subscriptionsForPerson(actor, user.id) : null;

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/users">Users</BackLink>}
        title={user.name}
        meta={
          <>
            <ReferenceId value={user.referenceId} />
            <Status value={user.status} />
            {user.isStaff && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.75rem] text-paper">Staff</span>}
            {user.agentReferenceId && (
              <span className="inline-flex items-center gap-1">
                Agent <ReferenceId value={user.agentReferenceId} href={can(actor, "agents.view", "platform") ? `/agents/${user.agentReferenceId}` : undefined} copy={false} />
              </span>
            )}
          </>
        }
        actions={
          <>
            {!user.emailVerified && can(actor, "users.manage", "platform") && (
              <ConfirmAction label="Confirm email" title="Mark this email as confirmed?" description="Only after you've confirmed it belongs to them some other way." action={verifyUserAction} hidden={{ ref }} />
            )}
            {canSuspend && user.status === "active" && (
              <ConfirmAction
                label="Suspend"
                title={`Suspend ${user.name}?`}
                description="They're logged out everywhere immediately, can't log in, and any live listings they're responsible for are paused."
                variant="danger"
                action={suspendUserAction}
                hidden={{ ref }}
                reason={{ required: true }}
              />
            )}
            {canSuspend && user.status === "suspended" && (
              <ConfirmAction label="Reinstate" title={`Reinstate ${user.name}?`} variant="primary" action={reinstateUserAction} hidden={{ ref }} />
            )}
          </>
        }
      />
      {user.isStaff && (
        <p className="mb-5 rounded-[3px] border-l-2 border-slate bg-slate/8 px-3.5 py-2.5 text-[0.8125rem]">
          This is a staff account. Its access is managed on the <Link href="/admins" className="underline">Admins</Link> page.
        </p>
      )}
      {user.statusReason && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
          <strong className="font-medium">Reason on record:</strong> {user.statusReason}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard label="Saved properties" value={user.counts.bookmarks} />
        <StatCard label="Enquiries made" value={user.counts.enquiries} />
        <StatCard label="Reports filed" value={user.counts.reports} />
        <StatCard label="Active sessions" value={user.counts.activeSessions} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {subscriptions && <PersonSubscriptionsCard subs={subscriptions} canManage={can(actor, "subscriptions.manage", "platform")} />}
          <Card title="Account">
            <DescriptionList
              items={[
                ["Email", user.email],
                ["Email confirmed", user.emailVerified ? "Yes" : "No"],
                ["Phone", user.phone],
                ["Looking to", user.intent],
                ["Joined", formatDay(user.createdAt)],
                ["Last active", <When key="l" at={user.lastActiveAt} />],
              ]}
            />
          </Card>
          <Card title="Workspaces">
            {user.memberships.length === 0 ? (
              <p className="text-[0.8125rem] text-stone-deep">None. This person uses Trustbrick as a customer.</p>
            ) : (
              <ul className="space-y-2 text-[0.8125rem]">
                {user.memberships.map((m) => (
                  <li key={m.organizationReferenceId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.organization}</span>
                    <ReferenceId value={m.organizationReferenceId} copy={false} />
                    <span className="text-stone-deep">{m.roles.join(", ")}</span>
                    <Status value={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {user.bookmarks && user.bookmarks.length > 0 && (
            <Card title="Saved properties">
              <ul className="space-y-1.5 text-[0.8125rem]">
                {user.bookmarks.map((b) => (
                  <li key={b.referenceId} className="flex items-center gap-2">
                    <ReferenceId value={b.referenceId} href={`/properties/${b.referenceId}`} copy={false} /> {b.title}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {canManage && (
            <Card title="Edit" description="Email and password belong to the person and can't be changed here.">
              <ActionForm action={updateUserAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="ref" value={ref} />
                <TextInput label="Name" name="name" defaultValue={user.name} required />
                <TextInput label="Phone" name="phone" defaultValue={user.phone ?? ""} />
                <div className="flex justify-end sm:col-span-2">
                  <Submit>Save</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
        {audit && (
          <Card title="Audit history">
            <Timeline items={audit.map((e) => ({ id: e.id, title: <span className="font-mono text-[0.75rem]">{e.eventType}</span>, body: typeof e.metadata?.reason === "string" ? `“${e.metadata.reason}”` : undefined, at: e.createdAt, actor: e.actorName ?? e.actorRole }))} empty="No audited actions yet." />
          </Card>
        )}
      </div>
    </>
  );
}

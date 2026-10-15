import type { Metadata } from "next";
import { PersonSubscriptionsCard } from "@/components/subscriptions/PersonSubscriptionsCard";
import { subscriptionsForPerson } from "@/lib/services/subscriptions";
import { PartnerCommissionCard } from "@/components/workspace/PartnerCommissionCard";
import { organizationForPerson } from "@/lib/services/commission";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, ConfirmAction, Submit, TextArea, TextInput } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DataTable, DescriptionList, PageHeader, StatCard, Status, Timeline, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { panFromGstin } from "@/lib/organizations/gstin";
import { APPLICANT_ORG_TYPE_LABELS, type ApplicantOrgType } from "@/lib/organizations/terms";
import { getAgent } from "@/lib/services/agents";
import { auditTrailFor } from "@/lib/services/audit-log";
import { approveAgentAction, reinstateAgentAction, rejectAgentAction, suspendAgentAction, updateAgentAction, verifyAgentAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function AgentPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("agents.view", `/agents/${ref}`, "org");
  const agent = await getAgent(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const subscriptions = can(actor, "subscriptions.view", "platform") ? await subscriptionsForPerson(actor, agent.userId) : null;
  const partnerOrg = agent.status === "active" || agent.status === "suspended" ? await organizationForPerson(agent.userId) : null;
  const audit = can(actor, "audit.view", "platform") ? await auditTrailFor(actor, [agent.referenceId, agent.userReferenceId]) : null;
  const canVerify = can(actor, "agents.verify", "platform");
  const canSuspend = can(actor, "agents.suspend", "platform");
  const canManage = can(actor, "agents.manage", "platform");
  const org = agent.newOrganization;
  const approveDescription = org
    ? `${org.name} goes live on Trustbrick and ${agent.name} becomes its admin, with their own workspace. Check the GST number and address first.`
    : agent.requestedOrganization
      ? `They join ${agent.requestedOrganization.name} and get an agent workspace.`
      : "They get an agent workspace in their own independent organization.";
  const applyingAs = org ? "Registering a new organization" : agent.applicationType === "join_organization" ? "Joining an organization on Trustbrick" : "Individual agent";

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/agents">Agents</BackLink>}
        title={agent.name}
        meta={
          <>
            <ReferenceId value={agent.referenceId} />
            <Status value={agent.status} />
            <Status value={agent.verificationStatus} label={agent.verificationStatus === "verified" ? "Verified agent" : undefined} />
            {can(actor, "users.view", "platform") && (
              <span className="inline-flex items-center gap-1">
                Account <ReferenceId value={agent.userReferenceId} href={`/users/${agent.userReferenceId}`} copy={false} />
              </span>
            )}
          </>
        }
        actions={
          <>
            {agent.status === "pending" && canVerify && (
              <>
                <ConfirmAction label="Approve" title={org ? `Approve ${agent.name} and ${org.name}?` : "Approve this agent?"} variant="primary" action={approveAgentAction} hidden={{ ref }} description={approveDescription}>
                  <Checkbox
                    name="verify"
                    label="Mark as verified"
                    hint={org ? "Only if you've checked the GST number, RERA registration and their identity." : "Only if you've checked their RERA registration and identity."}
                    defaultChecked={Boolean(agent.reraAgentNumber)}
                  />
                </ConfirmAction>
                <ConfirmAction
                  label="Reject"
                  title="Reject this application?"
                  variant="danger"
                  action={rejectAgentAction}
                  hidden={{ ref }}
                  description="They get an email with your reason, and can correct their details and apply again."
                  reason={{ required: true, placeholder: "The applicant sees this in the email." }}
                />
              </>
            )}
            {agent.status === "active" && canVerify && (
              <ConfirmAction
                label={agent.verificationStatus === "verified" ? "Remove verification" : "Mark verified"}
                title={agent.verificationStatus === "verified" ? "Remove the verified mark?" : "Mark this agent verified?"}
                action={verifyAgentAction}
                hidden={{ ref, verified: agent.verificationStatus === "verified" ? "0" : "1" }}
              />
            )}
            {agent.status === "active" && canSuspend && (
              <ConfirmAction
                label="Suspend"
                title={`Suspend ${agent.name}?`}
                variant="danger"
                action={suspendAgentAction}
                hidden={{ ref }}
                reason={{ required: true }}
                description={`They lose their agent workspace immediately and their ${agent.counts.activeListings} live listing(s) are paused until reinstated.`}
              />
            )}
            {agent.status === "suspended" && canSuspend && (
              <ConfirmAction label="Reinstate" title={`Reinstate ${agent.name}?`} variant="primary" action={reinstateAgentAction} hidden={{ ref }} description="Their workspace returns and listings paused by the suspension go live again." />
            )}
          </>
        }
      />
      {agent.statusReason && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
          <strong className="font-medium">Reason on record:</strong> {agent.statusReason}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Listings" value={agent.listings} />
        <StatCard label="Live" value={agent.counts.activeListings} />
        <StatCard label="Awaiting review" value={agent.counts.pendingListings} />
        <StatCard label="Leads" value={agent.leads} />
        <StatCard label="Visits" value={agent.counts.visits} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card title="Profile">
            <DescriptionList
              items={[
                ["Email", agent.email],
                ["Phone", agent.phone],
                ["RERA agent registration", agent.reraAgentNumber],
                ["Experience", agent.experienceYears !== null ? `${agent.experienceYears} years` : null],
                ["City", agent.city],
                ["Organization", agent.organization ? <span key="o">{agent.organization} {agent.organizationReferenceId && <ReferenceId value={agent.organizationReferenceId} href={can(actor, "organizations.view", "platform") ? `/organizations/${agent.organizationReferenceId}` : undefined} copy={false} />}</span> : null],
                ["Applying as", applyingAs],
                ["Asked to join", !org && agent.requestedOrganization ? `${agent.requestedOrganization.name} (${agent.requestedOrganization.referenceId})` : null],
                ["Applied", formatDay(agent.createdAt)],
                ["Approved", agent.approvedAt ? formatDay(agent.approvedAt) : null],
                ["Last active", <When key="l" at={agent.lastActiveAt} />],
              ]}
            />
            {agent.bio && <p className="mt-4 border-t border-line-light pt-3 text-[0.8125rem] text-graphite">{agent.bio}</p>}
          </Card>

          {org && (
            <Card title="Organization they're registering" description="Created with the application. It goes live if you approve, and is rejected with it otherwise.">
              <DescriptionList
                items={[
                  ["Registered name", org.name],
                  ["Reference", <ReferenceId key="r" value={org.referenceId} href={can(actor, "organizations.view", "platform") ? `/organizations/${org.referenceId}` : undefined} copy={false} />],
                  ["Status", <Status key="s" value={org.status} />],
                  ["Kind", APPLICANT_ORG_TYPE_LABELS[org.type as ApplicantOrgType] ?? org.type],
                  ["GST number", org.gstin ? <span key="g" className="font-mono">{org.gstin}</span> : null],
                  ["PAN (from the GSTIN)", org.gstin ? <span key="p" className="font-mono">{panFromGstin(org.gstin)}</span> : null],
                  ["RERA registration", org.reraRegistration],
                  ["Registered office", org.address],
                  ["Office email", org.contactEmail],
                  ["Office phone", org.contactPhone],
                  ["Website", org.website ? <a key="w" href={org.website} target="_blank" rel="noreferrer noopener" className="underline">{org.website}</a> : null],
                ]}
              />
            </Card>
          )}

          <Card title="Recent listings" padded={false}>
            <DataTable
              caption="This agent's recent listings"
              rows={agent.recentListings}
              rowKey={(r) => r.referenceId}
              empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No listings yet.</p>}
              columns={[
                { header: "Listing", cell: (r) => <Link href={`/properties/${r.referenceId}`} className="hover:underline">{r.title}</Link> },
                { header: "Reference", cell: (r) => <ReferenceId value={r.referenceId} copy={false} />, hideBelow: "sm" },
                { header: "Status", cell: (r) => <Status value={r.status} label={STATUS_LABELS[r.status as keyof typeof STATUS_LABELS]} /> },
                { header: "Updated", cell: (r) => <When at={r.updatedAt} />, hideBelow: "md" },
              ]}
            />
          </Card>

          {canManage && (
            <Card title="Edit profile" description="Name and email belong to the person's account and can't be changed here.">
              <ActionForm action={updateAgentAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <input type="hidden" name="ref" value={ref} />
                <TextInput label="Phone" name="phone" defaultValue={agent.phone} required />
                <TextInput label="RERA agent registration" name="reraAgentNumber" defaultValue={agent.reraAgentNumber ?? ""} />
                <TextInput label="Years of experience" name="experienceYears" defaultValue={agent.experienceYears?.toString() ?? ""} inputMode="numeric" />
                <TextArea label="Bio" name="bio" defaultValue={agent.bio ?? ""} rows={3} fieldClassName="sm:col-span-2" />
                <div className="sm:col-span-2 flex justify-end">
                  <Submit>Save changes</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {subscriptions && <PersonSubscriptionsCard subs={subscriptions} canManage={can(actor, "subscriptions.manage", "platform")} />}
          {partnerOrg && <PartnerCommissionCard actor={actor} organization={partnerOrg} editable={partnerOrg.personal} />}
          {agent.openCaseReferenceId && (
            <Card title="Application">
              <p className="text-[0.8125rem]">
                Review case <ReferenceId value={agent.openCaseReferenceId} /> is waiting for a decision.
              </p>
            </Card>
          )}
          {audit && (
            <Card title="Audit history">
              <Timeline items={audit.map((e) => ({ id: e.id, title: <span className="font-mono text-[0.75rem]">{e.eventType}</span>, body: typeof e.metadata?.reason === "string" ? `“${e.metadata.reason}”` : undefined, at: e.createdAt, actor: e.actorName ?? e.actorRole }))} empty="No audited actions yet." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

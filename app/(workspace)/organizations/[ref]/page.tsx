import type { Metadata } from "next";
import { PartnerCommissionCard } from "@/components/workspace/PartnerCommissionCard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/workspace/forms";
import { OrganizationForm } from "@/components/workspace/OrganizationForm";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DataTable, DescriptionList, PageHeader, SampleNotice, StatCard, Status, Timeline, When } from "@/components/workspace/ui";
import { can } from "@/lib/authz";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDay } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/listings/lifecycle";
import { auditTrailFor } from "@/lib/services/audit-log";
import { ORGANIZATION_ACTIONS, ORG_TYPE_LABELS, type OrganizationAction, cityOptions, getOrganization } from "@/lib/services/organizations";
import { organizationTransitionAction } from "../actions";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ created?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

const ACTION_COPY: Record<OrganizationAction, { label: string; description: string; variant: "primary" | "secondary" | "danger" }> = {
  approve: { label: "Approve & verify", description: "The organization becomes active and verified. Agents can join it.", variant: "primary" },
  reject: { label: "Reject", description: "The organization can't be used. Record why.", variant: "danger" },
  suspend: { label: "Suspend", description: "Members lose their workspace and live listings are paused until it's reinstated.", variant: "danger" },
  reinstate: { label: "Reinstate", description: "Members get their workspace back and paused listings go live again.", variant: "primary" },
  archive: { label: "Archive", description: "Retires the organization. Nothing is deleted; live listings are paused.", variant: "secondary" },
};

export default async function OrganizationPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { created } = await searchParams;
  const actor = await requirePermission("organizations.view", `/organizations/${ref}`, "platform");
  const org = await getOrganization(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [audit, cities] = await Promise.all([
    can(actor, "audit.view", "platform") ? auditTrailFor(actor, [org.referenceId]) : Promise.resolve(null),
    can(actor, "organizations.manage", "platform") ? cityOptions() : Promise.resolve(null),
  ]);
  const actions = (Object.keys(ORGANIZATION_ACTIONS) as OrganizationAction[]).filter(
    (a) => (ORGANIZATION_ACTIONS[a].from as readonly string[]).includes(org.status) && can(actor, ORGANIZATION_ACTIONS[a].permission, "platform"),
  );

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/organizations">Organizations</BackLink>}
        title={org.name}
        meta={
          <>
            <ReferenceId value={org.referenceId} />
            <span>{ORG_TYPE_LABELS[org.orgType]}</span>
            <Status value={org.status} />
            <Status value={org.verificationStatus} />
          </>
        }
        actions={[
          can(actor, "agents.create", "platform") && org.status === "active" && ["brokerage", "developer", "property_manager", "pg_operator"].includes(org.orgType) ? (
            <Link key="add-agent" href={`/agents/new?org=${org.referenceId}`} className="wbtn wbtn-secondary">
              + Add agent
            </Link>
          ) : null,
          ...actions.map((a) => (
          <ConfirmAction
            key={a}
            label={ACTION_COPY[a].label}
            title={`${ACTION_COPY[a].label}: ${org.name}?`}
            description={ACTION_COPY[a].description}
            variant={ACTION_COPY[a].variant}
            action={organizationTransitionAction}
            hidden={{ ref, action: a }}
            reason={ORGANIZATION_ACTIONS[a].reason ? { required: true } : undefined}
          />
          )),
        ]}
      />
      {created && (
        <p role="status" className="mb-5 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3.5 py-2.5 text-[0.8125rem] text-sage">
          Added as {org.referenceId}. It&apos;s pending until someone with verification rights approves it.
        </p>
      )}
      {org.isSample && <SampleNotice>This organization is development sample data.</SampleNotice>}
      {org.statusReason && (
        <p className="mb-5 rounded-[3px] border-l-2 border-amber bg-amber/10 px-3.5 py-2.5 text-[0.8125rem]">
          <strong className="font-medium">Reason on record:</strong> {org.statusReason}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard label="Members" value={org.members} />
        <StatCard label="Agents" value={org.agents} />
        <StatCard label="Live listings" value={org.liveListings} />
        <StatCard label="All listings" value={org.listings} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card title="Members" padded={false}>
            <DataTable
              caption="Members of this organization"
              rows={org.memberList}
              rowKey={(m) => m.userReferenceId}
              empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No members yet. Agents join by applying and naming this organization&apos;s reference.</p>}
              columns={[
                {
                  header: "Person",
                  cell: (m) => (
                    <div>
                      <p>{m.name}</p>
                      <p className="text-[0.75rem] text-stone-deep">{m.email}</p>
                    </div>
                  ),
                },
                { header: "Roles", cell: (m) => m.roles.join(", ") || "—" },
                {
                  header: "References",
                  cell: (m) => (
                    <div className="flex flex-col">
                      {m.agentReferenceId && <ReferenceId value={m.agentReferenceId} href={`/agents/${m.agentReferenceId}`} copy={false} />}
                      <ReferenceId value={m.userReferenceId} href={can(actor, "users.view", "platform") ? `/users/${m.userReferenceId}` : undefined} copy={false} />
                    </div>
                  ),
                  hideBelow: "md",
                },
                { header: "Status", cell: (m) => <Status value={m.status} /> },
              ]}
            />
          </Card>
          <Card title="Recent listings" padded={false}>
            <DataTable
              caption="Recent listings"
              rows={org.recentListings}
              rowKey={(l) => l.referenceId}
              empty={<p className="p-5 text-[0.8125rem] text-stone-deep">No listings yet.</p>}
              columns={[
                { header: "Listing", cell: (l) => <Link href={`/properties/${l.referenceId}`} className="hover:underline">{l.title}</Link> },
                { header: "Status", cell: (l) => <Status value={l.status} label={STATUS_LABELS[l.status as keyof typeof STATUS_LABELS]} /> },
                { header: "Updated", cell: (l) => <When at={l.updatedAt} />, hideBelow: "sm" },
              ]}
            />
          </Card>
          {org.projects.length > 0 && (
            <Card title="Projects">
              <ul className="space-y-1.5 text-[0.8125rem]">
                {org.projects.map((p) => (
                  <li key={p.referenceId} className="flex flex-wrap items-center gap-2">
                    {p.name} <ReferenceId value={p.referenceId} copy={false} /> <Status value={p.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {cities && org.orgType !== "personal" && (
            <Card title="Edit details">
              <OrganizationForm cities={cities} referenceId={org.referenceId} values={{ name: org.name, contactEmail: org.contactEmail, contactPhone: org.contactPhone, reraRegistration: org.reraRegistration }} />
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {org.status !== "pending" && <PartnerCommissionCard actor={actor} organization={org} />}
          <Card title="Details">
            <DescriptionList
              columns={1}
              items={[
                ["City", org.city],
                ["Contact email", org.contactEmail],
                ["Contact phone", org.contactPhone],
                ["RERA registration", org.reraRegistration],
                ["Added", formatDay(org.createdAt)],
                ["Added by", org.createdBy],
                ["Open verification case", org.openCaseReferenceId ? <ReferenceId key="c" value={org.openCaseReferenceId} /> : null],
              ]}
            />
          </Card>
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

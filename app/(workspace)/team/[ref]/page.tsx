import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmAction, Select, Submit, TextInput } from "@/components/workspace/forms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { BackLink, Card, DescriptionList, PageHeader, StatCard, Status, StatusBadge, When } from "@/components/workspace/ui";
import { ROLES } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { canViewMembers, getMember } from "@/lib/services/members";
import { changeMemberRoleAction, removeMemberAction } from "../actions";

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).ref };
}

export default async function MemberPage({ params }: Props) {
  const { ref } = await params;
  const actor = await requirePermission("members.view", `/team/${ref}`, "team");
  if (!canViewMembers(actor)) notFound();
  const member = await getMember(actor, ref).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const work = member.listings + member.openLeads + member.upcomingVisits + member.openBookings;
  const handover = member.handoverTo.map((h) => ({ value: h.userReferenceId, label: `${h.name} · ${h.roleName}` }));
  const needsPhone = member.agentStatus !== "active";

  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/team">People</BackLink>}
        title={member.name}
        meta={
          <>
            <ReferenceId value={member.userReferenceId} />
            <span className="font-medium text-ink">{member.roleName}</span>
            {member.isYou && <span>This is you</span>}
            {member.agentStatus === "suspended" && <StatusBadge tone="danger">Agent access suspended by Trustbrick</StatusBadge>}
          </>
        }
        actions={
          member.phone ? (
            <a href={`tel:${member.phone}`} className="wbtn wbtn-secondary">
              Call {member.phone}
            </a>
          ) : undefined
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Listings" value={member.listings} />
        <StatCard label="Open leads" value={member.openLeads} />
        <StatCard label="Visits ahead" value={member.upcomingVisits} />
        <StatCard label="Stays booked" value={member.openBookings} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card title="About">
            <DescriptionList
              items={[
                ["Email", <a key="e" href={`mailto:${member.email}`} className="break-all underline">{member.email}</a>],
                ["Phone", member.phone],
                ["Agent profile", member.agentReferenceId ? <span key="a" className="flex flex-wrap items-center gap-2"><ReferenceId value={member.agentReferenceId} copy={false} /><Status value={member.agentStatus ?? "pending"} /></span> : null],
                ["Teams", member.teams.length ? member.teams.map((t) => t.name).join(", ") : "None"],
                ["Joined", formatDateTime(member.joinedAt)],
                ["Last active", <When key="w" at={member.lastActiveAt} />],
              ]}
            />
          </Card>
          {member.role && (
            <Card title={`What ${ROLES[member.role].name === "Agent" ? "an Agent" : `a ${ROLES[member.role].name}`} can do`}>
              <p className="text-[0.875rem] text-graphite">{ROLES[member.role].description}</p>
              <p className="mt-3 text-[0.8125rem] text-stone-deep">
                <Link href="/team/teams" className="underline">
                  Teams
                </Link>{" "}
                decide whose work a Supervisor sees.
              </p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {member.manage.canChangeRole && (
            <Card title="Change role">
              <ActionForm action={changeMemberRoleAction} className="space-y-3">
                <input type="hidden" name="ref" value={member.userReferenceId} />
                <Select
                  label="Role"
                  name="role"
                  required
                  defaultValue={member.role ?? undefined}
                  options={member.manage.roles.map((r) => ({ value: r, label: ROLES[r].name }))}
                />
                {needsPhone && (
                  <TextInput
                    label="Phone"
                    name="phone"
                    type="tel"
                    autoComplete="off"
                    hint="Needed to make them an Agent or a Supervisor: customers who enquire see it."
                  />
                )}
                {work > 0 && handover.length > 0 && (
                  <Select
                    label="If they become an Operator, their work goes to"
                    name="handoverTo"
                    placeholder="Choose"
                    options={handover}
                    hint="Operators have no leads, so their listings, leads, visits and stays move to someone else."
                  />
                )}
                <Submit variant="secondary">Change role</Submit>
              </ActionForm>
            </Card>
          )}
          {member.manage.canRemove && (
            <Card title="Remove from organization">
              <p className="mb-4 text-[0.8125rem] text-stone-deep">
                They lose access to {actor.organization.name}&apos;s workspace at once and are told by email. Their own Trustbrick account stays.
              </p>
              <ConfirmAction
                label="Remove"
                title={`Remove ${member.name}?`}
                description={
                  work > 0
                    ? `Their ${member.listings} listing(s), ${member.openLeads} open lead(s), ${member.upcomingVisits} visit(s) ahead and ${member.openBookings} stay booking(s) go to the person you choose.`
                    : "They have no listings, leads, visits or stays to hand over."
                }
                variant="danger"
                size="md"
                confirmLabel="Remove"
                action={removeMemberAction}
                hidden={{ ref: member.userReferenceId }}
                reason={{ required: false, label: "Note for the audit log (optional)" }}
              >
                {work > 0 &&
                  (handover.length > 0 ? (
                    <Select label="Hand their work to" name="handoverTo" required placeholder="Choose" options={handover} />
                  ) : (
                    <p className="text-[0.8125rem] text-brick">Add someone who works leads first: their work needs somewhere to go.</p>
                  ))}
              </ConfirmAction>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

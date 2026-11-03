import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteMemberForm } from "@/components/workspace/InviteMemberForm";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { AGENT_ORG_ROLES, ROLES } from "@/lib/authz/catalog";
import { requirePermission } from "@/lib/authz/session";
import { listTeams, rolesYouCanGive } from "@/lib/services/members";

export const metadata: Metadata = { title: "Add person" };

export default async function NewMemberPage() {
  const actor = await requirePermission("members.manage", "/team/new", "org");
  const roles = rolesYouCanGive(actor);
  if (roles.length === 0) notFound();
  const teams = await listTeams(actor);
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/team">People</BackLink>}
        title={`Add someone to ${actor.organization.name}`}
        description="They get an email with a one-time link, valid for 72 hours. When they accept, they sign in as themselves and work in your organization's workspace, in the role you choose."
      />
      <Card className="max-w-3xl">
        <InviteMemberForm
          roles={roles.map((r) => ({ value: r, label: ROLES[r].name, description: ROLES[r].description, agent: AGENT_ORG_ROLES.includes(r) }))}
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        />
      </Card>
      {!actor.roles.includes("owner") && <p className="mt-4 max-w-3xl text-[0.8125rem] text-stone-deep">Only an Owner can add Managers and Owners.</p>}
    </>
  );
}

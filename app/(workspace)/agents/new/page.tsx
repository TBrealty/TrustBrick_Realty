import type { Metadata } from "next";
import { InviteAgentForm } from "@/components/workspace/InviteAgentForm";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { cityOptions } from "@/lib/services/organizations";

export const metadata: Metadata = { title: "Add agent" };

export default async function NewAgentPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  await requirePermission("agents.create", "/agents/new", "platform");
  const org = normalizeReferenceId((await searchParams).org ?? "");
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/agents">Agents</BackLink>}
        title="Add an agent"
        description="Enter their details and where they work. They get a one-time link, valid for 72 hours; their account and agent workspace are created when they accept."
      />
      <Card className="max-w-3xl">
        <InviteAgentForm cities={await cityOptions()} organizationReference={isReferenceId(org, "ORG") ? org : undefined} />
      </Card>
    </>
  );
}

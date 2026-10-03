import type { Metadata } from "next";
import { OrganizationForm } from "@/components/workspace/OrganizationForm";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";
import { cityOptions } from "@/lib/services/organizations";

export const metadata: Metadata = { title: "Add organization" };

export default async function NewOrganizationPage() {
  await requirePermission("organizations.manage", "/organizations/new", "platform");
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/organizations">Organizations</BackLink>}
        title="Add an organization"
        description="New organizations start as pending. Someone with verification rights checks and activates them; until then agents can't join."
      />
      <Card className="max-w-3xl">
        <OrganizationForm cities={await cityOptions()} />
      </Card>
    </>
  );
}

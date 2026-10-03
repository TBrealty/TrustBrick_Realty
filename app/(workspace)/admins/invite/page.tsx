import type { Metadata } from "next";
import { InviteAdminForm } from "@/components/workspace/InviteAdminForm";
import { BackLink, Card, PageHeader } from "@/components/workspace/ui";
import { requirePermission } from "@/lib/authz/session";

export const metadata: Metadata = { title: "Invite an admin" };

export default async function InviteAdminPage() {
  await requirePermission("admins.create", "/admins/invite", "platform");
  return (
    <>
      <PageHeader
        eyebrow={<BackLink href="/admins">Admins</BackLink>}
        title="Invite an admin"
        description="They'll get an email with a link that works once and expires in 72 hours. They set their own password; you never see it."
      />
      <Card>
        <InviteAdminForm />
      </Card>
    </>
  );
}

import Link from "next/link";
import { PageHeader, Tabs } from "@/components/workspace/ui";
import type { Actor } from "@/lib/authz/actor";
import { canManageMembers } from "@/lib/services/members";

/** The header every Team page shares: the organization, the way to add people, and the tabs. */
export function TeamHeader({ actor, active, counts }: { actor: Actor; active: "people" | "teams" | "requests" | "invitations"; counts?: { people?: number; teams?: number; requests?: number; invitations?: number } }) {
  const manages = canManageMembers(actor);
  return (
    <>
      <PageHeader
        title={manages ? `People at ${actor.organization.name}` : "Your team"}
        description={
          manages
            ? "Everyone who works in your organization's workspace, their roles and their teams."
            : "The people in your team and the work they hold."
        }
        actions={
          manages ? (
            <Link href="/team/new" className="wbtn wbtn-primary">
              + Add person
            </Link>
          ) : undefined
        }
      />
      <Tabs
        label="Team"
        items={[
          { href: "/team", label: "People", count: counts?.people, active: active === "people" },
          { href: "/team/teams", label: "Teams", count: counts?.teams, active: active === "teams" },
          ...(manages
            ? [
                { href: "/team/requests", label: "Requests to join", count: counts?.requests, active: active === "requests" },
                { href: "/team/invitations", label: "Invitations", count: counts?.invitations, active: active === "invitations" },
              ]
            : []),
        ]}
      />
    </>
  );
}

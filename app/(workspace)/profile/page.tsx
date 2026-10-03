import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/workspace/forms";
import { ChangePasswordForm, PreferencesForm } from "@/components/workspace/ProfileForms";
import { ReferenceId } from "@/components/workspace/ReferenceId";
import { Card, DescriptionList, PageHeader, When } from "@/components/workspace/ui";
import { ROLES, PERMISSIONS } from "@/lib/authz/catalog";
import { getSession } from "@/lib/auth/session";
import { requireActor } from "@/lib/authz/session";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema/identity";
import { NOTIFICATION_TYPES, type NotificationType, mutedTypes } from "@/lib/services/notifications";
import { revokeOtherSessionsAction } from "./actions";

export const metadata: Metadata = { title: "Profile & security" };

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function ProfilePage() {
  const actor = await requireActor("/profile");
  const [session, mySessions, muted] = await Promise.all([
    getSession(),
    db.select({ id: sessions.id, ua: sessions.userAgent, ip: sessions.ipAddress, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt }).from(sessions).where(eq(sessions.userId, actor.userId)).orderBy(desc(sessions.updatedAt)).limit(20),
    mutedTypes(actor.userId),
  ]);
  const roles = actor.staff ? [actor.staff.level === "superadmin" ? "SuperAdmin" : "Admin"] : actor.roles.map((r) => ROLES[r]?.name ?? r);
  const granted = Object.entries(actor.permissions);

  return (
    <>
      <PageHeader title="Profile & security" description="Your account, what you can do in this workspace, where you're logged in, and which notifications you get." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Account">
          <DescriptionList
            items={[
              ["Name", actor.name],
              ["Email", actor.email],
              ["Account reference", <ReferenceId key="u" value={actor.userReferenceId} />],
              [actor.staff ? "Staff reference" : "Agent reference", actor.staff ? <ReferenceId key="s" value={actor.staff.referenceId} /> : actor.agent ? <ReferenceId key="a" value={actor.agent.referenceId} /> : null],
              ["Organization", actor.organization.name],
              ["Organization reference", <ReferenceId key="o" value={actor.organization.referenceId} />],
              ["Role", roles.join(", ")],
              ["Account status", "Active"],
            ]}
          />
          <p className="mt-4 text-[0.75rem] text-stone-deep">To change your name or email, contact a Trustbrick administrator.</p>
        </Card>
        <Card title="What you can do here">
          <ul className="grid grid-cols-1 gap-1.5 text-[0.8125rem] sm:grid-cols-2">
            {granted.map(([code, scope]) => (
              <li key={code} className="flex items-start justify-between gap-2 rounded-[3px] bg-paper px-2.5 py-1.5">
                <span>{PERMISSIONS[code as keyof typeof PERMISSIONS]?.description ?? code}</span>
                <span className="shrink-0 text-[0.6875rem] text-stone-deep uppercase">{scope === "own" ? "Yours" : scope === "platform" ? "All" : scope}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Password">
          <ChangePasswordForm />
        </Card>
        <Card
          title="Where you're logged in"
          actions={
            mySessions.length > 1 ? (
              <ActionForm action={revokeOtherSessionsAction}>
                <Submit variant="secondary" className="wbtn-sm">
                  Log out everywhere else
                </Submit>
              </ActionForm>
            ) : undefined
          }
        >
          <ul className="space-y-2.5 text-[0.8125rem]">
            {mySessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {device(s.ua)}
                  {s.id === session?.session.id && <span className="ml-2 rounded-full bg-sage/15 px-2 py-0.5 text-[0.6875rem] text-sage-deep">This device</span>}
                </span>
                <span className="text-stone-deep">
                  {s.ip ?? "IP unknown"} · active <When at={s.updatedAt.toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Notification preferences" className="xl:col-span-2">
          <div id="preferences">
            <PreferencesForm
              types={(Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((t) => ({
                type: t,
                label: NOTIFICATION_TYPES[t],
                enabled: !muted.has(t),
                locked: t === "security" || t === "admin_access_changed",
              }))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

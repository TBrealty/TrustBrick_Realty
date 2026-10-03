import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/workspace/forms";
import { Card, EmptyState, PageHeader, When } from "@/components/workspace/ui";
import { requireActor } from "@/lib/authz/session";
import { listNotifications } from "@/lib/services/notifications";
import { markAllReadAction, markReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireActor("/notifications");
  const items = await listNotifications(actor.userId);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread > 0 ? (
            <ActionForm action={markAllReadAction}>
              <Submit variant="secondary">Mark all as read</Submit>
            </ActionForm>
          ) : (
            <Link href="/profile#preferences" className="wbtn wbtn-secondary">
              Preferences
            </Link>
          )
        }
      />
      <Card padded={false} className="max-w-3xl">
        {items.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-line-light">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-5 py-3.5 ${n.readAt ? "" : "bg-brick/4"}`}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brick"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.875rem] font-medium">
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </p>
                  {n.body && <p className="mt-0.5 text-[0.8125rem] text-graphite">{n.body}</p>}
                  <p className="mt-0.5 text-[0.75rem] text-stone-deep">
                    <When at={n.createdAt.toISOString()} />
                  </p>
                </div>
                {!n.readAt && (
                  <ActionForm action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <Submit variant="secondary" className="wbtn-sm">
                      Mark read
                    </Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

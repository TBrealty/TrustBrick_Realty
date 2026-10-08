import Link from "next/link";
import { SubscriptionAdminCard } from "@/components/subscriptions/SubscriptionAdminCard";
import { Card } from "@/components/workspace/ui";
import type { PersonSubscriptions } from "@/lib/services/subscriptions";

/**
 * A person's subscriptions as the team sees them: their own plan (pause or revoke it here, as
 * with an independent agent's or host's own organization), and plans of organizations they're
 * part of, which cover the whole team and so are changed on that organization's page.
 * Used by the user's page and the Users list's View card.
 */
export function PersonSubscriptionsList({ subs, canManage, onChanged }: { subs: PersonSubscriptions; canManage: boolean; onChanged?: () => void }) {
  const orgPlans = subs.organizations.filter((o) => o.subscription);
  if (subs.personal === null && orgPlans.length === 0) return <p className="text-[0.8125rem] text-stone-deep">Not subscribed: on Free.</p>;
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {subs.personal && <SubscriptionAdminCard sub={subs.personal} title="Their own plan" canManage={canManage} onChanged={onChanged} />}
      {orgPlans.map((o) =>
        o.personal ? (
          <SubscriptionAdminCard key={o.referenceId} sub={o.subscription!} title="Their partner plan" canManage={canManage} onChanged={onChanged} />
        ) : (
          <SubscriptionAdminCard
            key={o.referenceId}
            sub={o.subscription!}
            title={`Through ${o.name}`}
            canManage={false}
            readOnlyNote={{ text: "This plan covers the whole organization.", href: `/organizations/${o.referenceId}`, label: "Pause or revoke it there" }}
          />
        ),
      )}
    </div>
  );
}

export function PersonSubscriptionsCard({ subs, canManage }: { subs: PersonSubscriptions; canManage: boolean }) {
  return (
    <Card
      title="Subscription"
      actions={
        <Link href="/subscriptions" className="text-[0.8125rem] underline">
          All subscriptions
        </Link>
      }
    >
      <PersonSubscriptionsList subs={subs} canManage={canManage} />
    </Card>
  );
}

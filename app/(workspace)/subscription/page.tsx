import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { SubscriptionManager } from "@/components/subscriptions/SubscriptionManager";
import { PageHeader } from "@/components/workspace/ui";
import { requireActor } from "@/lib/authz/session";
import { canManagePartnerSubscription, ownHistory, overviewFor } from "@/lib/services/subscriptions";
import { BILLING_CYCLES, type BillingCycle } from "@/lib/vocab";
import { cancelAction, choosePlanAction, resumeAction, startTrialAction } from "./actions";

export const metadata: Metadata = { title: "Subscription" };

type Props = { searchParams: Promise<{ plan?: string; cycle?: string }> };

export default async function PartnerSubscriptionPage({ searchParams }: Props) {
  const actor = await requireActor("/subscription");
  if (actor.workspace !== "professional") forbidden();
  const q = await searchParams;
  const subject = { kind: "organization" as const, organizationId: actor.organization.id };
  const [overview, history] = await Promise.all([overviewFor(subject), ownHistory(subject)]);
  const cycle = BILLING_CYCLES.find((c) => c === q.cycle) as BillingCycle | undefined;
  const personal = actor.organization.orgType === "personal";

  return (
    <>
      <PageHeader
        title="Subscription"
        description={personal ? "AI locality insights to share with clients, featured listings and more. Every paid plan starts with a free trial." : `${actor.organization.name}'s plan, for everyone on the team. Every paid plan starts with a free trial.`}
      />
      <SubscriptionManager
        overview={overview}
        audience="partner"
        canManage={canManagePartnerSubscription(actor)}
        choice={q.plan && cycle ? { plan: q.plan, cycle } : null}
        actions={{ startTrial: startTrialAction, choose: choosePlanAction, cancel: cancelAction, resume: resumeAction }}
        history={history}
        whose={personal ? "Your" : `${actor.organization.name}'s`}
      />
    </>
  );
}

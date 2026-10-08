import type { Metadata } from "next";
import Link from "next/link";
import { SubscriptionManager } from "@/components/subscriptions/SubscriptionManager";
import { requireSession } from "@/lib/auth/session";
import { ownHistory, overviewFor } from "@/lib/services/subscriptions";
import { BILLING_CYCLES, type BillingCycle } from "@/lib/vocab";
import { cancelAction, choosePlanAction, resumeAction, startTrialAction } from "./actions";

export const metadata: Metadata = { title: "Your subscription — Trustbrick" };

type Props = { searchParams: Promise<{ plan?: string; cycle?: string }> };

export default async function AccountSubscriptionPage({ searchParams }: Props) {
  const { user } = await requireSession("/account/subscription");
  const q = await searchParams;
  const subject = { kind: "user" as const, userId: user.id };
  const [overview, history] = await Promise.all([overviewFor(subject), ownHistory(subject)]);
  const cycle = BILLING_CYCLES.find((c) => c === q.cycle) as BillingCycle | undefined;

  return (
    <div>
      <p className="eyebrow flex items-center gap-3 text-brick">
        <span aria-hidden className="h-px w-8 bg-current" />
        Subscription
      </p>
      <h1 className="display mt-6 mb-3 text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95]">
        Your <em>plan.</em>
      </h1>
      <p className="mb-10 max-w-[60ch] text-[1rem] text-graphite">
        AI locality insights and more for finding a home.{" "}
        <Link href="/plans?for=partners" className="underline">
          Agent or host? See partner plans
        </Link>
        .
      </p>
      <SubscriptionManager
        overview={overview}
        audience="customer"
        canManage
        choice={q.plan && cycle ? { plan: q.plan, cycle } : null}
        actions={{ startTrial: startTrialAction, choose: choosePlanAction, cancel: cancelAction, resume: resumeAction }}
        history={history}
        whose="Your"
      />
    </div>
  );
}

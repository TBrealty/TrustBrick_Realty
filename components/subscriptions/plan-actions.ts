import type { PlanAction } from "@/components/subscriptions/PlanCards";
import { MANAGE_PATH, type PlanView } from "@/lib/subscriptions/terms";
import type { BillingCycle, PlanAudience } from "@/lib/vocab";

/** Who is looking at the plans, as far as the buttons care. */
export type PlanViewer =
  | { signedIn: false }
  | {
      signedIn: true;
      /** Partners are people with a professional workspace. */
      partner: boolean;
      /** For partner plans: whether they manage their organization's subscription. */
      canManage: boolean;
      currentCode: string | null;
      /** The current subscription is live (trial, waiting for payment, or paid). */
      live: boolean;
      trialAvailable: boolean;
    };

const withChoice = (path: string, plan: string, cycle: BillingCycle) => `${path}?${new URLSearchParams({ plan, cycle })}#choose`;

/**
 * Each plan card's button, for each billing cycle: start a trial, choose the plan, or say why not.
 * Paid plans always lead to the subscriber's own subscription page, which confirms the choice.
 */
export function planActions(audience: PlanAudience, plans: PlanView[], viewer: PlanViewer): Record<string, Record<BillingCycle, PlanAction>> {
  const manage = MANAGE_PATH[audience];
  const out: Record<string, Record<BillingCycle, PlanAction>> = {};
  for (const plan of plans) {
    const forCycle = (cycle: BillingCycle): PlanAction => {
      if (plan.free) {
        if (!viewer.signedIn) return audience === "customer" ? { label: "Get started free", href: "/signup" } : { label: "Become a partner", href: "/become-an-agent" };
        return { label: viewer.live ? "Included" : "Your plan", disabled: true };
      }
      const trial = plan.trialDays > 0 && (!viewer.signedIn || viewer.trialAvailable);
      const label = trial ? `Start ${plan.trialDays}-day free trial` : `Choose ${plan.name}`;
      if (!viewer.signedIn) {
        const next = withChoice(manage, plan.code, cycle);
        // Log in (or create an account from there) and come back to confirm the choice.
        return { label, href: `/login?next=${encodeURIComponent(next)}` };
      }
      if (audience === "partner" && !viewer.partner) return { label: "For agents and hosts", href: "/become-an-agent" };
      if (audience === "partner" && !viewer.canManage) return { label: "Your admin manages this", disabled: true };
      if (viewer.live && viewer.currentCode === plan.code) return { label: "Your plan", href: manage };
      return { label, href: withChoice(manage, plan.code, cycle) };
    };
    out[plan.code] = { monthly: forCycle("monthly"), yearly: forCycle("yearly") };
  }
  return out;
}

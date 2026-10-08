import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/footer/SiteFooter";
import { AppHeader } from "@/components/navigation/AppHeader";
import { PlanCards } from "@/components/subscriptions/PlanCards";
import { type PlanViewer, planActions } from "@/components/subscriptions/plan-actions";
import { getWorkspaceContext } from "@/lib/authz/session";
import { canManagePartnerSubscription, listPlans, overviewFor } from "@/lib/services/subscriptions";
import type { PlanAudience } from "@/lib/vocab";

export const metadata: Metadata = {
  title: "Plans — Trustbrick",
  description: "Trustbrick Plus for home-seekers, and Pro and Business for agents and hosts: AI locality insights and more. Start with a free trial.",
};

type Props = { searchParams: Promise<{ for?: string }> };

const FAQ: [string, React.ReactNode][] = [
  ["Do I need a card for the free trial?", "No. Start the trial and use everything in the plan straight away. When it ends, you're back on Free unless you've chosen to subscribe."],
  [
    "How do I pay?",
    "Choose monthly or yearly and confirm. Online payment is on its way; until then the Trustbrick team contacts you to arrange it, and your plan starts once it's received. A trial keeps running while you pay.",
  ],
  ["Is GST included?", "Prices are before GST, which is added to your invoice."],
  ["Can I cancel?", "Any time, from your subscription page. A trial ends straight away; a paid plan runs to the end of what you've paid for, and nothing is deleted."],
  ["What does “Coming soon” mean?", "Features we're building now. They switch on for subscribers as they launch, at no extra cost on your plan."],
];

export default async function PlansPage({ searchParams }: Props) {
  const [{ for: forParam }, ctx] = await Promise.all([searchParams, getWorkspaceContext()]);
  const actor = ctx.state === "ready" ? ctx.actor : null;
  const isPartner = actor?.workspace === "professional" || (ctx.state === "choose" && ctx.workspaces.some((w) => w.kind === "professional"));
  const audience: PlanAudience = forParam === "partners" ? "partner" : forParam === "you" ? "customer" : isPartner ? "partner" : "customer";

  const plansForPage = await listPlans(audience);
  let viewer: PlanViewer = { signedIn: false };
  if (ctx.state !== "anonymous") {
    // Customer plans are the person's; partner plans their organization's, from their workspace.
    const subject =
      audience === "customer" ? { kind: "user" as const, userId: ctx.userId } : actor?.workspace === "professional" ? { kind: "organization" as const, organizationId: actor.organization.id } : null;
    const overview = subject ? await overviewFor(subject) : null;
    const live = overview?.subscription ? ["trialing", "pending_payment", "active", "past_due", "paused"].includes(overview.subscription.state) : false;
    viewer = {
      signedIn: true,
      partner: isPartner,
      canManage: audience === "customer" || (actor !== null && canManagePartnerSubscription(actor)),
      currentCode: live ? overview!.subscription!.plan.code : null,
      live,
      trialAvailable: overview?.trialAvailable ?? false,
    };
  }
  const actions = planActions(audience, plansForPage, viewer);
  const tab = (a: PlanAudience) => (a === "customer" ? "/plans?for=you" : "/plans?for=partners");

  return (
    <div className="min-h-svh bg-ivory text-ink">
      <AppHeader />
      <main>
        <section className="shell pt-12 pb-10 text-center sm:pt-16 lg:pt-20">
          <p className="eyebrow inline-flex items-center gap-3 text-brick">
            <span aria-hidden className="h-px w-8 bg-current" />
            Trustbrick plans
            <span aria-hidden className="h-px w-8 bg-current" />
          </p>
          <h1 className="display mx-auto mt-5 max-w-[18ch] text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95]">
            Know more <em>before you decide.</em>
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed text-graphite">
            AI locality insights and more, for people finding a home and for the agents and hosts who list them. Every paid plan starts with a free trial.
          </p>

          <nav aria-label="Who the plans are for" className="mx-auto mt-8 flex w-fit gap-1 border-b border-line-light">
            {(["customer", "partner"] as const).map((a) => (
              <Link
                key={a}
                href={tab(a)}
                aria-current={audience === a ? "page" : undefined}
                className={`relative px-4 py-2.5 text-[0.9375rem] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 ${audience === a ? "font-medium text-ink after:bg-ink" : "text-stone-deep after:bg-transparent hover:text-ink"}`}
              >
                {a === "customer" ? "For you" : "For agents & hosts"}
              </Link>
            ))}
          </nav>
        </section>

        <section aria-label="Plans" className="shell pb-16 sm:pb-20">
          <PlanCards plans={plansForPage} actionFor={actions} currentCode={viewer.signedIn ? viewer.currentCode : null} />
          <p className="mx-auto mt-6 max-w-[60ch] text-center text-[0.8125rem] text-stone-deep">
            {audience === "partner"
              ? "Partner plans cover your whole organization: a brokerage's admin subscribes for the team; independent agents and hosts subscribe for themselves."
              : "Plans are for you personally. Prices are before GST."}
          </p>
        </section>

        <section aria-labelledby="plans-faq" className="border-t border-line-light bg-paper">
          <div className="shell grid grid-cols-1 gap-10 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
            <h2 id="plans-faq" className="display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1] lg:col-span-4">
              Questions
            </h2>
            <div className="divide-y divide-line-light border-y border-line-light lg:col-span-7 lg:col-start-6">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[1rem] font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-[1.25rem] leading-none text-stone-deep transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="pb-5 text-[0.9375rem] leading-relaxed text-graphite">{a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

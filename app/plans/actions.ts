"use server";

import { getWorkspaceContext } from "@/lib/authz/session";
import { promoFor } from "@/lib/services/subscriptions";
import { MANAGE_PATH, type PlanView } from "@/lib/subscriptions/terms";

export type PlansPromo = {
  audience: "customer" | "partner";
  plan: Pick<PlanView, "code" | "name" | "tagline" | "monthlyPrice" | "yearlyPrice" | "trialDays" | "features">;
  trialAvailable: boolean;
  /** The trial they're on, if any. */
  trialing: boolean;
  manageHref: string;
};

/** What the after-login pop-up shows, or null for someone already paying (or staff). */
export async function plansPromoAction(): Promise<PlansPromo | null> {
  const ctx = await getWorkspaceContext();
  if (ctx.state === "anonymous") return null;
  const actor = ctx.state === "ready" ? ctx.actor : null;
  const promo = await promoFor(ctx.userId, actor);
  if (!promo) return null;
  const { plan } = promo;
  return {
    audience: promo.audience,
    plan: { code: plan.code, name: plan.name, tagline: plan.tagline, monthlyPrice: plan.monthlyPrice, yearlyPrice: plan.yearlyPrice, trialDays: plan.trialDays, features: plan.features.slice(0, 5) },
    trialAvailable: promo.trialAvailable,
    trialing: promo.state === "trialing",
    manageHref: MANAGE_PATH[promo.audience],
  };
}

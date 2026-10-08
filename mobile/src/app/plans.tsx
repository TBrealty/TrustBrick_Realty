import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { PlanView, SubscriptionOverview } from "@/api/types";
import { useSession } from "@/auth/session";
import { Badge, Body, Button, Card, Chip, Display, ErrorState, Eyebrow, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { STATE_LABELS, inr, yearlySaving } from "@/lib/subscriptions/terms";
import { useColors } from "@/theme";

/** Trustbrick's plans for people, and the free trial. Paying in the app comes with the payment gateway. */
export default function Plans() {
  const c = useColors();
  const queryClient = useQueryClient();
  const { status, refreshMe } = useSession();
  const signedIn = status === "signedIn";
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const overview = useQuery({
    queryKey: ["subscription", signedIn],
    queryFn: async (): Promise<SubscriptionOverview | { plans: PlanView[]; subscription: null; trialAvailable: true }> =>
      signedIn ? api<SubscriptionOverview>("/subscription") : { ...(await api<{ plans: PlanView[] }>("/plans?for=customer")), subscription: null, trialAvailable: true },
  });
  const trial = useMutation({
    mutationFn: (plan: string) => api("/subscription/trial", { method: "POST", body: { plan, cycle } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["listing"] });
      void queryClient.invalidateQueries({ queryKey: ["tour"] });
      refreshMe();
    },
  });

  if (overview.isPending) return <Loading />;
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
  const { plans, subscription, trialAvailable } = overview.data;
  const paid = plans.filter((p) => !p.free);
  const state = subscription ? STATE_LABELS[subscription.state] : null;

  return (
    <Scroll>
      <View style={{ gap: 6 }}>
        <Eyebrow tone="brick">Trustbrick Plus</Eyebrow>
        <Display size={32}>See the home before you visit</Display>
        <Body tone="graphite">Virtual tours and 3D views of homes, with AI locality insights and more on the way.</Body>
      </View>

      {subscription && state && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Title>Your plan: {subscription.plan.name}</Title>
            <Badge label={state.label} tone={state.tone} />
          </View>
          <Small>
            {subscription.state === "trialing" && subscription.trialEndsAt
              ? `Free trial until ${formatDay(subscription.trialEndsAt)}.`
              : subscription.currentPeriodEnd
                ? `Until ${formatDay(subscription.currentPeriodEnd)}.`
                : ""}
          </Small>
        </Card>
      )}
      {trial.isSuccess && <Notice tone="success">Your free trial has started. Virtual tours are open.</Notice>}
      {trial.isError && <Notice>{(trial.error as Error).message}</Notice>}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Monthly" selected={cycle === "monthly"} onPress={() => setCycle("monthly")} />
        <Chip label="Yearly" selected={cycle === "yearly"} onPress={() => setCycle("yearly")} />
      </View>

      {paid.map((plan) => {
        const current = subscription?.plan.code === plan.code && ["trialing", "active", "pending_payment", "past_due", "paused"].includes(subscription.state);
        const saving = yearlySaving(plan);
        return (
          <Card key={plan.code} style={{ borderColor: plan.highlighted ? c.brick : c.line, borderWidth: plan.highlighted ? 1.5 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Title>{plan.name}</Title>
              {cycle === "yearly" && saving > 0 && <Badge label={`Save ${saving}%`} tone="success" />}
            </View>
            <Body tone="graphite">{plan.tagline}</Body>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Display size={30}>{inr(cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice)}</Display>
              <Small>{cycle === "monthly" ? "a month" : "a year"} + GST</Small>
            </View>
            <View style={{ gap: 8 }}>
              {plan.features.map((f) => (
                <View key={f.key} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                  <Ionicons name={f.comingSoon ? "time-outline" : "checkmark-circle"} size={18} color={f.comingSoon ? c.faint : c.sage} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontSize: 14 }}>
                      {f.label}
                      {f.comingSoon ? "  (coming soon)" : ""}
                    </Body>
                    {f.detail ? <Small>{f.detail}</Small> : null}
                  </View>
                </View>
              ))}
            </View>
            {current ? (
              <Badge label="Your plan" tone="success" />
            ) : !signedIn ? (
              <Button label={`Start the ${plan.trialDays}-day free trial`} variant="accent" onPress={() => router.push("/sign-in")} />
            ) : trialAvailable && plan.trialDays > 0 ? (
              <Button label={`Start the ${plan.trialDays}-day free trial`} variant="accent" loading={trial.isPending} onPress={() => trial.mutate(plan.code)} />
            ) : (
              <Small>Paying for {plan.name} in the app is coming soon. Until then, choose it on the Trustbrick website.</Small>
            )}
          </Card>
        );
      })}
      <Small>No card needed for the trial. It ends by itself unless you choose to pay.</Small>
    </Scroll>
  );
}

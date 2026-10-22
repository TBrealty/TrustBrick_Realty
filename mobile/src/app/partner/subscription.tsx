import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { PartnerSubscription } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale, thud, tick } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { confirm } from "@/confirm";
import { formatDay } from "@/lib/format";
import { EVENT_LABELS, LIVE_STATES, STATE_LABELS, inr, yearlySaving } from "@/lib/subscriptions/terms";
import { fonts, radius, useColors } from "@/theme";

/**
 * The organization's partner plan, as the website's Subscription page: what it's on, the free
 * trial, choosing a paid plan (Trustbrick's team arranges the payment), and stopping or
 * resuming renewal. Only the organization's admin (or a sole trader) can change it.
 */
export default function PartnerPlan() {
  const c = useColors();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const data = useQuery({ queryKey: ["partner-subscription", workspace], queryFn: () => api<PartnerSubscription>("/partner/subscription") });
  const act = useMutation({
    mutationFn: (p: { kind: "trial" | "choose" | "cancel" | "resume"; plan?: string }) => api(`/partner/subscription/${p.kind}`, { method: "POST", body: p.plan ? { plan: p.plan, cycle } : {} }),
    onSuccess: () => {
      tick();
      void queryClient.invalidateQueries({ queryKey: ["partner-subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
    },
    onError: () => thud(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Subscription" }} />
      {data.isPending ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : (
        (() => {
          const { overview, canManage, history } = data.data;
          const sub = overview.subscription;
          const live = sub && (LIVE_STATES as readonly string[]).includes(sub.state);
          const state = sub ? STATE_LABELS[sub.state] : null;
          const paid = overview.plans.filter((p) => !p.free);
          return (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }} refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}>
              <View style={{ padding: 18, borderRadius: radius.xxl, backgroundColor: c.contrast, gap: 6 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: c.onContrast, opacity: 0.7 }}>Current plan</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 34, color: c.onContrast }}>{overview.entitledPlan.name}</Text>
                {sub && state && live ? (
                  <>
                    <Badge label={state.label} tone={state.tone} />
                    <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.onContrast, opacity: 0.85 }}>
                      {sub.state === "trialing" && sub.trialEndsAt
                        ? `Free trial until ${formatDay(sub.trialEndsAt)}${sub.trialDaysLeft != null ? ` (${sub.trialDaysLeft} days left)` : ""}.`
                        : sub.currentPeriodEnd
                          ? `${sub.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatDay(sub.currentPeriodEnd)} · ${inr(sub.price)} ${sub.billingCycle === "monthly" ? "a month" : "a year"}`
                          : sub.state === "pending_payment"
                            ? "Our team will be in touch to arrange payment."
                            : ""}
                    </Text>
                    {sub.statusReason ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.onContrast, opacity: 0.75 }}>{sub.statusReason}</Text> : null}
                  </>
                ) : (
                  <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.onContrast, opacity: 0.85 }}>{overview.entitledPlan.tagline}</Text>
                )}
              </View>

              {!canManage && <Notice tone="info">Your organization&apos;s admin manages its subscription.</Notice>}
              {act.isError && <Notice>{(act.error as Error).message}</Notice>}
              {act.isSuccess && act.variables?.kind === "choose" && <Notice tone="success">Thanks. Our team will be in touch to arrange payment.</Notice>}

              {canManage && live && sub && (
                <Button
                  label={sub.cancelAtPeriodEnd ? "Keep renewing" : "Stop renewing"}
                  variant={sub.cancelAtPeriodEnd ? "accent" : "secondary"}
                  loading={act.isPending && (act.variables?.kind === "cancel" || act.variables?.kind === "resume")}
                  onPress={async () => {
                    if (sub.cancelAtPeriodEnd) return act.mutate({ kind: "resume" });
                    if (await confirm("Stop renewing?", sub.currentPeriodEnd ? `The plan keeps working until ${formatDay(sub.currentPeriodEnd)}, then moves to Free.` : "The plan moves to Free when this period ends.", "Stop renewing")) act.mutate({ kind: "cancel" });
                  }}
                />
              )}

              {paid.length > 0 && (
                <View style={{ flexDirection: "row", backgroundColor: c.sand, borderRadius: radius.pill, padding: 4, alignSelf: "flex-start" }}>
                  {(["monthly", "yearly"] as const).map((k) => (
                    <PressableScale key={k} accessibilityRole="radio" accessibilityState={{ selected: cycle === k }} onPress={() => setCycle(k)} style={{ paddingHorizontal: 18, height: 36, borderRadius: radius.pill, justifyContent: "center", backgroundColor: cycle === k ? c.surface : "transparent" }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: cycle === k ? c.text : c.muted }}>{k === "monthly" ? "Monthly" : "Yearly"}</Text>
                    </PressableScale>
                  ))}
                </View>
              )}

              {paid.map((plan) => {
                const current = live && sub?.plan.code === plan.code;
                const saving = yearlySaving(plan);
                return (
                  <View key={plan.code} style={{ padding: 18, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: plan.highlighted ? 2 : 1, borderColor: plan.highlighted ? c.brick : c.line, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text }}>{plan.name}</Text>
                      {current ? <Badge label="Your plan" tone="success" /> : cycle === "yearly" && saving > 0 ? <Badge label={`Save ${saving}%`} tone="success" /> : null}
                    </View>
                    <Small tone="graphite">{plan.tagline}</Small>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 32, color: c.text }}>{inr(cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice)}</Text>
                      <Small>{cycle === "monthly" ? "a month" : "a year"} + GST</Small>
                    </View>
                    {plan.features.map((f) => (
                      <View key={f.key} style={{ flexDirection: "row", gap: 10 }}>
                        <Ionicons name={f.comingSoon ? "time-outline" : "checkmark-circle"} size={18} color={f.comingSoon ? c.faint : c.sage} style={{ marginTop: 1 }} />
                        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.text }}>
                          {f.label}
                          {f.comingSoon ? " (coming soon)" : ""}
                        </Text>
                      </View>
                    ))}
                    {canManage && !current && (
                      <View style={{ gap: 8 }}>
                        {overview.trialAvailable && plan.trialDays > 0 && !live && (
                          <Button label={`Start the ${plan.trialDays}-day free trial`} variant="accent" loading={act.isPending && act.variables?.kind === "trial" && act.variables.plan === plan.code} onPress={() => act.mutate({ kind: "trial", plan: plan.code })} />
                        )}
                        <Button
                          label={live ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
                          variant={overview.trialAvailable && plan.trialDays > 0 && !live ? "secondary" : "accent"}
                          loading={act.isPending && act.variables?.kind === "choose" && act.variables.plan === plan.code}
                          onPress={async () => (await confirm(`Choose ${plan.name}?`, `${inr(cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice)} ${cycle === "monthly" ? "a month" : "a year"} + GST. Our team will contact you to arrange payment.`, "Choose")) && act.mutate({ kind: "choose", plan: plan.code })}
                        />
                      </View>
                    )}
                  </View>
                );
              })}

              {history.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>History</Text>
                  {history.map((h, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.text }}>
                        {EVENT_LABELS[h.action] ?? h.action}
                        {h.amount ? ` · ${inr(h.amount)}` : ""}
                      </Text>
                      <Small>{formatDay(h.at)}</Small>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          );
        })()
      )}
    </View>
  );
}

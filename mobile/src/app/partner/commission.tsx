import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api, query } from "@/api/client";
import type { Commission } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale, thud, tick } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { COMMISSION_SERVICE_LABELS, describeRate, whenCharged } from "@/lib/commission/terms";
import { formatDay, formatPrice } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

const TABS = [
  ["due", "Due"],
  ["paid", "Paid"],
  ["waived", "Waived"],
  ["all", "All"],
] as const;
const inr = (n: number) => formatPrice(n, { compact: false });

/**
 * Trustbrick's commission, as the website's page: the rates and accepting them (listings can't be
 * submitted until they are), what's due, and every charge.
 */
export default function CommissionScreen() {
  const c = useColors();
  const { me, workspace } = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof TABS)[number][0]>("due");
  const data = useQuery({ queryKey: ["partner-commission", workspace, status], queryFn: () => api<Commission>(`/partner/commission${query({ status })}`), placeholderData: (prev) => prev });
  const accept = useMutation({
    mutationFn: () => api("/partner/commission/accept", { method: "POST" }),
    onSuccess: () => {
      tick();
      void queryClient.invalidateQueries({ queryKey: ["partner-commission"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-workspace"] });
    },
    onError: () => thud(),
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Commission" }} />
      {data.isPending ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : (
        (() => {
          const d = data.data;
          const totals = d.ledger.totals ?? {};
          const org = me?.workspaces.find((w) => w.membershipId === workspace)?.organization.name ?? "Your organization";
          return (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }} refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}>
              <Small>Trustbrick&apos;s commission on the deals and stays you close through the platform. Charges are listed here as they&apos;re added.</Small>

              {/* Rates */}
              <View style={{ padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>Your rates</Text>
                  {d.acceptance.accepted ? <Badge label="Accepted" tone="success" /> : <Badge label={d.acceptance.outdated ? "Changed: accept again" : "Not accepted yet"} tone="warning" />}
                </View>
                {d.services.map((s) => (
                  <View key={s} style={{ gap: 2 }}>
                    <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>
                      {COMMISSION_SERVICE_LABELS[s]}: {describeRate(s, d.rates[s])}
                      {d.rates[s].custom ? "  ·  your rate" : ""}
                    </Text>
                    <Small style={{ fontSize: 12 }}>Charged {whenCharged(s)}.</Small>
                  </View>
                ))}
                <Small style={{ fontSize: 12 }}>Plus {d.gstPercent}% GST on each charge.</Small>
                <View style={{ height: 1, backgroundColor: c.line }} />
                {d.acceptance.accepted ? (
                  <Small>
                    Accepted {d.acceptance.acceptedAt ? formatDay(d.acceptance.acceptedAt) : ""}
                    {d.acceptance.acceptedBy ? ` by ${d.acceptance.acceptedBy}` : ""}. If Trustbrick changes a rate, you&apos;ll be asked to accept it before submitting more listings.
                  </Small>
                ) : d.mayAccept ? (
                  <View style={{ gap: 10 }}>
                    <Small tone="graphite">
                      {d.acceptance.outdated ? "Your rates have changed since you last accepted them. " : ""}
                      By accepting, {org} agrees to pay Trustbrick these rates on deals and stays closed through the platform. You need to accept before submitting listings for approval.
                    </Small>
                    {accept.isError && <Notice>{(accept.error as Error).message}</Notice>}
                    <Button label="Accept these rates" variant="accent" loading={accept.isPending} onPress={() => accept.mutate()} />
                  </View>
                ) : (
                  <Small tone="graphite">Your organization&apos;s admin needs to accept these rates before listings can be submitted for approval.</Small>
                )}
              </View>

              {/* Totals */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Total label="Due now" value={inr(totals.due ?? 0)} hint={`${totals.dueCount ?? 0} charges`} strong />
                <Total label="Overdue" value={inr(totals.overdue ?? 0)} />
                <Total label="Paid this month" value={inr(totals.paidThisMonth ?? 0)} />
              </View>

              {/* Ledger */}
              <View style={{ flexDirection: "row", backgroundColor: c.sand, borderRadius: radius.pill, padding: 4 }}>
                {TABS.map(([k, label]) => (
                  <PressableScale key={k} accessibilityRole="tab" accessibilityState={{ selected: status === k }} onPress={() => setStatus(k)} style={{ flex: 1, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: status === k ? c.surface : "transparent" }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: status === k ? c.text : c.muted }}>{label}</Text>
                  </PressableScale>
                ))}
              </View>
              {d.ledger.rows.length === 0 ? (
                <View style={{ padding: 20, alignItems: "center", borderRadius: radius.xl, borderWidth: 1, borderStyle: "dashed", borderColor: c.line }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{status === "due" ? "Nothing due" : "No charges here"}</Text>
                  <Small style={{ textAlign: "center" }}>Charges appear here when you mark a sale or rental closed by you, or a guest checks in to one of your stays.</Small>
                </View>
              ) : (
                d.ledger.rows.map((r) => (
                  <View key={r.referenceId} style={{ padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: r.overdue ? c.brick : c.line, gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={2}>
                        {r.listing?.title ?? r.description}
                      </Text>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{inr(r.total)}</Text>
                    </View>
                    <Small numberOfLines={2}>{r.description}</Small>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Badge label={r.overdue ? "Overdue" : r.status.charAt(0).toUpperCase() + r.status.slice(1)} tone={r.overdue ? "danger" : r.status === "paid" ? "success" : r.status === "due" ? "warning" : "neutral"} />
                      <Small style={{ fontSize: 12 }}>
                        {r.referenceId} · {formatDay(r.createdAt)}
                        {r.ratePercent != null ? ` · ${r.ratePercent}%` : ""} · {inr(r.amount)} + {inr(r.gstAmount)} GST
                      </Small>
                    </View>
                  </View>
                ))
              )}
              <Small style={{ fontSize: 12 }}>Pay Trustbrick as the team asks, quoting each charge&apos;s COM- reference; they mark it paid here. Disagree with a charge? Write to the team from Contact us with its reference.</Small>
            </ScrollView>
          );
        })()
      )}
    </View>
  );
}

function Total({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: radius.lg, backgroundColor: strong ? c.contrast : c.surface, borderWidth: strong ? 0 : 1, borderColor: c.line, gap: 2 }}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: strong ? c.onContrast : c.muted, opacity: strong ? 0.75 : 1 }}>{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: strong ? c.onContrast : c.text }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={{ fontFamily: fonts.body, fontSize: 11, color: strong ? c.onContrast : c.muted, opacity: 0.75 }}>{hint}</Text> : null}
    </View>
  );
}

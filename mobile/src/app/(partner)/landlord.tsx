import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import { LINK_TONE, type LandlordHome, ordinal } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { PressableScale } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, Body, Button, Card, Display, EmptyState, ErrorState, Loading, Notice, Screen, Small, Title } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fonts, useColors } from "@/theme";

/**
 * A landlord's home in the app: properties their agents added (each needs proof of ownership),
 * requests to accept, what's left to set up before rent can reach them, and what's been paid.
 */
export default function LandlordHomeScreen() {
  const c = useColors();
  const space = useTabBarSpace();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const home = useQuery({ queryKey: ["landlord", workspace], queryFn: () => api<LandlordHome>("/partner/landlord") });
  const answer = useMutation({
    mutationFn: ({ ref, accept }: { ref: string; accept: boolean }) => api(`/partner/landlord/requests/${ref}`, { method: "POST", body: { accept } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["landlord"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
    },
  });

  if (home.isPending) return <Loading />;
  if (home.isError) return <ErrorState error={home.error} onRetry={() => home.refetch()} />;
  const h = home.data;
  const tenancyOf = new Map(h.tenancies.map((t) => [t.propertyReferenceId, t]));
  const steps = [
    { done: h.properties.some((p) => p.status === "approved"), label: "Proof of ownership approved", hint: "Upload it on each property below.", href: null },
    { done: h.bank?.status === "verified", label: h.bank ? (h.bank.status === "verified" ? "Bank account verified" : "Bank account being checked") : "Add your bank account", hint: "Rent is paid into it.", href: "/partner/landlord/bank" },
    { done: Boolean(h.panMasked), label: "Add your PAN", hint: "Your tenants' receipts show it, for their HRA claims.", href: "/partner/landlord/bank" },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: space, gap: 18 }} refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => home.refetch()} tintColor={c.brick} />}>
        <View style={{ gap: 4 }}>
          <Display size={30}>My properties</Display>
          <Small>Your tenants pay rent online; Trustbrick pays it into your bank account. Landlord {h.referenceId}</Small>
        </View>

        {answer.isError && <Notice>{(answer.error as Error).message}</Notice>}
        {h.requests.map((r) => (
          <Card key={r.referenceId}>
            <Title>{r.title}</Title>
            <Small>
              {r.address} · added by {r.agentName}
            </Small>
            <Body tone="graphite">Is this property yours? Answer by {formatDateTime(r.expiresAt)}.</Body>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="It's mine: accept" compact variant="accent" loading={answer.isPending && answer.variables?.ref === r.referenceId && answer.variables.accept} onPress={() => answer.mutate({ ref: r.referenceId, accept: true })} />
              <Button label="Not mine" compact variant="secondary" onPress={() => answer.mutate({ ref: r.referenceId, accept: false })} />
            </View>
          </Card>
        ))}

        {steps.some((s) => !s.done) && (
          <Card>
            <Title>Before rent can reach you</Title>
            {steps.map((s) => (
              <PressableScale key={s.label} disabled={!s.href || s.done} onPress={() => s.href && router.push(s.href as Href)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={s.done ? c.sage : c.faint} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: s.done ? c.muted : c.text }}>{s.label}</Text>
                  {!s.done && <Small>{s.hint}</Small>}
                </View>
                {s.href && !s.done && <Ionicons name="chevron-forward" size={16} color={c.faint} />}
              </PressableScale>
            ))}
          </Card>
        )}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}>
            <Title>{formatMoney(h.totals.paidOut)}</Title>
            <Small>Paid into your bank</Small>
          </Card>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}>
            <Title>{formatMoney(h.totals.waiting + h.totals.onHold)}</Title>
            <Small>On its way or waiting</Small>
          </Card>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Rent received" compact variant="secondary" icon="cash-outline" style={{ flex: 1 }} onPress={() => router.push("/partner/landlord/received" as Href)} />
          <Button label="Bank account" compact variant="secondary" icon="card-outline" style={{ flex: 1 }} onPress={() => router.push("/partner/landlord/bank" as Href)} />
        </View>

        {h.properties.length === 0 ? (
          <EmptyState icon="home-outline" title="No properties yet">
            When an agent adds you as a property&apos;s landlord, it appears here.
          </EmptyState>
        ) : (
          h.properties.map((p) => {
            const t = tenancyOf.get(p.propertyReferenceId);
            return (
              <PressableScale key={p.linkId} scaleTo={0.99} onPress={() => router.push(`/partner/landlord/property/${p.propertyReferenceId}` as Href)}>
                <Card>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Title numberOfLines={1}>{p.title}</Title>
                      <Small numberOfLines={1}>{p.address}</Small>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.faint} />
                  </View>
                  <Badge label={p.statusLabel} tone={LINK_TONE[p.status]} />
                  <Small>
                    {t
                      ? `${t.tenantName} · ${formatMoney(t.monthlyRent)} a month, due on the ${ordinal(t.dueDay)} · ${t.status === "active" ? "active" : t.landlordConfirmed ? "waiting for the tenant" : "please confirm the terms"}`
                      : "No tenancy yet"}
                  </Small>
                </Card>
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

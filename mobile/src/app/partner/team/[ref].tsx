import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Linking, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { AgentDetail } from "@/api/workspace-types";
import { PressableScale } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Small } from "@/components/ui";
import { formatDay, relativeTime } from "@/lib/format";
import { AGENT_TONE, STATUS_TONE } from "@/partner/labels";
import { fonts, radius, useColors } from "@/theme";

/** One of the organization's agents: how to reach them, their numbers, and their latest listings. */
export default function TeamMember() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const agent = useQuery({ queryKey: ["partner-agent", ref], queryFn: () => api<AgentDetail>(`/partner/agents/${ref}`) });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: agent.data?.name ?? "Agent" }} />
      {agent.isPending ? (
        <Loading />
      ) : agent.isError ? (
        <ErrorState error={agent.error} onRetry={() => agent.refetch()} />
      ) : (
        (() => {
          const a = agent.data;
          return (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}>
              <View style={{ alignItems: "center", gap: 8 }}>
                <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.slateSoft, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 36, color: c.slate }}>{a.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={{ fontFamily: fonts.display, fontSize: 30, color: c.text, textAlign: "center" }}>{a.name}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Badge label={a.status.charAt(0).toUpperCase() + a.status.slice(1)} tone={AGENT_TONE[a.status] ?? "neutral"} />
                  {a.verificationStatus === "verified" && <Badge label="Verified" tone="success" />}
                </View>
                <Small>
                  {[a.city, a.experienceYears != null ? `${a.experienceYears} years' experience` : null, a.reraAgentNumber ? `RERA ${a.reraAgentNumber}` : null].filter(Boolean).join(" · ")}
                </Small>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                {a.phone ? <Button label="Call" icon="call" variant="secondary" onPress={() => Linking.openURL(`tel:${a.phone}`)} style={{ flex: 1 }} /> : null}
                {a.phone ? <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${a.phone.replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10})$/, "91$1")}`)} style={{ flex: 1 }} /> : null}
                <Button label="Email" icon="mail" variant="secondary" onPress={() => Linking.openURL(`mailto:${a.email}`)} style={{ flex: 1 }} />
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {(
                  [
                    ["Live listings", a.counts.activeListings],
                    ["In review", a.counts.pendingListings],
                    ["Leads", a.leads],
                    ["Visits", a.counts.visits],
                  ] as const
                ).map(([label, n]) => (
                  <View key={label} style={{ width: "48%", flexGrow: 1, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 32, color: c.text }}>{n}</Text>
                    <Small>{label}</Small>
                  </View>
                ))}
              </View>

              {a.bio ? <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.graphite }}>{a.bio}</Text> : null}
              <Small>
                Joined {formatDay(a.createdAt)}
                {a.lastActiveAt ? ` · last active ${relativeTime(a.lastActiveAt)}` : ""}
              </Small>

              {a.recentListings.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>Recent listings</Text>
                  <View style={{ borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
                    {a.recentListings.map((l, i) => (
                      <PressableScale key={l.referenceId} scaleTo={0.99} accessibilityRole="link" onPress={() => router.push(`/partner/property/${l.referenceId}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                        <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: c.text }} numberOfLines={1}>
                          {l.title}
                        </Text>
                        <Badge label={l.status.replace(/_/g, " ")} tone={STATUS_TONE[l.status] ?? "neutral"} />
                        <Ionicons name="chevron-forward" size={16} color={c.faint} />
                      </PressableScale>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          );
        })()
      )}
    </View>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Linking, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { api, query } from "@/api/client";
import type { LeadRow, Page } from "@/api/types";
import { useSession } from "@/auth/session";
import { PressableScale, Skeleton, enter, tick } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { leadTone } from "@/components/tones";
import { Badge, EmptyState, ErrorState, Screen, Small } from "@/components/ui";
import { LEAD_STATUS_LABELS } from "@/lib/crm/terms";
import { relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

const FILTERS = [
  ["open", "Open"],
  ["new", "New"],
  ["contacted", "Contacted"],
  ["visit_scheduled", "Visit booked"],
  ["negotiation", "Negotiating"],
  ["converted", "Converted"],
  ["lost", "Lost"],
  ["all", "All"],
] as const;

const digits = (phone: string) => phone.replace(/[^\d]/g, "").replace(/^0+/, "");

/** The person's leads, as the website's: open ones first, by stage, searchable, with a call a tap away. */
export default function Leads() {
  const c = useColors();
  const space = useTabBarSpace();
  const { workspace } = useSession();
  const params = useLocalSearchParams<{ q?: string }>();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>(params.q ? "all" : "open");
  const [q, setQ] = useState(params.q ?? "");
  const [search, setSearch] = useState(params.q ?? "");
  const where = filter === "open" ? { open: true } : filter === "all" ? {} : { status: filter };
  const leads = useInfiniteQuery({
    queryKey: ["partner-leads", workspace, filter, search],
    queryFn: ({ pageParam }) => api<Page<LeadRow>>(`/partner/leads${query({ ...where, q: search, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  const rows = leads.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 34, color: c.text }}>Leads</Text>
          <PressableScale accessibilityRole="link" onPress={() => router.push("/partner/visits")} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
            <Ionicons name="walk-outline" size={16} color={c.text} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: c.text }}>Visits</Text>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setSearch(q.trim())}
            returnKeyType="search"
            placeholder="Name, phone or listing"
            placeholderTextColor={c.faint}
            accessibilityLabel="Search leads"
            style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text }}
          />
          {q ? (
            <PressableScale
              accessibilityLabel="Clear the search"
              hitSlop={8}
              onPress={() => {
                setQ("");
                setSearch("");
              }}
            >
              <Ionicons name="close-circle" size={18} color={c.faint} />
            </PressableScale>
          ) : null}
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {FILTERS.map(([key, label]) => {
            const on = filter === key;
            return (
              <PressableScale
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tick();
                  setFilter(key);
                }}
                style={{ paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}
              >
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? c.background : c.text }}>{label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>
      {leads.isPending ? (
        <View style={{ padding: 16, gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={78} rounded={radius.xl} />
          ))}
        </View>
      ) : leads.isError ? (
        <ErrorState error={leads.error} onRetry={() => leads.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.referenceId}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, flexGrow: 1, paddingBottom: space }}
          onEndReached={() => leads.hasNextPage && !leads.isFetchingNextPage && leads.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={leads.isRefetching && !leads.isFetchingNextPage} onRefresh={() => leads.refetch()} tintColor={c.brick} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={index < 8 ? enter(index, 40) : undefined}>
              <PressableScale
                scaleTo={0.98}
                accessibilityRole="link"
                accessibilityLabel={`${item.contactName}, ${LEAD_STATUS_LABELS[item.status]}`}
                onPress={() => router.push(`/partner/lead/${item.referenceId}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: item.status === "new" ? c.brickSoft : c.paper, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: item.status === "new" ? c.brick : c.graphite }}>{item.contactName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
                      {item.contactName}
                    </Text>
                    <Badge label={LEAD_STATUS_LABELS[item.status]} tone={leadTone(item.status)} />
                  </View>
                  <Small numberOfLines={1}>{item.listingTitle ?? "General enquiry"}</Small>
                  <Small style={{ fontSize: 12 }} numberOfLines={1}>
                    {item.agentName ? `${item.agentName} · ` : ""}
                    {relativeTime(item.lastActivityAt)}
                  </Small>
                </View>
                {item.contactPhone && (
                  <PressableScale accessibilityRole="button" accessibilityLabel={`Call ${item.contactName}`} hitSlop={6} onPress={() => Linking.openURL(`tel:${digits(item.contactPhone!)}`)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sageSoft, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="call" size={18} color={c.sage} />
                  </PressableScale>
                )}
              </PressableScale>
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title={search ? "No one matches" : filter === "new" ? "No new leads" : "No leads here"}>
              Enquiries about your listings arrive here and as notifications.
            </EmptyState>
          }
          ListFooterComponent={leads.isFetchingNextPage ? <Skeleton height={78} rounded={radius.xl} /> : null}
        />
      )}
    </Screen>
  );
}

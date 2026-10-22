import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { api, query } from "@/api/client";
import type { Page } from "@/api/types";
import type { AgentRow } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale } from "@/components/motion";
import { Badge, Chip, EmptyState, ErrorState, Loading, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { AGENT_TONE } from "@/partner/labels";
import { fonts, radius, useColors } from "@/theme";

const STATUSES = [
  ["", "All"],
  ["active", "Active"],
  ["pending", "Pending"],
  ["suspended", "Suspended"],
] as const;

/** The organization's agents, as the website's Agents page (broker admins): who they are and how busy. */
export default function Team() {
  const c = useColors();
  const { workspace } = useSession();
  const [status, setStatus] = useState<(typeof STATUSES)[number][0]>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["partner-agents", workspace, status, search],
    queryFn: ({ pageParam }) => api<Page<AgentRow>>(`/partner/agents${query({ status, q: search, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Agents" }} />
      <View style={{ padding: 16, paddingBottom: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q.trim())} returnKeyType="search" placeholder="Name, email or phone" placeholderTextColor={c.faint} accessibilityLabel="Search agents" style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text }} />
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {STATUSES.map(([k, label]) => (
            <Chip key={k || "all"} label={label} selected={status === k} onPress={() => setStatus(k)} />
          ))}
        </ScrollView>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(a) => a.referenceId}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <PressableScale scaleTo={0.98} accessibilityRole="link" onPress={() => router.push(`/partner/team/${item.referenceId}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.slateSoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.slate }}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Badge label={item.status.charAt(0).toUpperCase() + item.status.slice(1)} tone={AGENT_TONE[item.status] ?? "neutral"} />
                </View>
                <Small numberOfLines={1}>
                  {item.listings} listings · {item.leads} leads
                  {item.lastActiveAt ? ` · active ${relativeTime(item.lastActiveAt)}` : ""}
                </Small>
              </View>
            </PressableScale>
          )}
          ListEmptyComponent={<EmptyState icon="id-card-outline" title="No agents here" />}
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </View>
  );
}

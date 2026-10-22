import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { FlatList, Linking, RefreshControl, Text, TextInput, View } from "react-native";
import { api, query } from "@/api/client";
import type { Page } from "@/api/types";
import type { ContactRow } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale } from "@/components/motion";
import { EmptyState, ErrorState, Loading, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

/** Clients, as on the website: everyone who has enquired on the person's listings, to call, message or open their leads. */
export default function Clients() {
  const c = useColors();
  const { workspace } = useSession();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["partner-contacts", workspace, search],
    queryFn: ({ pageParam }) => api<Page<ContactRow>>(`/partner/contacts${query({ q: search, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Clients" }} />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setSearch(q.trim())}
            returnKeyType="search"
            placeholder="Name, phone or email"
            placeholderTextColor={c.faint}
            accessibilityLabel="Search clients"
            style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text }}
          />
        </View>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(x) => x.referenceId}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, flexGrow: 1, paddingBottom: 40 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.brickSoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.brick }}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <PressableScale accessibilityRole="link" style={{ flex: 1, gap: 2 }} onPress={() => router.push({ pathname: "/leads", params: { q: item.name } })}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Small numberOfLines={1}>
                  {item.leads} {item.leads === 1 ? "lead" : "leads"}
                  {item.lastActivityAt ? ` · ${relativeTime(item.lastActivityAt)}` : ""}
                </Small>
              </PressableScale>
              {item.phone && (
                <PressableScale accessibilityRole="button" accessibilityLabel={`Call ${item.name}`} onPress={() => Linking.openURL(`tel:${item.phone}`)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sageSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="call" size={18} color={c.sage} />
                </PressableScale>
              )}
              {item.email && (
                <PressableScale accessibilityRole="button" accessibilityLabel={`Email ${item.name}`} onPress={() => Linking.openURL(`mailto:${item.email}`)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.slateSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="mail" size={18} color={c.slate} />
                </PressableScale>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState icon="person-outline" title={search ? "No one matches" : "No clients yet"}>
              Everyone who enquires about your listings is kept here.
            </EmptyState>
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </View>
  );
}

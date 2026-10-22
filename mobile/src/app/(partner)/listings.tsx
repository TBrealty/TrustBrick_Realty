import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { api, assetUrl, authHeaders, query } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import type { ListingsPage } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale, Skeleton, enter, tick } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, EmptyState, ErrorState, Screen, Small } from "@/components/ui";
import { formatListingPrice } from "@/lib/format";
import { STATUS_TONE } from "@/partner/labels";
import { fonts, radius, shadow, useColors } from "@/theme";

const GROUPS = [
  ["all", "All"],
  ["active", "Live"],
  ["drafts", "Drafts"],
  ["pending", "In review"],
  ["rejected", "Rejected"],
  ["archived", "Closed"],
] as const;
type Group = (typeof GROUPS)[number][0];

/** The person's properties, as the website's list: search, status groups with counts, and onboarding a new one. */
export default function Properties() {
  const c = useColors();
  const space = useTabBarSpace();
  const { workspace } = useSession();
  const [group, setGroup] = useState<Group>("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary") });
  const list = useInfiniteQuery({
    queryKey: ["partner-listings", workspace, group, search],
    queryFn: ({ pageParam }) => api<ListingsPage>(`/partner/listings${query({ group, q: search, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const canOnboard = summary.data?.can.onboard;

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 34, color: c.text }}>Properties</Text>
          {counts ? <Small>{counts.all} in all</Small> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setSearch(q.trim())}
            returnKeyType="search"
            placeholder="Search by title, locality or reference"
            placeholderTextColor={c.faint}
            accessibilityLabel="Search properties"
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
          {GROUPS.map(([key, label]) => {
            const on = group === key;
            const n = counts?.[key];
            return (
              <PressableScale
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tick();
                  setGroup(key);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}
              >
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? c.background : c.text }}>{label}</Text>
                {n ? <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: on ? c.background : c.muted, opacity: 0.8 }}>{n}</Text> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      {list.isPending ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} rounded={radius.xl} />
          ))}
        </View>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: space + 70, gap: 10, flexGrow: 1 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={index < 8 ? enter(index, 40) : undefined}>
              <PressableScale
                scaleTo={0.98}
                accessibilityRole="link"
                accessibilityLabel={`${item.title}, ${item.statusLabel}`}
                onPress={() => router.push(`/partner/property/${item.referenceId}`)}
                style={{ flexDirection: "row", gap: 12, padding: 10, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
              >
                <View style={{ width: 84, height: 84, borderRadius: radius.lg, backgroundColor: c.sand, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                  {item.image ? <Image source={{ uri: assetUrl(item.image), headers: authHeaders() }} style={{ width: 84, height: 84 }} contentFit="cover" transition={150} /> : <Ionicons name="image-outline" size={24} color={c.faint} />}
                </View>
                <View style={{ flex: 1, gap: 3, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
                    {item.title || "Untitled property"}
                  </Text>
                  <Small numberOfLines={1}>
                    {formatListingPrice(item.price, item.purpose)} · {item.locality}
                  </Small>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                    <Badge label={item.statusLabel} tone={STATUS_TONE[item.status] ?? "neutral"} />
                    {item.tour && <Badge label={item.tour.hidden ? "Tour hidden" : item.tour.model || item.tour.link ? "3D tour" : "360° tour"} tone={item.tour.hidden ? "danger" : "info"} />}
                    {item.isSample && <Badge label="Sample" />}
                  </View>
                  {item.status === "published" && (
                    <Small style={{ fontSize: 12 }}>
                      {item.views} views · {item.leads} leads{item.agentName ? ` · ${item.agentName}` : ""}
                    </Small>
                  )}
                  {item.statusReason && ["changes_requested", "rejected"].includes(item.status) ? (
                    <Small tone="amber" numberOfLines={1} style={{ fontSize: 12 }}>
                      {item.statusReason}
                    </Small>
                  ) : null}
                </View>
              </PressableScale>
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState icon="business-outline" title={search ? "Nothing matches" : group === "all" ? "No properties yet" : "None here"}>
              {search ? "Try another word, or clear the search." : canOnboard ? "Onboard your first property: it takes a few minutes, right from your phone." : "Properties you're given show up here."}
            </EmptyState>
          }
          ListFooterComponent={list.isFetchingNextPage ? <Skeleton height={96} rounded={radius.xl} /> : null}
        />
      )}

      {canOnboard && (
        <View pointerEvents="box-none" style={{ position: "absolute", right: 16, bottom: space - 4 }}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Onboard a property"
            onPress={() => router.push("/partner/property/new")}
            style={[{ flexDirection: "row", alignItems: "center", gap: 8, height: 52, paddingHorizontal: 20, borderRadius: 26, backgroundColor: c.brick }, shadow.float]}
          >
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: "#fff" }}>Onboard</Text>
          </PressableScale>
        </View>
      )}
    </Screen>
  );
}

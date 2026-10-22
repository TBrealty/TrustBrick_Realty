import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { api, query } from "@/api/client";
import type { Page, VisitRow } from "@/api/types";
import { useSession } from "@/auth/session";
import { Chip, EmptyState, ErrorState, Loading } from "@/components/ui";
import { VisitCard } from "@/partner/visit-card";
import { useColors } from "@/theme";

const FILTERS = [
  ["upcoming", "Coming up"],
  ["requested", "To confirm"],
  ["completed", "Done"],
  ["cancelled", "Cancelled"],
] as const;

/** Site visits, as the website's Visits: requests to confirm first, then what's coming up. */
export default function Visits() {
  const c = useColors();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("upcoming");
  const list = useInfiniteQuery({
    queryKey: ["partner-visits", workspace, filter],
    queryFn: ({ pageParam }) => api<Page<VisitRow>>(`/partner/visits${query(filter === "upcoming" ? { upcoming: true, page: pageParam } : { status: filter, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-visits"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Visits" }} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {FILTERS.map(([key, label]) => (
            <Chip key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} />
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
          keyExtractor={(v) => v.referenceId}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, flexGrow: 1, paddingBottom: 40 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => <VisitCard visit={item} onChanged={changed} withContext />}
          ListEmptyComponent={
            <EmptyState icon="walk-outline" title={filter === "requested" ? "No visits to confirm" : "No visits here"}>
              When a customer asks to see a property, the request arrives here and as a notification.
            </EmptyState>
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </View>
  );
}

import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api, assetUrl, query } from "@/api/client";
import type { Page, PartnerListingRow } from "@/api/types";
import { useSession } from "@/auth/session";
import { Badge, Body, Chip, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { formatListingPrice } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

const GROUPS = [
  ["active", "Live"],
  ["all", "All"],
  ["drafts", "Drafts"],
  ["pending", "In review"],
] as const;

/** The person's listings, with their tours, to manage on the go. */
export default function Listings() {
  const c = useColors();
  const { workspace } = useSession();
  const [group, setGroup] = useState<(typeof GROUPS)[number][0]>("active");
  const list = useInfiniteQuery({
    queryKey: ["partner-listings", workspace, group],
    queryFn: ({ pageParam }) => api<Page<PartnerListingRow>>(`/partner/listings${query({ group, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <Display size={32}>Listings</Display>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {GROUPS.map(([key, label]) => (
            <Chip key={key} label={label} selected={group === key} onPress={() => setGroup(key)} />
          ))}
        </View>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, gap: 4, flexGrow: 1 }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <Link href={`/partner/listing/${item.referenceId}`} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
                <Image source={{ uri: assetUrl(item.image) }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: c.sand }} contentFit="cover" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Body style={{ fontFamily: fonts.medium }} numberOfLines={2}>
                    {item.title}
                  </Body>
                  <Small numberOfLines={1}>
                    {formatListingPrice(item.price, item.purpose)} · {item.locality}
                  </Small>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <Badge label={item.statusLabel} tone={item.status === "published" ? "success" : "neutral"} />
                    {item.tour && <Badge label={item.tour.hidden ? "Tour hidden" : item.tour.model || item.tour.link ? "3D tour" : "360° tour"} tone={item.tour.hidden ? "danger" : "info"} />}
                    {item.tour?.reviewCase && <Badge label="Tour check pending" tone="warning" />}
                  </View>
                </View>
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <EmptyState icon="business-outline" title="No listings here">
              Listings are created on the website; their tours can be recorded and managed here.
            </EmptyState>
          }
          ListFooterComponent={list.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </Screen>
  );
}

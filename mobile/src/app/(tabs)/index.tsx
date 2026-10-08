import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { api, query } from "@/api/client";
import type { SearchResult } from "@/api/types";
import { ListingCard } from "@/components/listing-card";
import { Chip, Display, EmptyState, ErrorState, Eyebrow, Loading, Screen, Small } from "@/components/ui";
import { activeFilters, searchParams, setSearch, useSearch } from "@/hooks/use-search";
import { KIND_META, LISTING_KINDS } from "@/lib/listings/filters";
import { fonts, radius, useColors } from "@/theme";

/** Search, the app's home: the kind of place, a search box, filters, and results as you scroll. */
export default function Explore() {
  const c = useColors();
  const search = useSearch();
  const [text, setText] = useState(search.q);
  const params = searchParams(search);

  // Search as the person types, once they pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch({ q: text }), 400);
    return () => clearTimeout(t);
  }, [text]);

  const results = useInfiniteQuery({
    queryKey: ["search", params],
    queryFn: ({ pageParam, signal }) => api<SearchResult>(`/listings${query({ ...params, cursor: pageParam })}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;
  const filters = activeFilters(search);
  const meta = KIND_META[search.kind];

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ gap: 4 }}>
        <Eyebrow tone="brick">Trustbrick</Eyebrow>
        <Display size={32}>{meta.title}</Display>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 8 }} />
        {LISTING_KINDS.map((k) => (
          <Chip key={k} label={KIND_META[k].navLabel} selected={search.kind === k} onPress={() => setSearch({ kind: k, types: [], bhk: [], furnishing: [], min: null, max: null })} />
        ))}
        <View style={{ width: 8 }} />
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: c.surface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: c.line,
            paddingHorizontal: 14,
            height: 46,
          }}
        >
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Locality, project or keyword"
            placeholderTextColor={c.faint}
            returnKeyType="search"
            onSubmitEditing={() => setSearch({ q: text })}
            accessibilityLabel="Search"
            style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text, height: 46 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filters ? `Filters, ${filters} on` : "Filters"}
          onPress={() => router.push("/filters")}
          style={({ pressed }) => ({
            height: 46,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            backgroundColor: filters ? c.ink : c.surface,
            borderWidth: 1,
            borderColor: filters ? c.ink : c.line,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="options-outline" size={18} color={filters ? c.background : c.text} />
          {filters > 0 && <Small style={{ color: c.background, fontFamily: fonts.semibold }}>{filters}</Small>}
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <Small accessibilityLiveRegion="polite">{results.isPending ? "Searching…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "place" : "places"}`}</Small>
        <Chip label="3D tour" icon="cube-outline" selected={search.tour} onPress={() => setSearch({ tour: !search.tour })} />
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingCard listing={item} saved={item.saved} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, gap: 26, paddingBottom: 40 }}
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={results.isRefetching && !results.isFetchingNextPage} onRefresh={() => results.refetch()} tintColor={c.brick} />}
        ListEmptyComponent={
          results.isPending ? (
            <Loading />
          ) : results.isError ? (
            <ErrorState error={results.error} onRetry={() => results.refetch()} />
          ) : (
            <EmptyState icon="search-outline" title="Nothing matches yet">
              Try fewer filters, another locality, or a different kind of place.
            </EmptyState>
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <Loading /> : null}
      />
    </Screen>
  );
}

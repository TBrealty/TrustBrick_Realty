import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { api, query } from "@/api/client";
import type { SearchResult } from "@/api/types";
import { ListingCard } from "@/components/listing-card";
import { PressableScale, Skeleton, enter, tick } from "@/components/motion";
import { Chip, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { lastSearchStore } from "@/hooks/use-home";
import { activeFilters, searchParams, setSearch, useSearch } from "@/hooks/use-search";
import { KIND_META, LISTING_KINDS } from "@/lib/listings/filters";
import { fonts, radius, shadow, useColors } from "@/theme";

type Params = { focus?: string };

/** Search: the kind of place, a search box, filters, and results as you scroll. Opened with openSearch(). */
export default function SearchScreen() {
  const c = useColors();
  const params = useLocalSearchParams<Params>();
  const search = useSearch();
  const [text, setText] = useState(search.q);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (params.focus) setTimeout(() => input.current?.focus(), 250);
  }, [params.focus]);

  // Search as the person types, once they pause.
  useEffect(() => {
    const t = setTimeout(() => setSearch({ q: text }), 400);
    return () => clearTimeout(t);
  }, [text]);

  const filters = activeFilters(search);
  // Remember a search worth coming back to, for "Continue your search" on the home screen.
  useEffect(() => {
    if (!search.q.trim() && filters === (search.city ? 1 : 0)) return;
    const label = [KIND_META[search.kind].navLabel, search.q.trim() ? `“${search.q.trim()}”` : null].filter(Boolean).join(" · ");
    lastSearchStore.set({ ...search, label });
  }, [search, filters]);

  const apiParams = searchParams(search);
  const results = useInfiniteQuery({
    queryKey: ["search", apiParams],
    queryFn: ({ pageParam, signal }) => api<SearchResult>(`/listings${query({ ...apiParams, cursor: pageParam })}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;

  const header = (
    <View style={{ gap: 14, paddingBottom: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
        {LISTING_KINDS.map((k) => (
          <Chip
            key={k}
            label={KIND_META[k].navLabel}
            selected={search.kind === k}
            onPress={() => {
              tick();
              setSearch({ kind: k, types: [], bhk: [], furnishing: [], min: null, max: null });
            }}
          />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <Small accessibilityLiveRegion="polite">{results.isPending ? "Searching…" : `${total.toLocaleString("en-IN")} ${total === 1 ? "place" : "places"} · ${KIND_META[search.kind].title}`}</Small>
        <Chip
          label="3D tour"
          icon="cube-outline"
          selected={search.tour}
          onPress={() => {
            tick();
            setSearch({ tour: !search.tour });
          }}
        />
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
        >
          <Ionicons name="arrow-back" size={20} color={c.text} />
        </PressableScale>
        <View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 16, height: 48 }, shadow.soft]}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            placeholder="Locality, project or keyword"
            placeholderTextColor={c.faint}
            returnKeyType="search"
            onSubmitEditing={() => setSearch({ q: text })}
            accessibilityLabel="Search"
            style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text, height: 48 }}
          />
          {text ? (
            <PressableScale accessibilityLabel="Clear the search" hitSlop={8} onPress={() => setText("")}>
              <Ionicons name="close-circle" size={18} color={c.faint} />
            </PressableScale>
          ) : null}
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={filters ? `Filters, ${filters} on` : "Filters"}
          haptic
          onPress={() => router.push("/filters")}
          style={{ height: 48, minWidth: 48, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: filters ? c.ink : c.surface, borderWidth: 1, borderColor: filters ? c.ink : c.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Ionicons name="options-outline" size={18} color={filters ? c.background : c.text} />
          {filters > 0 && <Small style={{ color: c.background, fontFamily: fonts.semibold }}>{filters}</Small>}
        </PressableScale>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={enter(index % 12)}>
            <ListingCard listing={item} saved={item.saved} />
          </Animated.View>
        )}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 28, paddingBottom: 40 }}
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={results.isRefetching && !results.isFetchingNextPage} onRefresh={() => results.refetch()} tintColor={c.brick} colors={[c.brick]} />}
        ListEmptyComponent={
          results.isPending ? (
            <View style={{ gap: 28 }}>
              {[0, 1].map((i) => (
                <View key={i} style={{ gap: 12 }}>
                  <Skeleton height={250} rounded={radius.xxl} />
                  <Skeleton width="40%" height={24} />
                  <Skeleton width="75%" height={16} />
                </View>
              ))}
            </View>
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

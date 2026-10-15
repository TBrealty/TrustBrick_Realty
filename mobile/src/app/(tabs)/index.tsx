import { Ionicons } from "@expo/vector-icons";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { api, query } from "@/api/client";
import type { BrowseOptions, ListingSummary, SearchResult } from "@/api/types";
import { useSession } from "@/auth/session";
import { LogoMark } from "@/components/brand";
import { ListingTile } from "@/components/listing-card";
import { PressableScale, TileSkeleton, enter } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { Display, Eyebrow, Screen, Small, Title } from "@/components/ui";
import { cityStore, greeting, lastSearchStore, recentStore } from "@/hooks/use-home";
import { openSearch } from "@/hooks/use-search";
import type { ListingKind } from "@/lib/listings/filters";
import { fonts, radius, shadow, useColors } from "@/theme";

type ListingParams = Record<string, string | number | boolean | null>;

/** Several searches shown as one row, taking turns (so rent and sale homes mix). */
function useCollection(name: string, searches: ListingParams[]) {
  const results = useQueries({
    queries: searches.map((params) => ({
      queryKey: ["home", name, params],
      queryFn: ({ signal }: { signal: AbortSignal }) => api<SearchResult>(`/listings${query(params)}`, { signal }),
      staleTime: 5 * 60_000,
    })),
  });
  const lists = results.map((r) => r.data?.items ?? []);
  const items: SearchResult["items"] = [];
  for (let i = 0; items.length < 10 && lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i] && items.length < 10) items.push(l[i]);
  return { pending: results.some((r) => r.isPending), items };
}

function SectionHeader({ title, subtitle, onSeeAll }: { title: string; subtitle?: string; onSeeAll?: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 20, gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Title style={{ fontSize: 19, lineHeight: 25 }}>{title}</Title>
        {subtitle ? <Small>{subtitle}</Small> : null}
      </View>
      {onSeeAll && (
        <PressableScale accessibilityRole="button" accessibilityLabel={`See all: ${title}`} onPress={onSeeAll} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: c.brick }}>See all</Text>
          <Ionicons name="chevron-forward" size={16} color={c.brick} />
        </PressableScale>
      )}
    </View>
  );
}

/** A titled, sideways-scrolling row of listings; hidden when it has nothing to show. */
function Collection({ index, title, subtitle, items, pending, onSeeAll }: { index: number; title: string; subtitle?: string; items: (ListingSummary & { saved?: boolean })[]; pending?: boolean; onSeeAll?: () => void }) {
  const { width } = useWindowDimensions();
  const tile = Math.min(300, Math.round(width * 0.72));
  if (!pending && items.length === 0) return null;
  return (
    <Animated.View entering={enter(index)} style={{ gap: 14 }}>
      <SectionHeader title={title} subtitle={subtitle} onSeeAll={onSeeAll} />
      {pending ? (
        <View style={{ flexDirection: "row", gap: 14, paddingHorizontal: 20 }}>
          <TileSkeleton width={tile} />
          <TileSkeleton width={tile} />
        </View>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(l) => l.referenceId}
          renderItem={({ item }) => <ListingTile listing={item} saved={item.saved} width={tile} />}
          showsHorizontalScrollIndicator={false}
          snapToInterval={tile + 14}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
        />
      )}
    </Animated.View>
  );
}

const TYPES: { kind: ListingKind; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: "buy", title: "Buy a home", hint: "Flats, villas, plots", icon: "key-outline" },
  { kind: "rent", title: "Rent a home", hint: "Ready to move in", icon: "home-outline" },
  { kind: "pg", title: "PGs & co-living", hint: "Beds with meals", icon: "bed-outline" },
  { kind: "stay", title: "Homestays", hint: "A few nights away", icon: "sunny-outline" },
  { kind: "invest", title: "Invest", hint: "Projects & launches", icon: "trending-up-outline" },
];

/**
 * Home: a greeting, the person's city, one search, and collections to browse (homes with 3D
 * tours, what's new in the city, homestays, PGs, projects, what they looked at). The kinds of
 * place come up inside search, and as "Explore by type" further down, rather than first.
 */
export default function Home() {
  const c = useColors();
  const space = useTabBarSpace();
  const queryClient = useQueryClient();
  const { me, status } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const chosen = cityStore.useValue();
  const recent = recentStore.useValue();
  const last = lastSearchStore.useValue();

  const options = useQuery({ queryKey: ["options", "rent"], queryFn: () => api<BrowseOptions>("/listings/options?kind=rent"), staleTime: 30 * 60_000 });
  const cities = options.data?.cities ?? [];
  const city = chosen ?? cities.find((x) => x.slug === "hyderabad") ?? cities[0] ?? null;
  const citySlug = city?.slug ?? null;

  const tours = useCollection("tours", [
    { kind: "rent", tour: true },
    { kind: "buy", tour: true },
  ]);
  const fresh = useCollection("fresh", [
    { kind: "rent", city: citySlug },
    { kind: "buy", city: citySlug },
  ]);
  const stays = useCollection("stays", [{ kind: "stay" }]);
  const pgs = useCollection("pgs", [{ kind: "pg", city: citySlug }]);
  const projects = useCollection("projects", [{ kind: "invest" }]);

  const firstName = me?.user.name.split(" ")[0];
  const start = (patch: Parameters<typeof openSearch>[0] = {}) => openSearch({ kind: "rent", city: citySlug, ...patch });

  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    setRefreshing(false);
  };

  return (
    <Screen>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: space, gap: 34 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.brick} colors={[c.brick]} />}
      >
        {/* Brand, the greeting and the city */}
        <Animated.View entering={enter(0)} style={{ paddingHorizontal: 20, paddingTop: 10, gap: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LogoMark size={30} />
              <Text style={{ fontFamily: fonts.display, fontSize: 24, color: c.text, letterSpacing: -0.3 }}>Trustbrick</Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={status === "signedIn" ? "Your account" : "Sign in"}
              onPress={() => (status === "signedIn" ? router.navigate("/account") : router.push("/sign-in"))}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: status === "signedIn" ? c.ink : c.surface, borderWidth: status === "signedIn" ? 0 : 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}
            >
              {firstName ? <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.background }}>{firstName.slice(0, 1).toUpperCase()}</Text> : <Ionicons name="person-outline" size={19} color={c.text} />}
            </PressableScale>
          </View>
          <View style={{ gap: 6 }}>
            <Eyebrow tone="brick">{firstName ? `${greeting()}, ${firstName}` : greeting()}</Eyebrow>
            <Display size={36}>Find a home{"\n"}you can trust.</Display>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={city ? `City: ${city.name}. Change` : "Choose a city"}
            haptic
            onPress={() => router.push("/city")}
            style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          >
            <Ionicons name="location" size={16} color={c.brick} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{city?.name ?? "Choose a city"}</Text>
            <Ionicons name="chevron-down" size={15} color={c.muted} />
          </PressableScale>
        </Animated.View>

        {/* One search for everything */}
        <Animated.View entering={enter(1)} style={{ paddingHorizontal: 20, gap: 12, marginTop: -14 }}>
          <PressableScale
            accessibilityRole="search"
            accessibilityLabel="Search a locality, project or home"
            onPress={() => start({ focus: true })}
            style={[{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: radius.pill, paddingLeft: 8, paddingRight: 18, height: 62 }, shadow.soft]}
          >
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.brick, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="search" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>Search a locality, project or home</Text>
              <Small numberOfLines={1}>Buy · Rent · PGs · Stays · Invest</Small>
            </View>
          </PressableScale>
          {last && (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Continue your search: ${last.label}`}
              onPress={() => openSearch(last)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.xl, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line }}
            >
              <Ionicons name="time-outline" size={18} color={c.muted} />
              <View style={{ flex: 1 }}>
                <Small>Continue your search</Small>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }} numberOfLines={1}>
                  {last.label}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={17} color={c.text} />
            </PressableScale>
          )}
        </Animated.View>

        {recent.length > 0 && <Collection index={2} title="Recently viewed" items={recent} />}
        <Collection index={3} title="Walk through in 3D" subtitle="Tour these homes from your sofa" pending={tours.pending} items={tours.items} onSeeAll={() => start({ tour: true, city: null })} />
        <Collection index={4} title={city ? `Fresh in ${city.name}` : "Fresh on Trustbrick"} subtitle="The newest homes to rent and buy" pending={fresh.pending} items={fresh.items} onSeeAll={() => start()} />
        <Collection index={5} title="Weekend homestays" subtitle="A few nights away, pay at the property" pending={stays.pending} items={stays.items} onSeeAll={() => start({ kind: "stay", city: null })} />
        <Collection index={6} title="Rooms & PGs" subtitle="Beds with meals, close to work" pending={pgs.pending} items={pgs.items} onSeeAll={() => start({ kind: "pg" })} />
        <Collection index={7} title="Projects to invest in" subtitle="New launches and homes being built" pending={projects.pending} items={projects.items} onSeeAll={() => start({ kind: "invest", city: null })} />

        {/* Every kind of place, for those who know what they want */}
        <Animated.View entering={enter(8)} style={{ gap: 14, paddingHorizontal: 20 }}>
          <Title style={{ fontSize: 19, lineHeight: 25 }}>Explore by type</Title>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {TYPES.map((t) => (
              <PressableScale
                key={t.kind}
                haptic
                accessibilityRole="button"
                accessibilityLabel={t.title}
                onPress={() => start({ kind: t.kind, city: t.kind === "stay" || t.kind === "invest" ? null : citySlug })}
                style={{ flexBasis: "47%", flexGrow: 1, padding: 16, gap: 12, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brickSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={t.icon} size={20} color={c.brick} />
                </View>
                <View>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{t.title}</Text>
                  <Small>{t.hint}</Small>
                </View>
              </PressableScale>
            ))}
          </View>
        </Animated.View>

        <View style={{ alignItems: "center", gap: 8, paddingTop: 6 }}>
          <LogoMark size={26} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, letterSpacing: 2.4, textTransform: "uppercase", color: c.faint }}>Trust. Build. Deliver</Text>
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}


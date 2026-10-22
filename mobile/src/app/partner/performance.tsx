import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { api } from "@/api/client";
import type { Performance } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale, tick } from "@/components/motion";
import { Badge, EmptyState, ErrorState, Loading, Small } from "@/components/ui";
import { STATUS_TONE } from "@/partner/labels";
import { fonts, radius, useColors } from "@/theme";

const RANGES = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["12m", "12 months"],
] as const;
const SORTS = [
  ["views", "Views"],
  ["leads", "Leads"],
  ["visits", "Visits"],
  ["saves", "Saves"],
] as const;

/** Each listing's views, leads, visits and saves for a period, as the website's Performance page. */
export default function PerformanceScreen() {
  const c = useColors();
  const { workspace } = useSession();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("30d");
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("views");
  const data = useQuery({ queryKey: ["partner-performance", workspace, range], queryFn: () => api<Performance>(`/partner/performance?range=${range}`), placeholderData: (prev) => prev });
  const rows = [...(data.data?.rows ?? [])].sort((a, b) => b[sort] - a[sort]);
  const max = Math.max(1, ...rows.map((r) => r[sort]));

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Performance" }} />
      <View style={{ padding: 16, paddingBottom: 4, gap: 10 }}>
        <Segments items={RANGES} value={range} onChange={setRange} />
        <Segments items={SORTS} value={sort} onChange={setSort} subtle />
      </View>
      {data.isPending ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.referenceId}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <PressableScale scaleTo={0.99} accessibilityRole="link" onPress={() => router.push(`/partner/property/${item.referenceId}`)} style={{ padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.status !== "published" && <Badge label={item.status.replace(/_/g, " ")} tone={STATUS_TONE[item.status] ?? "neutral"} />}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.sand }}>
                <View style={{ width: `${(item[sort] / max) * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.brick }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {(
                  [
                    ["Views", item.views],
                    ["Viewers", item.uniqueViewers],
                    ["Leads", item.leads],
                    ["Visits", item.visits],
                    ["Saves", item.saves],
                  ] as const
                ).map(([label, n]) => (
                  <View key={label} style={{ alignItems: "center" }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{n}</Text>
                    <Small style={{ fontSize: 11 }}>{label}</Small>
                  </View>
                ))}
              </View>
            </PressableScale>
          )}
          ListEmptyComponent={<EmptyState icon="stats-chart-outline" title="Nothing yet">Numbers show here once your listings are live and being seen.</EmptyState>}
        />
      )}
    </View>
  );
}

function Segments<K extends string>({ items, value, onChange, subtle }: { items: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void; subtle?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", backgroundColor: subtle ? "transparent" : c.sand, borderRadius: radius.pill, padding: subtle ? 0 : 4, gap: subtle ? 8 : 0 }}>
      {items.map(([k, label]) => {
        const on = value === k;
        return (
          <PressableScale
            key={k}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tick();
              onChange(k);
            }}
            style={{
              flex: subtle ? undefined : 1,
              paddingHorizontal: subtle ? 12 : 0,
              height: subtle ? 32 : 36,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? (subtle ? c.ink : c.surface) : subtle ? c.surface : "transparent",
              borderWidth: subtle ? 1 : 0,
              borderColor: on ? c.ink : c.line,
            }}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? (subtle ? c.background : c.text) : c.muted }}>{subtle ? `By ${label.toLowerCase()}` : label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

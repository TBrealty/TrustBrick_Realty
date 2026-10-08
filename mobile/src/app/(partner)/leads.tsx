import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api, query } from "@/api/client";
import type { LeadRow, Page } from "@/api/types";
import { Badge, Body, Chip, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { leadTone } from "@/components/tones";
import { LEAD_STATUS_LABELS } from "@/lib/crm/terms";
import { relativeTime } from "@/lib/format";
import { fonts, useColors } from "@/theme";

const FILTERS = [
  ["open", "Open"],
  ["new", "New"],
  ["all", "All"],
] as const;

/** The agent's leads: open ones first, newest activity at the top. */
export default function Leads() {
  const c = useColors();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("open");
  const params = filter === "open" ? { open: true } : filter === "new" ? { status: "new" } : {};
  const leads = useInfiniteQuery({
    queryKey: ["partner-leads", filter],
    queryFn: ({ pageParam }) => api<Page<LeadRow>>(`/partner/leads${query({ ...params, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const rows = leads.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <Display size={32}>Leads</Display>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {FILTERS.map(([key, label]) => (
            <Chip key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} />
          ))}
        </View>
      </View>
      {leads.isPending ? (
        <Loading />
      ) : leads.isError ? (
        <ErrorState error={leads.error} onRetry={() => leads.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.referenceId}
          contentContainerStyle={{ padding: 16, gap: 2, flexGrow: 1 }}
          onEndReached={() => leads.hasNextPage && !leads.isFetchingNextPage && leads.fetchNextPage()}
          refreshControl={<RefreshControl refreshing={leads.isRefetching} onRefresh={() => leads.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <Link href={`/partner/lead/${item.referenceId}`} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ paddingVertical: 12, gap: 3, opacity: pressed ? 0.7 : 1, borderBottomWidth: 1, borderBottomColor: c.line })}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Body style={{ fontFamily: fonts.medium, flex: 1 }} numberOfLines={1}>
                    {item.contactName}
                  </Body>
                  <Badge label={LEAD_STATUS_LABELS[item.status]} tone={leadTone(item.status)} />
                </View>
                <Small numberOfLines={1}>{item.listingTitle ?? "General enquiry"}</Small>
                <Small style={{ fontSize: 12 }}>
                  {item.agentName ? `${item.agentName} · ` : ""}last activity {relativeTime(item.lastActivityAt)}
                </Small>
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title={filter === "new" ? "No new leads" : "No leads here"}>
              Enquiries about your listings arrive here and as notifications.
            </EmptyState>
          }
          ListFooterComponent={leads.isFetchingNextPage ? <Loading /> : null}
        />
      )}
    </Screen>
  );
}

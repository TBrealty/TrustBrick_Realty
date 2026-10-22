import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api, assetUrl, query } from "@/api/client";
import type { ConversationSummary, Page } from "@/api/types";
import { useSession } from "@/auth/session";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, Body, Chip, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

/** Guests' messages about the host's stays. */
export default function Inbox() {
  const c = useColors();
  const space = useTabBarSpace();
  const { workspace } = useSession();
  const [show, setShow] = useState<"all" | "unread">("all");
  const list = useQuery({
    queryKey: ["partner-inbox", workspace, show],
    queryFn: () => api<Page<ConversationSummary> & { unread: number }>(`/partner/conversations${query({ show })}`),
    refetchInterval: 30_000,
  });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <Display size={34}>Messages</Display>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="All" selected={show === "all"} onPress={() => setShow("all")} />
          <Chip label={list.data?.unread ? `Unread ${list.data.unread}` : "Unread"} selected={show === "unread"} onPress={() => setShow("unread")} />
        </View>
      </View>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data.rows}
          keyExtractor={(i) => i.referenceId}
          contentContainerStyle={{ padding: 16, gap: 4, flexGrow: 1, paddingBottom: space }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => (
            <Link href={`/partner/conversation/${item.referenceId}`} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
                <Image source={{ uri: assetUrl(item.listing.image) }} style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.sand }} contentFit="cover" />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Body style={{ fontFamily: item.unread ? fonts.semibold : fonts.medium, flex: 1 }} numberOfLines={1}>
                      {item.counterpartName} · {item.listing.title}
                    </Body>
                    {item.last && <Small>{relativeTime(item.last.at)}</Small>}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Small numberOfLines={1} style={{ flex: 1 }} tone={item.unread ? "text" : "muted"}>
                      {item.last ? `${item.last.mine ? "You: " : ""}${item.last.body}` : "No messages yet"}
                    </Small>
                    {item.unread > 0 && <Badge label={String(item.unread)} tone="danger" />}
                  </View>
                </View>
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <EmptyState icon="chatbubbles-outline" title={show === "unread" ? "Nothing unread" : "No messages yet"}>
              Guests can message you about a stay before they book.
            </EmptyState>
          }
        />
      )}
    </Screen>
  );
}

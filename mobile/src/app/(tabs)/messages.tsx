import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api, assetUrl } from "@/api/client";
import type { ConversationSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { SignedOut } from "@/components/signed-out";
import { Badge, Body, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

/** Conversations with stay hosts, newest first. */
export default function Messages() {
  const c = useColors();
  const { status, refreshMe } = useSession();
  const list = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ unread: number; items: ConversationSummary[] }>("/conversations"),
    enabled: status === "signedIn",
    refetchInterval: 30_000,
  });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Display size={32}>Messages</Display>
      </View>
      {status !== "signedIn" ? (
        <SignedOut icon="chatbubbles-outline" title="Talk to hosts">
          Sign in to message hosts about a stay and see their replies.
        </SignedOut>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data.items}
          keyExtractor={(i) => i.referenceId}
          contentContainerStyle={{ padding: 16, gap: 4, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => {
                void list.refetch();
                refreshMe();
              }}
              tintColor={c.brick}
            />
          }
          renderItem={({ item }) => (
            <Link href={`/conversation/${item.referenceId}`} asChild>
              <Pressable accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}>
                <Image source={{ uri: assetUrl(item.listing.image) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.sand }} contentFit="cover" />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Body style={{ fontFamily: item.unread ? fonts.semibold : fonts.medium, flex: 1 }} numberOfLines={1}>
                      {item.counterpartName} · {item.listing.title}
                    </Body>
                    {item.last && <Small>{relativeTime(item.last.at)}</Small>}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
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
            <EmptyState icon="chatbubbles-outline" title="No messages yet">
              On a stay you like, tap &quot;Message host&quot; to ask a question before booking.
            </EmptyState>
          }
        />
      )}
    </Screen>
  );
}

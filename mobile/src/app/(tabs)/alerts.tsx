import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import type { Notification } from "@/api/types";
import { useSession } from "@/auth/session";
import { SignedOut } from "@/components/signed-out";
import { Body, Button, Display, EmptyState, ErrorState, Loading, Screen, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { routeFor } from "@/links";
import { fonts, useColors } from "@/theme";

/** Notifications: the same ones the website shows, and the ones pushed to the phone. */
export default function Alerts() {
  const c = useColors();
  const queryClient = useQueryClient();
  const { status, refreshMe } = useSession();
  const list = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number; items: Notification[] }>("/notifications"), enabled: status === "signedIn" });
  const read = useMutation({
    mutationFn: (id?: string) => api("/notifications/read", { method: "POST", body: id ? { id } : {} }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      refreshMe();
    },
  });

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Display size={32}>Alerts</Display>
        {status === "signedIn" && (list.data?.unread ?? 0) > 0 && <Button label="Mark all read" variant="ghost" compact onPress={() => read.mutate(undefined)} />}
      </View>
      {status !== "signedIn" ? (
        <SignedOut icon="notifications-outline" title="Stay in the loop">
          Sign in to hear when a host replies, a booking is confirmed, or an agent gets back to you.
        </SignedOut>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={list.data.items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, gap: 2, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={c.brick} />}
          renderItem={({ item }) => {
            const route = routeFor(item.link);
            return (
              <Pressable
                accessibilityRole={route ? "link" : "text"}
                onPress={() => {
                  if (!item.read) read.mutate(item.id);
                  if (route) router.push(route);
                }}
                style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: item.read ? "transparent" : c.brick }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Body style={{ fontFamily: item.read ? fonts.body : fonts.semibold }}>{item.title}</Body>
                  {item.body ? <Small numberOfLines={2}>{item.body}</Small> : null}
                  <Small style={{ fontSize: 12 }}>{relativeTime(item.createdAt)}</Small>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="notifications-outline" title="Nothing yet">
              Replies from hosts and agents, booking updates and plan news show up here.
            </EmptyState>
          }
        />
      )}
    </Screen>
  );
}

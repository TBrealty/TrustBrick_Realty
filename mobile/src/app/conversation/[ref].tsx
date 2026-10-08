import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { Pressable } from "react-native";
import { api } from "@/api/client";
import type { ChatMessage, Conversation } from "@/api/types";
import { useSession } from "@/auth/session";
import { ChatView } from "@/components/chat";
import { ErrorState, Loading } from "@/components/ui";
import { useColors } from "@/theme";

type Draft = { existing: string } | { draft: Conversation };

/**
 * A guest's conversation with a stay's host. `new?listing=LST-…` starts one (or opens the
 * existing one).
 */
export default function ConversationScreen() {
  const { ref, listing } = useLocalSearchParams<{ ref: string; listing?: string }>();
  const c = useColors();
  const queryClient = useQueryClient();
  const { refreshMe } = useSession();
  const isNew = ref === "new";

  const start = useQuery({ queryKey: ["conversation-for", listing], queryFn: () => api<Draft>(`/listings/${listing}/conversation`), enabled: isNew && Boolean(listing) });
  const convo = useQuery({ queryKey: ["conversation", ref], queryFn: () => api<Conversation>(`/conversations/${ref}`), enabled: !isNew });

  useEffect(() => {
    if (start.data && "existing" in start.data) router.replace(`/conversation/${start.data.existing}`);
  }, [start.data]);
  // Opening it marks it read: refresh the unread counts.
  useEffect(() => {
    if (!convo.data) return;
    refreshMe();
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [convo.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useCallback(async (after: number) => (await api<{ messages: ChatMessage[] }>(`/conversations/${ref}/messages?after=${after}`)).messages, [ref]);
  const send = async (body: string) => {
    const sent = await api<{ referenceId: string; message: ChatMessage }>(isNew ? `/listings/${listing}/messages` : `/conversations/${ref}/messages`, { method: "POST", body: { body } });
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (isNew) {
      router.replace(`/conversation/${sent.referenceId}`);
      return null;
    }
    return sent.message;
  };

  if ((isNew ? start.isPending : convo.isPending) || (isNew && start.data && "existing" in start.data)) return <Loading />;
  if (isNew ? start.isError : convo.isError) return <ErrorState error={isNew ? start.error : convo.error} onRetry={() => (isNew ? start.refetch() : convo.refetch())} />;
  const view = isNew ? (start.data && "draft" in start.data ? start.data.draft : undefined) : convo.data;
  if (!view) return <Loading />;

  return (
    <>
      <Stack.Screen
        options={{
          title: view.counterpart.name,
          headerRight: () => (
            <Pressable accessibilityRole="link" accessibilityLabel="See the stay" hitSlop={10} onPress={() => router.push(`/listing/${view.listing.referenceId}`)}>
              <Ionicons name="home-outline" size={22} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <ChatView conversation={view} poll={isNew ? undefined : poll} send={send} emptyText={`Ask ${view.counterpart.name} anything about the stay before you book.`} />
    </>
  );
}

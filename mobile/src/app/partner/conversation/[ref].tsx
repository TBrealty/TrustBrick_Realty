import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect } from "react";
import { api } from "@/api/client";
import type { ChatMessage, Conversation } from "@/api/types";
import { ChatView } from "@/components/chat";
import { ErrorState, Loading } from "@/components/ui";

/** A host's conversation with a guest. */
export default function HostConversation() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const convo = useQuery({ queryKey: ["partner-conversation", ref], queryFn: () => api<Conversation>(`/partner/conversations/${ref}`) });
  useEffect(() => {
    if (!convo.data) return;
    void queryClient.invalidateQueries({ queryKey: ["partner-inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
  }, [convo.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useCallback(async (after: number) => (await api<{ messages: ChatMessage[] }>(`/partner/conversations/${ref}/messages?after=${after}`)).messages, [ref]);
  const send = async (body: string) => (await api<{ message: ChatMessage }>(`/partner/conversations/${ref}/messages`, { method: "POST", body: { body } })).message;

  if (convo.isPending) return <Loading />;
  if (convo.isError) return <ErrorState error={convo.error} onRetry={() => convo.refetch()} />;
  return (
    <>
      <Stack.Screen options={{ title: convo.data.counterpart.fullName || convo.data.counterpart.name }} />
      <ChatView conversation={convo.data} poll={poll} send={send} emptyText="No messages yet." />
    </>
  );
}

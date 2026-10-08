import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "@/api/client";
import type { ChatMessage, Conversation } from "@/api/types";
import { Body, Notice, Small } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

/**
 * A conversation between a guest and a host, for either side. New messages are checked every few
 * seconds while it's open (`poll`); `send` returns the sent message, or null when the screen
 * moves on (a guest's first message starts the conversation).
 */
export function ChatView({
  conversation,
  poll,
  send,
  emptyText,
}: {
  conversation: Conversation;
  poll?: (after: number) => Promise<ChatMessage[]>;
  send: (body: string) => Promise<ChatMessage | null>;
  emptyText: string;
}) {
  const c = useColors();
  const [later, setLater] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);

  const messages = useMemo(() => {
    const seen = new Set(conversation.messages.map((m) => m.seq));
    return [...conversation.messages, ...later.filter((m) => !seen.has(m.seq))];
  }, [conversation.messages, later]);
  const lastSeq = messages.at(-1)?.seq ?? 0;

  useEffect(() => {
    if (!poll) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await poll(lastSeq);
        if (fresh.length) setLater((m) => [...m, ...fresh.filter((x) => !m.some((y) => y.seq === x.seq))]);
      } catch {}
    }, 5000);
    return () => clearInterval(timer);
  }, [poll, lastSeq]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await send(body);
      setText("");
      if (sent) setLater((m) => [...m, sent]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90} style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.seq)}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1, justifyContent: messages.length ? "flex-end" : "center" }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={<Small style={{ textAlign: "center", marginBottom: 6 }}>About {conversation.listing.title}</Small>}
          ListEmptyComponent={
            <Body tone="muted" style={{ textAlign: "center" }}>
              {emptyText}
            </Body>
          }
          renderItem={({ item }) => (
            <View style={{ alignSelf: item.mine ? "flex-end" : "flex-start", maxWidth: "82%", gap: 3 }}>
              <View style={{ backgroundColor: item.mine ? c.ink : c.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, borderWidth: item.mine ? 0 : 1, borderColor: c.line }}>
                <Body style={{ color: item.mine ? c.background : c.text }}>{item.body}</Body>
              </View>
              <Small style={{ fontSize: 11, textAlign: item.mine ? "right" : "left" }}>
                {formatDateTime(item.createdAt)}
                {item.mine && conversation.seenUpTo >= item.seq ? " · Seen" : ""}
              </Small>
            </View>
          )}
        />
        {error && (
          <View style={{ paddingHorizontal: 16 }}>
            <Notice>{error}</Notice>
          </View>
        )}
        {conversation.canSend ? (
          <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.line, alignItems: "flex-end" }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a message"
              placeholderTextColor={c.faint}
              multiline
              accessibilityLabel="Message"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: fonts.body, fontSize: 15, color: c.text }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!text.trim() || sending}
              onPress={submit}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brick, alignItems: "center", justifyContent: "center", opacity: !text.trim() || sending ? 0.5 : 1 }}
            >
              <Ionicons name="arrow-up" size={22} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Small style={{ padding: 16, textAlign: "center" }}>{conversation.closedReason ?? "This conversation is closed."}</Small>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Switch, View } from "react-native";
import { ApiError, api } from "@/api/client";
import { useSession } from "@/auth/session";
import { Body, Button, Chip, Field, Notice, Scroll, Small, Title } from "@/components/ui";
import { useColors } from "@/theme";

const TIMES = [
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["evening", "Evening"],
] as const;

/** The next seven days, for a visit. */
function nextDays(): { value: string; label: string }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + (i + 1) * 86_400_000);
    return { value: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) };
  });
}

/** Contact the agent about a listing, optionally asking to visit. It becomes a lead for them. */
export default function Enquire() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const queryClient = useQueryClient();
  const { me } = useSession();
  const [name, setName] = useState(me?.user.name ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [wantsVisit, setWantsVisit] = useState(false);
  const [visitDate, setVisitDate] = useState<string | null>(null);
  const [visitTime, setVisitTime] = useState<string | null>(null);
  const days = nextDays();

  const send = useMutation({
    mutationFn: () => api<{ leadReferenceId: string }>(`/listings/${ref}/enquiries`, { method: "POST", body: { name, phone, message, wantsVisit, visitDate, visitTime } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["listing", ref] }),
  });
  const errors = send.error instanceof ApiError ? (send.error.fieldErrors ?? {}) : {};

  if (send.isSuccess) {
    return (
      <Scroll contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Title>Sent to the agent</Title>
        <Body tone="graphite">They&apos;ll call or message you on {phone}. {wantsVisit ? "They'll confirm the visit time with you." : ""}</Body>
        <Button label="Done" onPress={() => router.back()} />
      </Scroll>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Body tone="graphite">The agent gets your name and phone number and contacts you. Trustbrick never shares your email.</Body>
        {send.isError && !Object.keys(errors).length && <Notice>{(send.error as Error).message}</Notice>}
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+91 98765 43210" error={errors.phone} />
        <Field label="Message (optional)" value={message} onChangeText={setMessage} multiline style={{ minHeight: 90, textAlignVertical: "top" }} placeholder="Is it still available? Can I visit this weekend?" error={errors.message} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Title>I&apos;d like to visit</Title>
          <Switch value={wantsVisit} onValueChange={setWantsVisit} trackColor={{ true: c.brick, false: c.sand }} accessibilityLabel="I'd like to visit" />
        </View>
        {wantsVisit && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {days.map((d) => (
                <Chip key={d.value} label={d.label} selected={visitDate === d.value} onPress={() => setVisitDate(d.value)} />
              ))}
            </View>
            {errors.visitDate && <Small tone="brick">{errors.visitDate}</Small>}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {TIMES.map(([value, label]) => (
                <Chip key={value} label={label} selected={visitTime === value} onPress={() => setVisitTime(value)} />
              ))}
            </View>
            {errors.visitTime && <Small tone="brick">{errors.visitTime}</Small>}
          </View>
        )}
        <Button label="Send to the agent" variant="accent" loading={send.isPending} onPress={() => send.mutate()} />
      </Scroll>
    </KeyboardAvoidingView>
  );
}

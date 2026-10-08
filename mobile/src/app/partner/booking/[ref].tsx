import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { api } from "@/api/client";
import type { HostBookingDetail } from "@/api/types";
import { Badge, Body, Button, Card, Display, Divider, ErrorState, Eyebrow, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { confirm } from "@/confirm";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";
import { BOOKING_ACTIONS, type BookingAction } from "@/lib/stays/booking-lifecycle";
import { BOOKING_STATUS_TONES, nightsLabel, timeLabel } from "@/lib/stays/labels";

/** One booking, from the host's side: answer it, run the stay, and talk to the guest. */
export default function HostBookingScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const booking = useQuery({ queryKey: ["partner-booking", ref], queryFn: () => api<HostBookingDetail>(`/partner/bookings/${ref}`) });
  const [pending, setPending] = useState<BookingAction | null>(null);
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: (action: BookingAction) => api<HostBookingDetail>(`/partner/bookings/${ref}/actions`, { method: "POST", body: { action, reason } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["partner-booking", ref], data);
      void queryClient.invalidateQueries({ queryKey: ["partner-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
      setPending(null);
      setReason("");
    },
  });
  const message = useMutation({
    mutationFn: () => api<{ referenceId: string }>(`/partner/bookings/${ref}/conversation`, { method: "POST" }),
    onSuccess: (r) => router.push(`/partner/conversation/${r.referenceId}`),
  });

  if (booking.isPending) return <Loading />;
  if (booking.isError) return <ErrorState error={booking.error} onRetry={() => booking.refetch()} />;
  const b = booking.data;
  const hostActions = b.actions.filter((a) => BOOKING_ACTIONS[a].side === "host");

  const start = async (action: BookingAction) => {
    const def = BOOKING_ACTIONS[action];
    if ("reason" in def) {
      setPending(action);
      return;
    }
    if ("confirm" in def && !(await confirm(`${def.label}?`, def.confirm, def.label))) return;
    act.mutate(action);
  };
  const pendingDef = pending ? BOOKING_ACTIONS[pending] : null;

  return (
    <Scroll>
      <View style={{ gap: 6 }}>
        <Eyebrow>{b.referenceId}</Eyebrow>
        <Display size={28}>{b.guestName}</Display>
        <Small>{b.listing.title}</Small>
        <Badge label={b.statusLabel} tone={BOOKING_STATUS_TONES[b.status]} />
      </View>
      {b.status === "requested" && b.expiresAt && <Notice tone="warning">Answer by {formatDateTime(b.expiresAt)}, or the request expires.</Notice>}
      {b.statusReason && <Notice tone="info">{b.statusReason}</Notice>}

      <Card>
        <Title>
          {formatDay(b.checkIn)} – {formatDay(b.checkOut)}
        </Title>
        <Small>
          {nightsLabel(b.nights)} · arrives from {timeLabel(b.checkInTime)}, leaves by {timeLabel(b.checkOutTime)} · {b.adults} adult{b.adults === 1 ? "" : "s"}
          {b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}
          {b.pets ? ", a pet" : ""}
        </Small>
        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Title>To collect at the property</Title>
          <Title>{formatPrice(b.total, { compact: false })}</Title>
        </View>
        {b.guestMessage ? <Body tone="graphite">“{b.guestMessage}”</Body> : null}
      </Card>

      {hostActions.length > 0 && (
        <Card>
          {act.isError && <Notice>{(act.error as Error).message}</Notice>}
          {pending && pendingDef ? (
            <>
              <Title>{pendingDef.label}</Title>
              {"confirm" in pendingDef && <Small>{pendingDef.confirm}</Small>}
              <Field
                label={"reason" in pendingDef && pendingDef.reason === "required" ? "Reason" : "Note to the guest (optional)"}
                value={reason}
                onChangeText={setReason}
                multiline
                style={{ minHeight: 70, textAlignVertical: "top" }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label={pendingDef.label}
                  variant="danger"
                  compact
                  loading={act.isPending}
                  disabled={"reason" in pendingDef && pendingDef.reason === "required" && !reason.trim()}
                  onPress={() => act.mutate(pending)}
                />
                <Button label="Back" variant="ghost" compact onPress={() => setPending(null)} />
              </View>
            </>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {hostActions.map((a) => (
                <Button
                  key={a}
                  label={BOOKING_ACTIONS[a].label}
                  variant={a === "accept" || a === "check_in" || a === "complete" ? "accent" : a === "decline" || a === "host_cancel" ? "danger" : "secondary"}
                  compact
                  loading={act.isPending && act.variables === a}
                  onPress={() => start(a)}
                />
              ))}
            </View>
          )}
        </Card>
      )}

      <Card>
        <Title>The guest</Title>
        {b.guestContact ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button label="Call" icon="call-outline" compact onPress={() => Linking.openURL(`tel:${b.guestContact!.phone}`)} />
            <Button label="Email" icon="mail-outline" variant="secondary" compact onPress={() => Linking.openURL(`mailto:${b.guestContact!.email}`)} />
          </View>
        ) : (
          <Small>Their phone and email appear once you accept.</Small>
        )}
        <Button label="Message the guest" icon="chatbubble-outline" variant="secondary" compact loading={message.isPending} onPress={() => message.mutate()} />
      </Card>

      {b.events.length > 0 && (
        <Card>
          <Title>History</Title>
          {b.events.map((e, i) => (
            <View key={`${e.at}-${i}`}>
              <Body style={{ fontSize: 14 }}>
                {e.label}
                {e.note ? `: ${e.note}` : ""}
              </Body>
              <Small style={{ fontSize: 12 }}>{formatDateTime(e.at)}</Small>
            </View>
          ))}
        </Card>
      )}
    </Scroll>
  );
}

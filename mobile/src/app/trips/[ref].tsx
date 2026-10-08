import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Platform, View } from "react-native";
import { api } from "@/api/client";
import type { TripDetail } from "@/api/types";
import { Badge, Body, Button, Card, Divider, Display, ErrorState, Eyebrow, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { confirm } from "@/confirm";
import { formatDateTime, formatDay, formatPrice } from "@/lib/format";
import { BOOKING_STATUS_TONES, nightsLabel, timeLabel } from "@/lib/stays/labels";

/** One booking: dates, price, status, and, once confirmed, the address and the host's phone. */
export default function TripScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const trip = useQuery({ queryKey: ["trip", ref], queryFn: () => api<TripDetail>(`/trips/${ref}`) });
  const cancel = useMutation({
    mutationFn: () => api<TripDetail>(`/trips/${ref}/cancel`, { method: "POST", body: {} }),
    onSuccess: (data) => {
      queryClient.setQueryData(["trip", ref], data);
      void queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });

  if (trip.isPending) return <Loading />;
  if (trip.isError) return <ErrorState error={trip.error} onRetry={() => trip.refetch()} />;
  const t = trip.data;
  const address = t.address;
  const openMap = () => {
    if (!address) return;
    const label = encodeURIComponent(t.listing.title);
    const url = Platform.OS === "ios" ? `maps:0,0?q=${label}@${address.latitude},${address.longitude}` : `geo:0,0?q=${address.latitude},${address.longitude}(${label})`;
    void Linking.openURL(url);
  };

  return (
    <Scroll>
      <View style={{ gap: 6 }}>
        <Eyebrow>{t.referenceId}</Eyebrow>
        <Display size={28}>{t.listing.title}</Display>
        <Badge label={t.statusLabel} tone={BOOKING_STATUS_TONES[t.status]} />
      </View>
      {t.status === "requested" && t.expiresAt && <Notice tone="info">Waiting for the host. They have until {formatDateTime(t.expiresAt)} to accept.</Notice>}
      {t.statusReason && <Notice tone="warning">{t.statusReason}</Notice>}

      <Card>
        <Title>
          {formatDay(t.checkIn)} – {formatDay(t.checkOut)}
        </Title>
        <Small>
          {nightsLabel(t.nights)} · check-in from {timeLabel(t.checkInTime)}, check-out by {timeLabel(t.checkOutTime)} · {t.adults + t.children} guest{t.adults + t.children === 1 ? "" : "s"}
          {t.pets ? " and a pet" : ""}
        </Small>
        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Body>Stay</Body>
          <Body>{formatPrice(t.subtotal, { compact: false })}</Body>
        </View>
        {t.cleaningFee > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Body>Cleaning fee</Body>
            <Body>{formatPrice(t.cleaningFee, { compact: false })}</Body>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Title>Total, paid at the property</Title>
          <Title>{formatPrice(t.total, { compact: false })}</Title>
        </View>
      </Card>

      <Card>
        <Title>Where you&apos;re staying</Title>
        {address ? (
          <>
            <Body>{[address.unit, address.line1, address.line2, address.landmark, address.postalCode].filter(Boolean).join(", ")}</Body>
            <Button label="Open in maps" variant="secondary" compact icon="navigate-outline" onPress={openMap} />
            {t.hostPhone && <Button label={`Call ${t.hostName}`} variant="secondary" compact icon="call-outline" onPress={() => Linking.openURL(`tel:${t.hostPhone}`)} />}
          </>
        ) : (
          <Small>The exact address and the host&apos;s phone number appear here once the booking is confirmed.</Small>
        )}
      </Card>

      <Card>
        <Title>Cancellation: {t.cancellationPolicy.label}</Title>
        <Small>{t.cancellationPolicy.rule}</Small>
        {cancel.isError && <Notice>{(cancel.error as Error).message}</Notice>}
        {t.canCancel && (
          <Button
            label={t.status === "requested" ? "Withdraw the request" : "Cancel the booking"}
            variant="danger"
            loading={cancel.isPending}
            onPress={async () => {
              const ok = await confirm(
                t.status === "requested" ? "Withdraw your request?" : "Cancel this booking?",
                t.freeCancellation ? "It's free to cancel now." : "This is past the free cancellation time; the host's policy applies.",
                t.status === "requested" ? "Withdraw" : "Cancel booking",
              );
              if (ok) cancel.mutate();
            }}
          />
        )}
      </Card>

      <Button label="See the stay" variant="ghost" onPress={() => router.push(`/listing/${t.listing.referenceId}`)} />
    </Scroll>
  );
}

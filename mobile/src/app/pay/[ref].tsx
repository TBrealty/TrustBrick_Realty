import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { CheckoutStart, CheckoutStatus } from "@/api/types";
import { Body, Button, Card, Display, ErrorState, Loading, Notice, Scroll, Small } from "@/components/ui";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { openCheckout } from "@/payments/checkout";

const METHOD: Record<string, string> = { card: "card", upi: "UPI", netbanking: "net banking", wallet: "wallet" };

/**
 * After paying: booked, request sent (held, not charged), failed (try again while the dates are
 * held), or still confirming, which asks the server again every two seconds.
 */
export default function PaymentResultScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const [startedAt] = useState(() => Date.now());
  const status = useQuery({
    queryKey: ["payment", ref],
    queryFn: () => api<CheckoutStatus>(`/payments/${ref}`),
    refetchInterval: (q) => (q.state.data?.state === "confirming" && Date.now() - startedAt < 120_000 ? 2000 : false),
  });
  const retry = useMutation({
    mutationFn: async () => {
      const start = await api<CheckoutStart>(`/trips/${status.data!.bookingReferenceId}/checkout`, { method: "POST" });
      await openCheckout(start);
      return start;
    },
    onSuccess: (s) => router.replace(`/pay/${s.paymentReferenceId}` as Href),
  });

  if (status.isPending) return <Loading />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => status.refetch()} />;
  const s = status.data;
  const dates = `${formatDay(s.checkIn)} – ${formatDay(s.checkOut)}`;
  const method = s.method ? (METHOD[s.method] ?? s.method) : null;
  const view = {
    booked: { title: "You're booked!", tone: "success" as const, lines: [`${s.title}, ${dates}.`, `You paid ${formatMoney(s.amount)}${method ? ` by ${method}` : ""}. The address and the host's phone number are on your trip.`] },
    requested: {
      title: "Request sent",
      tone: "info" as const,
      lines: [
        `${s.hostName} has until ${s.requestExpiresAt ? formatDateTime(s.requestExpiresAt) : "tomorrow"} to accept ${dates}.`,
        `${formatMoney(s.amount)} is on hold, not charged. It's taken only if they accept, and released in full if they don't.`,
      ],
    },
    failed: {
      title: "Payment didn't go through",
      tone: "warning" as const,
      lines: [s.failureReason ?? "The payment wasn't completed.", `You haven't been charged.${s.holdExpiresAt ? ` Your dates are held until ${formatDateTime(s.holdExpiresAt)}.` : ""}`],
    },
    expired: { title: "Booking not completed", tone: "warning" as const, lines: ["The time to pay ran out, or the dates were taken. If money left your account, it's returned in full in 5–7 working days."] },
    confirming: {
      title: "Confirming your payment…",
      tone: "info" as const,
      lines: [status.dataUpdatedAt - startedAt > 120_000 ? "This is taking longer than usual. We'll let you know as soon as your bank confirms; you won't be charged twice." : "This usually takes a few seconds. Please don't pay again."],
    },
  }[s.state];

  return (
    <Scroll>
      <Stack.Screen options={{ title: "Payment", headerBackVisible: false }} />
      <Card>
        <Display size={28}>{view.title}</Display>
        {view.lines.map((l) => (
          <Body key={l}>{l}</Body>
        ))}
        <Small>
          Booking {s.bookingReferenceId} · Payment {s.paymentReferenceId}
        </Small>
      </Card>
      {retry.isError && <Notice>{(retry.error as Error).message}</Notice>}
      <View style={{ gap: 10 }}>
        {s.state === "failed" && <Button label={`Try again · ${formatMoney(s.amount)}`} variant="accent" loading={retry.isPending} onPress={() => retry.mutate()} />}
        {s.state === "expired" ? (
          <Button label="Back to the stay" onPress={() => router.replace(`/listing/${s.listingReferenceId}`)} />
        ) : (
          <Button label="View your trip" variant={s.state === "failed" ? "secondary" : "accent"} onPress={() => router.replace(`/trips/${s.bookingReferenceId}`)} />
        )}
      </View>
    </Scroll>
  );
}

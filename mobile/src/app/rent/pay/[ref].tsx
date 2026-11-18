import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import { METHOD, type RentCheckoutStart, type RentPaymentStatus } from "@/api/rent-types";
import { Body, Button, Card, Display, ErrorState, Loading, Notice, Scroll, Small } from "@/components/ui";
import { formatDay, formatMoney } from "@/lib/format";
import { openCheckout } from "@/payments/checkout";

/** After paying rent: paid, didn't go through (try again), returned (paid twice), or still confirming (asks every two seconds). */
export default function RentPaymentScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const [startedAt] = useState(() => Date.now());
  const status = useQuery({
    queryKey: ["rent-payment", ref],
    queryFn: () => api<RentPaymentStatus>(`/rent/payments/${ref}`),
    refetchInterval: (q) => (q.state.data?.state === "confirming" && Date.now() - startedAt < 120_000 ? 2000 : false),
  });
  const state = status.data?.state;
  useEffect(() => {
    if (state && state !== "confirming") void queryClient.invalidateQueries({ queryKey: ["rent"] });
  }, [state, queryClient]);
  const retry = useMutation({
    mutationFn: async () => {
      const start = await api<RentCheckoutStart>(`/rent/charges/${status.data!.chargeReferenceId}/pay`, { method: "POST" });
      await openCheckout(start);
      return start;
    },
    onSuccess: (s) => router.replace(`/rent/pay/${s.paymentReferenceId}` as Href),
  });

  if (status.isPending) return <Loading />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => status.refetch()} />;
  const s = status.data;
  const method = s.method ? (METHOD[s.method] ?? s.method) : null;
  const view = {
    paid: { title: "Rent paid", lines: [`${formatMoney(s.amount)} for ${s.title}, due ${formatDay(s.dueDate)}${method ? `, paid by ${method}` : ""}.`, `Trustbrick pays it to ${s.landlordName}. Your receipt is ready.`] },
    failed: { title: "Payment didn't go through", lines: [s.failureReason ?? "The payment wasn't completed.", "You haven't been charged. You can try again."] },
    returned: { title: "This payment is being returned", lines: ["This month's rent was already paid, so this payment goes back to you in full, usually within 5–7 working days."] },
    confirming: {
      title: "Confirming your payment…",
      lines: [status.dataUpdatedAt - startedAt > 120_000 ? "This is taking longer than usual. We'll let you know as soon as your bank confirms; you won't be charged twice." : "This usually takes a few seconds. Please don't pay again."],
    },
  }[s.state];

  return (
    <Scroll>
      <Stack.Screen options={{ title: "Rent payment", headerBackVisible: false }} />
      <Card>
        <Display size={28}>{view.title}</Display>
        {view.lines.map((l) => (
          <Body key={l}>{l}</Body>
        ))}
        <Small>Payment {s.paymentReferenceId}</Small>
      </Card>
      {retry.isError && <Notice>{(retry.error as Error).message}</Notice>}
      <View style={{ gap: 10 }}>
        {s.state === "failed" && <Button label={`Try again · ${formatMoney(s.amount)}`} variant="accent" loading={retry.isPending} onPress={() => retry.mutate()} />}
        {s.state === "paid" && <Button label="View your receipt" variant="accent" onPress={() => router.replace(`/rent/receipt/${s.paymentReferenceId}` as Href)} />}
        <Button label="Back to your rent" variant="secondary" onPress={() => router.replace("/rent" as Href)} />
      </View>
    </Scroll>
  );
}

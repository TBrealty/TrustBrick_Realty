import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Stack, router } from "expo-router";
import { RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import { type Charge, METHOD, type RentCheckoutStart, type TenantRent, ordinal } from "@/api/rent-types";
import { Badge, Body, Button, Card, Divider, EmptyState, ErrorState, Eyebrow, Fact, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDay, formatMoney } from "@/lib/format";
import { openCheckout } from "@/payments/checkout";
import { useColors } from "@/theme";

/**
 * A tenant's rent: each tenancy, what's due (Pay, no fee) and what's been paid (receipts). Rent
 * shows here a week before it's due; reminders come before, on the day, and when it's late.
 */
export default function RentScreen() {
  const c = useColors();
  const rent = useQuery({ queryKey: ["rent"], queryFn: () => api<TenantRent>("/rent") });
  const pay = useMutation({
    mutationFn: async (charge: Charge) => {
      const start = await api<RentCheckoutStart>(`/rent/charges/${charge.referenceId}/pay`, { method: "POST" });
      await openCheckout(start);
      return start;
    },
    onSuccess: (s) => router.push(`/rent/pay/${s.paymentReferenceId}` as Href),
  });

  if (rent.isPending) return <Loading />;
  if (rent.isError) return <ErrorState error={rent.error} onRetry={() => rent.refetch()} />;
  const { online, tenancies } = rent.data;

  return (
    <Scroll refreshControl={<RefreshControl refreshing={rent.isRefetching} onRefresh={() => rent.refetch()} tintColor={c.brick} />}>
      <Stack.Screen options={{ title: "Rent" }} />
      {tenancies.length === 0 && (
        <EmptyState icon="home-outline" title="No tenancies yet">
          When your agent sets up your tenancy on Trustbrick, you&apos;ll get a link to accept it, and your rent shows here.
        </EmptyState>
      )}
      {pay.isError && <Notice>{(pay.error as Error).message}</Notice>}
      {tenancies.map((t) => {
        const due = t.charges.filter((ch) => ch.status === "due");
        const paid = t.charges.filter((ch) => ch.status === "paid");
        return (
          <View key={t.referenceId} style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Eyebrow>{t.referenceId}</Eyebrow>
              <Title>{t.title}</Title>
              <Small>{t.address}</Small>
              <Badge label={t.statusLabel} tone={t.status === "active" ? "success" : t.status === "ended" ? "neutral" : "warning"} />
            </View>
            <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
              <Fact label="Monthly rent" value={formatMoney(t.monthlyRent)} />
              <Fact label="Due on" value={`The ${ordinal(t.dueDay)}`} />
              <Fact label="Landlord" value={t.landlordName} />
              <Fact label="Deposit" value={t.deposit ? formatMoney(t.deposit) : "None"} />
            </Card>
            {(t.status === "pending" || t.status === "disputed") && (
              <Notice tone="info">{t.landlordConfirmed ? "" : `Waiting for ${t.landlordName} to confirm the terms. `}You can pay here once the tenancy starts.</Notice>
            )}
            {t.status === "active" && !online && <Notice tone="info">Paying rent in the app isn&apos;t open yet. Pay your landlord as you do now; we&apos;ll tell you when you can pay here.</Notice>}
            {due.map((ch) => (
              <Card key={ch.referenceId} style={{ borderColor: ch.overdue ? c.brick : c.line }}>
                <Title>
                  {formatMoney(ch.amount)} {ch.overdue ? "overdue" : "due"} {formatDay(ch.dueDate)}
                </Title>
                <Small>UPI, debit card or net banking. No fee.</Small>
                {online && <Button label={`Pay ${formatMoney(ch.amount)}`} variant="accent" loading={pay.isPending && pay.variables?.referenceId === ch.referenceId} onPress={() => pay.mutate(ch)} />}
              </Card>
            ))}
            {t.status === "active" && online && due.length === 0 && <Small>Nothing to pay right now. Each month&apos;s rent shows here a week before it&apos;s due.</Small>}
            {paid.length > 0 && (
              <Card style={{ paddingVertical: 6, gap: 0 }}>
                {paid.map((ch, i) => (
                  <View key={ch.referenceId}>
                    {i > 0 && <Divider />}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Body>
                          {formatMoney(ch.amount)} · due {formatDay(ch.dueDate)}
                        </Body>
                        <Small>Paid{ch.payment?.method ? ` by ${METHOD[ch.payment.method] ?? ch.payment.method}` : ""}</Small>
                      </View>
                      {ch.payment && <Button label="Receipt" compact variant="secondary" onPress={() => router.push(`/rent/receipt/${ch.payment!.referenceId}` as Href)} />}
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>
        );
      })}
    </Scroll>
  );
}

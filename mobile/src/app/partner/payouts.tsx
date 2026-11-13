import { useQuery } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { Pressable, View } from "react-native";
import { api } from "@/api/client";
import type { HostPayouts, PayoutStatus } from "@/api/types";
import { Badge, Body, Card, ErrorState, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDateTime, formatDay, formatMoney, formatPrice } from "@/lib/format";

const STATUS: Record<PayoutStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  processing: { label: "On its way", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "None", tone: "neutral" },
};

/** A host's payouts for stays paid online. The bank account is added on the website. */
export default function PayoutsScreen() {
  const q = useQuery({ queryKey: ["partner-payouts"], queryFn: () => api<HostPayouts>("/partner/payouts") });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  const a = p.account;
  return (
    <Scroll>
      <Stack.Screen options={{ title: "Payouts" }} />
      {p.online && a?.status !== "active" && (
        <Notice tone="warning">
          Guests can&apos;t book your stays yet: {a ? "your payout account isn't verified" : "add the bank account you're paid into"}
          {p.canManageAccount ? " on the Trustbrick website, under Payouts." : ". Ask your organization's admin."}
        </Notice>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[
          ["This month", p.totals.receivedThisMonth],
          ["Coming up", p.totals.upcoming],
          ["On hold", p.totals.onHold],
        ].map(([label, value]) => (
          <Card key={String(label)} style={{ flex: 1 }}>
            <Small>{label}</Small>
            <Title>{formatPrice(Number(value), { compact: false })}</Title>
          </Card>
        ))}
      </View>
      <Card>
        <Title>Payout account</Title>
        {a ? (
          <>
            <Body>{a.method === "bank" ? `${a.bankName} ····${a.accountLast4}` : `UPI ${a.upiMasked}`}</Body>
            <Small>
              {a.status === "active" ? "Verified" : a.status === "pending" ? "Being verified" : (a.statusReason ?? "Needs attention")}
              {a.verifiedAt ? ` · ${formatDay(a.verifiedAt)}` : ""}
            </Small>
          </>
        ) : (
          <Small>None yet. It&apos;s added on the website, where the bank details go straight to our payment partner.</Small>
        )}
      </Card>
      {p.rows.length === 0 ? (
        <Small>Bookings paid online appear here once they&apos;re confirmed.</Small>
      ) : (
        p.rows.map((r) => (
          <Pressable key={r.referenceId} accessibilityRole="link" onPress={() => router.push(`/partner/booking/${r.booking.referenceId}`)}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Title style={{ flex: 1 }}>{r.booking.guestName}</Title>
                <Title>{formatMoney(r.amount)}</Title>
              </View>
              <Small>
                {formatDay(r.booking.checkIn)} – {formatDay(r.booking.checkOut)} · {r.booking.title}
              </Small>
              <Small>
                Guest paid {formatMoney(r.paid)}
                {r.refunded > 0 ? `, ${formatMoney(r.refunded)} refunded` : ""} · commission and GST {formatMoney(r.commission + r.gst)}
              </Small>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
                <Small>
                  {r.status === "paid" && r.paidAt ? `${formatDateTime(r.paidAt)}${r.utr ? ` · UTR ${r.utr}` : ""}` : r.status === "on_hold" ? (r.holdReason ?? "") : r.status === "cancelled" ? "Guest refunded in full" : `On ${formatDateTime(r.releaseAt)}`}
                </Small>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Scroll>
  );
}

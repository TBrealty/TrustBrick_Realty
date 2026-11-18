import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import type { RentTotals, Settlement } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { Badge, Body, Card, EmptyState, ErrorState, Loading, Scroll, Small, Title } from "@/components/ui";
import { formatDay, formatMoney } from "@/lib/format";
import { useColors } from "@/theme";

const TONE = { on_hold: "warning", ready: "info", paid: "success", failed: "danger", cancelled: "neutral" } as const;

/** Every rent paid and when it reached the landlord's bank, with the bank's reference. */
export default function RentReceivedScreen() {
  const c = useColors();
  const { workspace } = useSession();
  const data = useQuery({ queryKey: ["landlord-settlements", workspace], queryFn: () => api<{ rows: Settlement[]; totals: RentTotals }>("/partner/landlord/settlements") });
  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const { rows, totals } = data.data;
  return (
    <Scroll refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}>
      <Stack.Screen options={{ title: "Rent received" }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          ["Paid in", totals.paidOut],
          ["On its way", totals.waiting],
          ["Waiting on you", totals.onHold],
        ].map(([label, value]) => (
          <Card key={label} style={{ flex: 1, padding: 12, gap: 2 }}>
            <Title>{formatMoney(value as number)}</Title>
            <Small>{label}</Small>
          </Card>
        ))}
      </View>
      {rows.length === 0 ? (
        <EmptyState icon="cash-outline" title="No rent yet">
          When a tenant pays, it shows here.
        </EmptyState>
      ) : (
        rows.map((s) => (
          <Card key={s.referenceId}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Title style={{ flex: 1 }}>{formatMoney(s.amount)}</Title>
              <Badge label={s.status === "paid" && s.paidAt ? `Paid ${formatDay(s.paidAt)}` : s.statusLabel} tone={TONE[s.status]} />
            </View>
            <Body tone="graphite">
              {s.title} · {s.tenantName} · rent due {formatDay(s.rentDue)}
            </Body>
            {s.status === "paid" && s.utr && <Small>UTR {s.utr}{s.paidTo ? ` · ${s.paidTo}` : ""}</Small>}
            {s.status !== "paid" && s.holdReason && <Small>{s.holdReason}</Small>}
            {s.status === "ready" && s.dueBy && <Small>By {formatDay(s.dueBy)}</Small>}
          </Card>
        ))
      )}
    </Scroll>
  );
}

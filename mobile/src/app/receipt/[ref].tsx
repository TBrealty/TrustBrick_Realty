import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { api } from "@/api/client";
import type { Receipt } from "@/api/types";
import { Body, Card, Display, Divider, ErrorState, Eyebrow, Loading, Scroll, Small, Title } from "@/components/ui";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { nightsLabel } from "@/lib/stays/labels";

const Line = ({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
    {bold ? <Title style={{ flex: 1 }}>{label}</Title> : <Body style={{ flex: 1 }}>{label}</Body>}
    {bold ? <Title>{formatMoney(amount)}</Title> : <Body>{formatMoney(amount)}</Body>}
  </View>
);

/** The receipt for a stay paid online. The website's receipt prints to PDF. */
export default function ReceiptScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const receipt = useQuery({ queryKey: ["receipt", ref], queryFn: () => api<Receipt>(`/trips/${ref}/receipt`) });
  if (receipt.isPending) return <Loading />;
  if (receipt.isError) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  const r = receipt.data;
  return (
    <Scroll>
      <Stack.Screen options={{ title: "Receipt" }} />
      <View style={{ gap: 4 }}>
        <Eyebrow>{r.receiptNumber}</Eyebrow>
        <Display size={26}>{r.stay.title}</Display>
        <Small>
          {formatDay(r.booking.checkIn)} – {formatDay(r.booking.checkOut)} · {nightsLabel(r.booking.nights)} · {r.booking.guests} guest{r.booking.guests === 1 ? "" : "s"}
        </Small>
      </View>
      <Card>
        {r.lines.map((l) => (
          <Line key={l.label} label={l.label} amount={l.amount} />
        ))}
        <Line label="Trustbrick service fee" amount={0} />
        <Divider />
        <Line label="Total paid" amount={r.total} bold />
        {r.refunds.map((x) => (
          <Line key={x.referenceId} label={`Refund, ${formatDay(x.at)}`} amount={-x.amount} />
        ))}
        {r.refunds.length > 0 && <Line label="Paid after refunds" amount={r.netPaid} bold />}
      </Card>
      <Card>
        <Small>Guest: {r.guest.name}</Small>
        <Small>Host: {r.stay.hostName}</Small>
        <Small>{r.stay.address}</Small>
        <Small>
          Paid {r.payment.method ? `by ${r.payment.method === "upi" ? "UPI" : r.payment.method} ` : ""}on {formatDateTime(r.payment.paidAt)} · Payment {r.payment.referenceId}
        </Small>
        <Small>Collected by Trustbrick on behalf of the host. A receipt for your payment, not a tax invoice.</Small>
      </Card>
    </Scroll>
  );
}

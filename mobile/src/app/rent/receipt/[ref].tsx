import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Linking, View } from "react-native";
import { api } from "@/api/client";
import { METHOD, type RentReceipt } from "@/api/rent-types";
import { Body, Button, Card, Display, Divider, ErrorState, Eyebrow, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { API_ORIGIN } from "@/config";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";

/** A rent receipt, with the landlord's PAN for an HRA claim. The website's version prints to PDF. */
export default function RentReceiptScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const receipt = useQuery({ queryKey: ["rent-receipt", ref], queryFn: () => api<RentReceipt>(`/rent/receipts/${ref}`) });
  if (receipt.isPending) return <Loading />;
  if (receipt.isError) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  const r = receipt.data;
  return (
    <Scroll>
      <Stack.Screen options={{ title: "Rent receipt" }} />
      <View style={{ gap: 4 }}>
        <Eyebrow>{r.paymentReferenceId}</Eyebrow>
        <Display size={26}>Rent for {r.periodLabel}</Display>
        <Small>{formatDateTime(r.paidAt)}</Small>
      </View>
      <Card>
        <Body>
          Received from {r.tenantName} the sum of {formatMoney(r.amount)} as rent for {r.periodLabel} for {r.propertyAddress}, on behalf of the landlord, {r.landlordName}.
        </Body>
        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Title>Paid{r.method ? ` by ${METHOD[r.method] ?? r.method}` : ""}</Title>
          <Title>{formatMoney(r.amount)}</Title>
        </View>
      </Card>
      <Card>
        <Small>Tenant: {r.tenantName}</Small>
        <Small>
          Landlord: {r.landlordName} · PAN {r.landlordPan ?? "not given"}
        </Small>
        <Small>
          {r.propertyTitle}, {r.propertyAddress}
        </Small>
        <Small>
          Rent due {formatDay(r.dueDate)} · Tenancy {r.tenancyReferenceId}
        </Small>
        <Small>Keep this receipt for an HRA claim; the landlord&apos;s PAN is needed once the year&apos;s rent is more than ₹1,00,000.</Small>
      </Card>
      {r.refunded && <Notice tone="info">This payment was later refunded to you in full.</Notice>}
      <Button label="Open on the website to save as PDF" variant="secondary" icon="download-outline" onPress={() => Linking.openURL(`${API_ORIGIN}/account/rent/receipts/${r.paymentReferenceId}`)} />
    </Scroll>
  );
}

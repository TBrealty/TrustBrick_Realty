import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { LandlordHome } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { Badge, Body, Button, Card, Chip, ErrorState, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/** Where the landlord's rent is paid (a bank account or UPI ID in their own name), and their PAN for receipts. */
export default function LandlordBankScreen() {
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const home = useQuery({ queryKey: ["landlord", workspace], queryFn: () => api<LandlordHome>("/partner/landlord") });
  const [method, setMethod] = useState<"bank" | "upi">("bank");
  const [holderName, setHolder] = useState<string | null>(null);
  const [accountNumber, setAccount] = useState("");
  const [confirmAccountNumber, setConfirm] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [vpa, setVpa] = useState("");
  const [pan, setPan] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["landlord"] });
  };
  const saveBank = useMutation({
    mutationFn: () => api("/partner/landlord/bank", { method: "PUT", body: { method, holderName: holderName ?? home.data?.name ?? "", accountNumber, confirmAccountNumber, ifsc, vpa } }),
    onSuccess: () => {
      setAccount("");
      setConfirm("");
      setIfsc("");
      setVpa("");
      refresh();
    },
  });
  const savePan = useMutation({
    mutationFn: () => api("/partner/landlord/pan", { method: "PUT", body: { pan } }),
    onSuccess: () => {
      setPan("");
      refresh();
    },
  });

  if (home.isPending) return <Loading />;
  if (home.isError) return <ErrorState error={home.error} onRetry={() => home.refetch()} />;
  const b = home.data.bank;
  const errors = saveBank.error instanceof ApiError ? (saveBank.error.fieldErrors ?? {}) : {};

  return (
    <Scroll>
      <Stack.Screen options={{ title: "Bank account" }} />
      <Body tone="graphite">Trustbrick pays your rent into this account, usually the working day after your tenant pays.</Body>
      {b && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Title style={{ flex: 1 }}>{b.method === "bank" ? `${b.bankName ?? "Bank account"} ending ${b.accountLast4}` : `UPI ${b.upiMasked}`}</Title>
            <Badge label={b.status === "verified" ? "Verified" : b.status === "failed" ? "Failed" : "Being checked"} tone={b.status === "verified" ? "success" : b.status === "failed" ? "danger" : "warning"} />
          </View>
          <Small>
            In the name of {b.holderName}
            {b.ifsc ? ` · IFSC ${b.ifsc}` : ""}
          </Small>
          {b.statusReason && <Small>{b.statusReason}</Small>}
          {b.holdUntil && <Notice tone="warning">Changed recently: for your safety, rent waits until {formatDateTime(b.holdUntil)} before it&apos;s paid into it.</Notice>}
        </Card>
      )}

      <Card>
        <Title>{b ? "Change account" : "Add your account"}</Title>
        {b && <Small>Rent waits 48 hours before it&apos;s paid into a changed account, and we email you.</Small>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Bank account" selected={method === "bank"} onPress={() => setMethod("bank")} />
          <Chip label="UPI ID" selected={method === "upi"} onPress={() => setMethod("upi")} />
        </View>
        <Field label="Name on the account" value={holderName ?? home.data.name} onChangeText={setHolder} hint="It must be your own name." error={errors.holderName} />
        {method === "bank" ? (
          <>
            <Field label="Account number" value={accountNumber} onChangeText={setAccount} keyboardType="number-pad" error={errors.accountNumber} />
            <Field label="Account number again" value={confirmAccountNumber} onChangeText={setConfirm} keyboardType="number-pad" error={errors.confirmAccountNumber} />
            <Field label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="HDFC0001234" error={errors.ifsc} />
          </>
        ) : (
          <Field label="UPI ID" value={vpa} onChangeText={setVpa} autoCapitalize="none" keyboardType="email-address" placeholder="name@bank" error={errors.vpa} />
        )}
        {saveBank.isError && !Object.keys(errors).length && <Notice>{(saveBank.error as Error).message}</Notice>}
        {saveBank.isSuccess && <Notice tone="success">Saved.</Notice>}
        <Button label={b ? "Change account" : "Save account"} variant="accent" loading={saveBank.isPending} onPress={() => saveBank.mutate()} />
      </Card>

      <Card>
        <Title>Your PAN</Title>
        <Small>Shown on your tenants&apos; rent receipts: they need it to claim HRA once the year&apos;s rent is over ₹1 lakh. Kept encrypted.</Small>
        {home.data.panMasked && <Body>On file: {home.data.panMasked}</Body>}
        <Field label={home.data.panMasked ? "Change your PAN" : "PAN"} value={pan} onChangeText={(v) => setPan(v.toUpperCase())} autoCapitalize="characters" maxLength={10} placeholder="ABCDE1234F" />
        {savePan.isError && <Notice>{(savePan.error as Error).message}</Notice>}
        <Button label="Save PAN" variant="secondary" loading={savePan.isPending} disabled={pan.length !== 10} onPress={() => savePan.mutate()} />
      </Card>
    </Scroll>
  );
}

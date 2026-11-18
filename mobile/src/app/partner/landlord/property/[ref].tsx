import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import { LINK_TONE, type LandlordPropertyDetail, ordinal } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { Badge, Body, Button, Card, Chip, Divider, Display, ErrorState, Eyebrow, Fact, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { uploadProof } from "@/rent/upload";
import { useColors } from "@/theme";

const PROOFS = [
  ["property_tax_receipt", "Property tax receipt"],
  ["sale_deed", "Sale deed"],
  ["allotment_letter", "Allotment letter"],
  ["electricity_bill", "Electricity bill"],
  ["other", "Other"],
] as const;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** One of the landlord's properties: proof of ownership (upload from the phone), the tenancy (confirm, dispute, end) and its rent. */
export default function LandlordPropertyScreen() {
  const c = useColors();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["landlord-property", workspace, ref], queryFn: () => api<LandlordPropertyDetail>(`/partner/landlord/properties/${ref}`) });
  const [kind, setKind] = useState<string>("property_tax_receipt");
  const [panel, setPanel] = useState<"dispute" | "end" | null>(null);
  const [note, setNote] = useState("");
  const [endDate, setEndDate] = useState(today());
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["landlord-property"] });
    void queryClient.invalidateQueries({ queryKey: ["landlord"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
  };
  const upload = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return false;
      const f = picked.assets[0];
      if (f.size && f.size > 10 * 1024 * 1024) throw new Error("That file is larger than 10 MB.");
      await uploadProof(ref, kind, { uri: f.uri, name: f.name, mime: f.mimeType ?? "application/pdf" });
      return true;
    },
    onSuccess: (done) => done && refresh(),
  });
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/partner/tenancies/${data.data!.tenancy!.referenceId}`, { method: "POST", body }),
    onSuccess: () => {
      setPanel(null);
      setNote("");
      refresh();
    },
  });

  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const { property: p, tenancy: t, charges, settlements } = data.data;

  return (
    <Scroll refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}>
      <Stack.Screen options={{ title: "Property" }} />
      <View style={{ gap: 4 }}>
        <Eyebrow>{p.propertyReferenceId}</Eyebrow>
        <Display size={26}>{p.title}</Display>
        <Small>{p.address}</Small>
        <Badge label={p.statusLabel} tone={LINK_TONE[p.status]} />
      </View>

      <Card>
        <Title>Proof of ownership</Title>
        <Small>Trustbrick checks that you own the property before paying its rent to you.</Small>
        {p.proof && (
          <Body tone="graphite">
            {p.proof.label}
            {p.proof.filename ? ` (${p.proof.filename})` : ""}, uploaded {formatDateTime(p.proof.uploadedAt)}.
          </Body>
        )}
        {p.status === "approved" ? (
          <Notice tone="success">Approved. Nothing more to do here.</Notice>
        ) : (
          <>
            {p.status === "under_review" && <Notice tone="info">Being checked. You&apos;ll be told when it&apos;s done, usually within two working days.</Notice>}
            {p.status === "rejected" && <Notice>Not accepted{p.reviewNote ? `: ${p.reviewNote}` : "."} Please upload another document.</Notice>}
            <Small>What is it?</Small>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PROOFS.map(([k, label]) => (
                <Chip key={k} label={label} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Small>A PDF or a clear photo, up to 10 MB, showing your name and this property. Only you and Trustbrick&apos;s checkers see it.</Small>
            {upload.isError && <Notice>{(upload.error as Error).message}</Notice>}
            <Button label={p.proof ? "Upload a different document" : "Upload proof"} icon="cloud-upload-outline" variant={p.proof ? "secondary" : "accent"} loading={upload.isPending} onPress={() => upload.mutate()} />
          </>
        )}
      </Card>

      <Card>
        <Title>Tenancy</Title>
        {!t ? (
          <Small>No tenancy yet. Your agent sets it up when the property is let, and you confirm the terms here.</Small>
        ) : (
          <>
            <Body>
              {t.tenantName} · {t.statusLabel}
            </Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              <Fact label="Monthly rent" value={formatMoney(t.monthlyRent)} />
              <Fact label="Due on" value={`The ${ordinal(t.dueDay)}`} />
              <Fact label="Deposit" value={t.deposit ? formatMoney(t.deposit) : "None"} />
              <Fact label="From" value={`${formatDay(t.startDate)}${t.endDate ? ` to ${formatDay(t.endDate)}` : ""}`} />
              <Fact label="First rent online" value={t.firstDueDate ? formatDay(t.firstDueDate) : null} />
            </View>
            {act.isError && <Notice>{(act.error as Error).message}</Notice>}
            {t.status === "pending" && !t.landlordConfirmed && panel === null && (
              <View style={{ gap: 8 }}>
                <Button label="These terms are right" variant="accent" loading={act.isPending} onPress={() => act.mutate({ action: "confirm" })} />
                <Button label="Something's wrong" variant="secondary" onPress={() => setPanel("dispute")} />
              </View>
            )}
            {t.status === "disputed" && <Notice tone="info">You said: “{t.disputeNote}”. Waiting for the agent to correct it.</Notice>}
            {panel === "dispute" && (
              <View style={{ gap: 8 }}>
                <Field label="What should the terms be?" value={note} onChangeText={setNote} multiline hint="Your agent corrects them and asks you again." />
                <Button label="Send to the agent" variant="accent" loading={act.isPending} disabled={note.trim().length < 10} onPress={() => act.mutate({ action: "dispute", note })} />
                <Button label="Cancel" variant="ghost" compact onPress={() => setPanel(null)} />
              </View>
            )}
            {t.status === "active" && panel === null && <Button label={t.endDate ? "Change the end date" : "End tenancy"} variant="danger" compact onPress={() => setPanel("end")} />}
            {panel === "end" && (
              <View style={{ gap: 8 }}>
                <Field label="Last day (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} autoCapitalize="none" hint="Rent stops falling due from this day. Rent due before it is still collected." />
                <Field label="Reason" value={note} onChangeText={setNote} multiline />
                <Button label="End tenancy" variant="danger" loading={act.isPending} disabled={note.trim().length < 10} onPress={() => act.mutate({ action: "landlord_end", endDate, reason: note })} />
                <Button label="Cancel" variant="ghost" compact onPress={() => setPanel(null)} />
              </View>
            )}
          </>
        )}
      </Card>

      {charges.length > 0 && (
        <Card style={{ gap: 0 }}>
          <Title style={{ marginBottom: 6 }}>Rent from the tenant</Title>
          {charges.map((ch, i) => (
            <View key={ch.referenceId}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 }}>
                <Body>
                  {formatMoney(ch.amount)} · due {formatDay(ch.dueDate)}
                </Body>
                <Badge label={ch.status === "paid" ? "Paid" : ch.overdue ? "Overdue" : "Due"} tone={ch.status === "paid" ? "success" : ch.overdue ? "danger" : "warning"} />
              </View>
            </View>
          ))}
        </Card>
      )}
      {settlements.length > 0 && (
        <Card style={{ gap: 0 }}>
          <Title style={{ marginBottom: 6 }}>Paid to you</Title>
          {settlements.map((s, i) => (
            <View key={s.referenceId}>
              {i > 0 && <Divider />}
              <View style={{ paddingVertical: 10, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Body>{formatMoney(s.amount)}</Body>
                  <Badge label={s.status === "paid" && s.paidAt ? `Paid ${formatDay(s.paidAt)}` : s.statusLabel} tone={s.status === "paid" ? "success" : s.status === "failed" ? "danger" : s.status === "ready" ? "info" : "warning"} />
                </View>
                <Small>Rent due {formatDay(s.rentDue)}{s.utr ? ` · UTR ${s.utr}` : ""}</Small>
                {s.status !== "paid" && s.holdReason && <Small>{s.holdReason}</Small>}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Scroll>
  );
}

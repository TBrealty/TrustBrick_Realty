import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { api } from "@/api/client";
import { type AgentRentPanel, LINK_TONE, type ShareLink, ordinal } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { Badge, Body, Button, Card, Display, ErrorState, Eyebrow, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { ShareLinkCard } from "@/rent/share-link";
import { useColors } from "@/theme";

const BANK = { verified: ["Bank account verified", "success"], pending: ["Bank account being checked", "warning"], failed: ["Bank account failed", "danger"], missing: ["No bank account yet", "warning"] } as const;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * A rented property's landlord and tenancy, for the agent: add the landlord (new, with a sign-up
 * link; or existing, by email, phone or ID), set up the tenancy, and follow it.
 */
export default function AgentRentScreen() {
  const c = useColors();
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["listing-rent", workspace, ref], queryFn: () => api<AgentRentPanel>(`/partner/listings/${ref}/rent`) });
  const [panel, setPanel] = useState<"remove" | "end" | null>(null);
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState(today());
  const [link, setLink] = useState<{ url: string; email?: string; message: string; done: string } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["listing-rent"] });
  const run = useMutation({
    mutationFn: async (job: { path: string; method: "POST" | "DELETE"; body: Record<string, unknown>; share?: string }) => {
      const r = await api<ShareLink>(job.path, { method: job.method, body: job.body });
      return { r, share: job.share };
    },
    onSuccess: ({ r, share }) => {
      setPanel(null);
      setReason("");
      if (share && r?.url) setLink({ url: r.url, email: r.email, message: share, done: "New link made; the old one no longer works." });
      refresh();
    },
  });

  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const { landlord, invitation, tenancy: t, can, listing } = data.data;

  return (
    <Scroll refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}>
      <Stack.Screen options={{ title: "Landlord and rent" }} />
      <View style={{ gap: 4 }}>
        <Eyebrow>{listing.referenceId}</Eyebrow>
        <Display size={26}>{listing.title}</Display>
        <Small>Rent is paid online by the tenant and settled to the landlord&apos;s bank account by Trustbrick.</Small>
      </View>
      {run.isError && <Notice>{(run.error as Error).message}</Notice>}
      {link && <ShareLinkCard {...link} />}

      <Card>
        <Title>Landlord</Title>
        {landlord ? (
          <>
            <Body>
              {landlord.name} · {landlord.referenceId}
            </Body>
            <Small>{landlord.email}</Small>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Badge label={landlord.statusLabel} tone={LINK_TONE[landlord.status]} />
              <Badge label={BANK[landlord.bank][0]} tone={BANK[landlord.bank][1]} />
            </View>
            {landlord.status === "rejected" && landlord.reviewNote && <Small>Trustbrick: “{landlord.reviewNote}”. They can upload a better proof.</Small>}
            {can.invite && !t && panel !== "remove" && <Button label="Remove landlord" variant="danger" compact onPress={() => setPanel("remove")} />}
            {panel === "remove" && (
              <View style={{ gap: 8 }}>
                <Field label="Why remove them?" value={reason} onChangeText={setReason} multiline hint="At least 10 characters. Rent already paid is still settled to them." />
                <Button label="Remove landlord" variant="danger" loading={run.isPending} disabled={reason.trim().length < 10} onPress={() => run.mutate({ path: `/partner/listings/${ref}/landlord`, method: "DELETE", body: { reason } })} />
                <Button label="Cancel" variant="ghost" compact onPress={() => setPanel(null)} />
              </View>
            )}
          </>
        ) : invitation ? (
          <>
            <Body>
              {invitation.kind === "new" ? "Sign-up link" : "Request"} sent to {invitation.name} ({invitation.email})
            </Body>
            <Small>{invitation.expired ? `Expired ${formatDateTime(invitation.expiresAt)}.` : `Until ${formatDateTime(invitation.expiresAt)}.`}</Small>
            {can.invite && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label={invitation.kind === "new" ? "New link" : "Remind them"}
                  compact
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={run.isPending}
                  onPress={() =>
                    run.mutate({ path: `/partner/landlord-invitations/${invitation.referenceId}`, method: "POST", body: { action: "resend" }, share: "Your Trustbrick link to receive rent for the property:" })
                  }
                />
                <Button label="Cancel" compact variant="danger" style={{ flex: 1 }} onPress={() => run.mutate({ path: `/partner/landlord-invitations/${invitation.referenceId}`, method: "POST", body: { action: "revoke" } })} />
              </View>
            )}
          </>
        ) : can.invite ? (
          <>
            <Small>No landlord yet. Add the person the rent is paid to.</Small>
            <Button label="Add new landlord" variant="accent" icon="person-add-outline" onPress={() => router.push(`/partner/rent/${ref}/landlord?mode=new` as Href)} />
            <Button label="Add existing landlord" variant="secondary" icon="search-outline" onPress={() => router.push(`/partner/rent/${ref}/landlord?mode=existing` as Href)} />
          </>
        ) : (
          <Small>No landlord yet.</Small>
        )}
      </Card>

      <Card>
        <Title>Tenancy</Title>
        {t ? (
          <>
            <Body>
              {t.tenantName} · {t.referenceId}
            </Body>
            <Small>
              {formatMoney(t.monthlyRent)} a month, due on the {ordinal(t.dueDay)} · deposit {t.deposit ? formatMoney(t.deposit) : "none"} · from {formatDay(t.startDate)}
              {t.endDate ? ` to ${formatDay(t.endDate)}` : ""}
            </Small>
            <Badge label={t.statusLabel} tone={t.status === "active" ? "success" : t.status === "disputed" ? "danger" : "warning"} />
            {t.firstDueDate && <Small>First rent paid online: {formatDay(t.firstDueDate)}.</Small>}
            {t.disputeNote && <Small>Landlord: “{t.disputeNote}”</Small>}
            {!t.tenantAccepted && t.inviteExpiresAt && <Small>{t.inviteExpired ? `The tenant's link expired ${formatDateTime(t.inviteExpiresAt)}.` : `The tenant's link works until ${formatDateTime(t.inviteExpiresAt)}.`}</Small>}
            {can.tenancy && (t.status === "pending" || t.status === "disputed") && (
              <View style={{ gap: 8 }}>
                {!t.tenantAccepted && (
                  <Button
                    label="Send the tenant a new link"
                    compact
                    variant="secondary"
                    onPress={() => run.mutate({ path: `/partner/tenancies/${t.referenceId}`, method: "POST", body: { action: "resend" }, share: "Your Trustbrick link to accept your tenancy and pay rent online:" })}
                  />
                )}
                <Button label="Correct the terms" compact variant="secondary" onPress={() => router.push(`/partner/rent/${ref}/tenancy?edit=${t.referenceId}` as Href)} />
                <Button label="Cancel tenancy" compact variant="danger" onPress={() => run.mutate({ path: `/partner/tenancies/${t.referenceId}`, method: "POST", body: { action: "cancel" } })} />
              </View>
            )}
            {can.tenancy && t.status === "active" && panel !== "end" && <Button label={t.endDate ? "Change the end date" : "End tenancy"} variant="danger" compact onPress={() => setPanel("end")} />}
            {panel === "end" && t && (
              <View style={{ gap: 8 }}>
                <Field label="Last day (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} autoCapitalize="none" hint="Rent stops falling due from this day." />
                <Field label="Reason" value={reason} onChangeText={setReason} multiline />
                <Button label="End tenancy" variant="danger" loading={run.isPending} disabled={reason.trim().length < 10} onPress={() => run.mutate({ path: `/partner/tenancies/${t.referenceId}`, method: "POST", body: { action: "end", endDate, reason } })} />
                <Button label="Cancel" variant="ghost" compact onPress={() => setPanel(null)} />
              </View>
            )}
          </>
        ) : landlord && can.tenancy ? (
          <>
            <Small>No tenancy yet. Set it up when the property is let: the tenant gets a link, the landlord confirms the terms.</Small>
            <Button label="Set up tenancy" variant="accent" icon="document-text-outline" onPress={() => router.push(`/partner/rent/${ref}/tenancy` as Href)} />
          </>
        ) : (
          <Small>{landlord ? "No tenancy yet." : "Add the landlord first; then set up the tenancy."}</Small>
        )}
      </Card>
    </Scroll>
  );
}

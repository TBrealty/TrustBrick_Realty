import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ApiError, api } from "@/api/client";
import { type AgentRentPanel, type ShareLink, ordinal } from "@/api/rent-types";
import { useSession } from "@/auth/session";
import { Body, Button, Chip, ErrorState, Field, Loading, Notice, Scroll, Small } from "@/components/ui";
import { ShareLinkCard } from "@/rent/share-link";

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Set up the tenancy (the tenant gets a link, the landlord confirms), or correct its terms before it starts. */
export default function TenancyScreen() {
  const { ref, edit } = useLocalSearchParams<{ ref: string; edit?: string }>();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["listing-rent", workspace, ref], queryFn: () => api<AgentRentPanel>(`/partner/listings/${ref}/rent`) });
  const t = edit && data.data?.tenancy?.referenceId === edit ? data.data.tenancy : null;
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? {
    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
    monthlyRent: t ? String(t.monthlyRent) : data.data?.listing.price ? String(data.data.listing.price) : "",
    dueDay: String(t?.dueDay ?? 5),
    deposit: String(t?.deposit ?? 0),
    startDate: t?.startDate ?? "",
    endDate: t?.endDate ?? "",
  };
  const set = (k: string) => (v: string) => setForm({ ...values, [k]: v });
  const save = useMutation({
    mutationFn: () =>
      t
        ? api<ShareLink>(`/partner/tenancies/${t.referenceId}`, { method: "PUT", body: { monthlyRent: values.monthlyRent, dueDay: values.dueDay, deposit: values.deposit, startDate: values.startDate, endDate: values.endDate } })
        : api<ShareLink>(`/partner/listings/${ref}/tenancy`, { method: "POST", body: values }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing-rent"] });
      if (t) router.back();
    },
  });

  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  if (!data.data.landlord) return <ErrorState error={new Error("Add the property's landlord first: the rent is paid to them.")} />;
  const errors = save.error instanceof ApiError ? (save.error.fieldErrors ?? {}) : {};

  if (save.data?.url) {
    return (
      <Scroll>
        <Stack.Screen options={{ title: "Tenancy" }} />
        <ShareLinkCard url={save.data.url} email={save.data.email} message="Hi, I've set up your tenancy on Trustbrick so you can pay rent online. Accept it here:" done="Tenancy set up." />
        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </Scroll>
    );
  }

  return (
    <Scroll>
      <Stack.Screen options={{ title: t ? "Correct the tenancy" : "Set up the tenancy" }} />
      <Body tone="graphite">
        Rent is paid to {data.data.landlord.name}. {t ? "They're asked to confirm the corrected terms." : "They confirm these terms; the tenant accepts with a link."}
      </Body>
      {t?.disputeNote && <Notice tone="warning">The landlord said: “{t.disputeNote}”</Notice>}
      {!t && (
        <>
          <Field label="Tenant's full name" value={values.tenantName} onChangeText={set("tenantName")} autoComplete="off" error={errors.tenantName} />
          <Field label="Tenant's mobile number" value={values.tenantPhone} onChangeText={set("tenantPhone")} keyboardType="phone-pad" error={errors.tenantPhone} />
          <Field label="Tenant's email" value={values.tenantEmail} onChangeText={set("tenantEmail")} keyboardType="email-address" autoCapitalize="none" autoComplete="off" hint="Their link works only for this email." error={errors.tenantEmail} />
        </>
      )}
      <Field label="Monthly rent (₹)" value={values.monthlyRent} onChangeText={set("monthlyRent")} keyboardType="number-pad" error={errors.monthlyRent} />
      <View style={{ gap: 6 }}>
        <Small>Rent is due on the</Small>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {DAYS.map((d) => (
            <Chip key={d} label={ordinal(d)} selected={values.dueDay === String(d)} onPress={() => set("dueDay")(String(d))} />
          ))}
        </ScrollView>
        {errors.dueDay && <Small tone="brick">{errors.dueDay}</Small>}
      </View>
      <Field label="Security deposit (₹)" value={values.deposit} onChangeText={set("deposit")} keyboardType="number-pad" hint="Recorded only; paid between them for now." error={errors.deposit} />
      <Field label="Tenancy starts (YYYY-MM-DD)" value={values.startDate} onChangeText={set("startDate")} autoCapitalize="none" placeholder="2026-12-01" error={errors.startDate} />
      <Field label="Tenancy ends (optional)" value={values.endDate} onChangeText={set("endDate")} autoCapitalize="none" placeholder="Leave empty if it runs until someone ends it" error={errors.endDate} />
      {save.isError && !Object.keys(errors).length && <Notice>{(save.error as Error).message}</Notice>}
      <Button label={t ? "Save and ask the landlord again" : "Set up and create the tenant's link"} variant="accent" loading={save.isPending} onPress={() => save.mutate()} />
    </Scroll>
  );
}

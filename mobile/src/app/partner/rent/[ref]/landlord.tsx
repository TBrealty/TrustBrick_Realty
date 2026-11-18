import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { ShareLink } from "@/api/rent-types";
import { Body, Button, Chip, Field, Notice, Scroll, Small } from "@/components/ui";
import { ShareLinkCard } from "@/rent/share-link";

/**
 * Adding a property's landlord. New: a one-time sign-up link for their email, to share. Existing:
 * found by their exact email, phone or LND- ID; they accept in their dashboard, no link to send.
 */
export default function AddLandlordScreen() {
  const params = useLocalSearchParams<{ ref: string; mode?: string }>();
  const ref = params.ref;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"new" | "existing">(params.mode === "existing" ? "existing" : "new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState("");
  const send = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<ShareLink>(`/partner/listings/${ref}/landlord`, { method: "POST", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["listing-rent"] }),
  });
  const errors = send.error instanceof ApiError ? (send.error.fieldErrors ?? {}) : {};
  const done = send.data;

  return (
    <Scroll>
      <Stack.Screen options={{ title: "Add the landlord" }} />
      {done ? (
        <>
          {done.url ? (
            <ShareLinkCard url={done.url} email={done.email} message="Hi, I've added you as the landlord of the property on Trustbrick, so your rent is paid to you online. Create your account here:" done="Invitation created." />
          ) : (
            <Notice tone="success">Sent to {done.landlordName}. They&apos;ll see it in My properties and get an email.</Notice>
          )}
          <Button label="Done" variant="secondary" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="New landlord" selected={mode === "new"} onPress={() => setMode("new")} />
            <Chip label="Existing landlord" selected={mode === "existing"} onPress={() => setMode("existing")} />
          </View>
          {mode === "new" ? (
            <>
              <Body tone="graphite">For someone who hasn&apos;t received rent through Trustbrick before. They get a link to create their account; the property is then in their My properties.</Body>
              <Field label="Landlord's full name" value={name} onChangeText={setName} autoComplete="off" error={errors.name} />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" hint="The link works only for this email." error={errors.email} />
              <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
              {send.isError && !Object.keys(errors).length && <Notice>{(send.error as Error).message}</Notice>}
              <Button label="Create the link" variant="accent" loading={send.isPending} disabled={!name.trim() || !email.trim() || !phone.trim()} onPress={() => send.mutate({ mode: "new", name, email, phone })} />
              <Small>They&apos;ll upload proof that they own the property and add a bank account in their own name. No rent reaches them until Trustbrick has approved both.</Small>
            </>
          ) : (
            <>
              <Body tone="graphite">For someone who already receives rent through Trustbrick. They accept this property in their dashboard.</Body>
              <Field label="Their email, mobile number or landlord ID" value={who} onChangeText={setWho} autoCapitalize="none" autoComplete="off" placeholder="LND-7K4M9Q2X" hint="An exact match only." error={errors.who} />
              {send.isError && !Object.keys(errors).length && <Notice>{(send.error as Error).message}</Notice>}
              <Button label="Send request" variant="accent" loading={send.isPending} disabled={who.trim().length < 3} onPress={() => send.mutate({ mode: "existing", who })} />
            </>
          )}
        </>
      )}
    </Scroll>
  );
}

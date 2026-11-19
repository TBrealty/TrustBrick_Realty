import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { ApiError, api } from "@/api/client";
import { useSession } from "@/auth/session";
import { Body, Button, Field, Notice, Scroll, Small } from "@/components/ui";
import { useColors } from "@/theme";

/**
 * Confirming a new account's email: the 6-digit code from the email (the phone may offer to fill
 * it in). The right code signs them in and takes them home.
 */
export default function VerifyEmail() {
  const c = useColors();
  const { email = "", resent } = useLocalSearchParams<{ email?: string; resent?: string }>();
  const { confirmEmail } = useSession();
  const [code, setCode] = useState("");
  const confirm = useMutation({
    mutationFn: () => confirmEmail(email, code),
    onSuccess: () => {
      router.dismissAll();
      router.replace("/");
    },
  });
  const resend = useMutation({ mutationFn: () => api<{ message: string }>("/auth/resend-code", { method: "POST", body: { email } }) });
  const errors = confirm.error instanceof ApiError ? (confirm.error.fieldErrors ?? {}) : {};

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Body tone="graphite">
          {resent ? "Your email isn't confirmed yet. " : ""}We sent a 6-digit code to {email}. Type it here to confirm your email and you&apos;re in. It expires in 10 minutes.
        </Body>
        {confirm.isError && !Object.keys(errors).length && <Notice>{(confirm.error as Error).message}</Notice>}
        <Field
          label="6-digit code"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          autoFocus
          style={{ fontSize: 26, letterSpacing: 10, textAlign: "center" }}
          error={errors.code}
        />
        <Button label="Confirm and continue" variant="accent" loading={confirm.isPending} disabled={code.length !== 6 || !email} onPress={() => confirm.mutate()} />
        {resend.isSuccess && <Notice tone="success">{resend.data.message}</Notice>}
        {resend.isError && <Notice>{(resend.error as Error).message}</Notice>}
        <Button label="Send a new code" variant="ghost" compact loading={resend.isPending} onPress={() => resend.mutate()} />
        <Small>Can&apos;t find it? Check your spam folder. A new code replaces the old one. If you already had an account with this email, sign in instead.</Small>
      </Scroll>
    </KeyboardAvoidingView>
  );
}

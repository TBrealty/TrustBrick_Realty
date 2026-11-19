import { useMutation } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform } from "react-native";
import { ApiError, api } from "@/api/client";
import { PasswordPair, pairReady } from "@/auth/password-pair";
import { API_ORIGIN } from "@/config";
import { Body, Button, Field, Notice, Scroll } from "@/components/ui";
import { useColors } from "@/theme";

/** A new account. A code is emailed to confirm it; typed on the next screen, it signs them in. */
export default function SignUp() {
  const c = useColors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ message: string }>("/auth/sign-up", { method: "POST", body: { name, email: email.trim(), password, confirmPassword: confirm } }),
    onSuccess: () => router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}` as Href),
  });
  const errors = create.error instanceof ApiError ? (create.error.fieldErrors ?? {}) : {};

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
        {create.isError && !Object.keys(errors).length && <Notice>{(create.error as Error).message}</Notice>}
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={errors.email} />
        <PasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={errors} />
        <Button label="Create account" loading={create.isPending} disabled={!name || !email || !pairReady(password, confirm)} onPress={() => create.mutate()} />
        <Body tone="muted" style={{ fontSize: 13 }}>
          We&apos;ll email you a 6-digit code to confirm your address. By creating an account you agree to Trustbrick&apos;s{" "}
          <Body tone="brick" style={{ fontSize: 13 }} accessibilityRole="link" onPress={() => Linking.openURL(`${API_ORIGIN}/terms`)}>
            Terms of Use
          </Body>{" "}
          and{" "}
          <Body tone="brick" style={{ fontSize: 13 }} accessibilityRole="link" onPress={() => Linking.openURL(`${API_ORIGIN}/privacy`)}>
            Privacy Policy
          </Body>
          .
        </Body>
      </Scroll>
    </KeyboardAvoidingView>
  );
}

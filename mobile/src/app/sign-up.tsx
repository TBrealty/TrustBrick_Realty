import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform } from "react-native";
import { ApiError, api } from "@/api/client";
import { Body, Button, Field, Notice, Scroll, Title } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/auth/form";
import { useColors } from "@/theme";

/** A new account. It's confirmed by a link sent by email, then the person signs in. */
export default function SignUp() {
  const c = useColors();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const create = useMutation({ mutationFn: () => api<{ message: string }>("/auth/sign-up", { method: "POST", body: { name, email: email.trim(), password } }) });
  const errors = create.error instanceof ApiError ? (create.error.fieldErrors ?? {}) : {};

  if (create.isSuccess) {
    return (
      <Scroll contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Title>Check your email</Title>
        <Body tone="graphite">{create.data.message}</Body>
        <Button label="Go to sign in" onPress={() => router.replace("/sign-in")} />
      </Scroll>
    );
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
        {create.isError && !Object.keys(errors).length && <Notice>{(create.error as Error).message}</Notice>}
        <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={errors.email} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} error={errors.password} />
        <Button label="Create account" loading={create.isPending} disabled={!name || !email || !password} onPress={() => create.mutate()} />
        <Body tone="muted" style={{ fontSize: 13 }}>
          By creating an account you agree to Trustbrick&apos;s terms and privacy policy.
        </Body>
      </Scroll>
    </KeyboardAvoidingView>
  );
}

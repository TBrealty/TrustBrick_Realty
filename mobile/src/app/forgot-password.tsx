import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ApiError, api } from "@/api/client";
import { PasswordPair, pairReady } from "@/auth/password-pair";
import { Body, Button, Field, Notice, Scroll } from "@/components/ui";

/** A new password, all in the app: a code is emailed, then typed here with the new password, twice. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Once a code is on its way, stay on the code step (a failed "send a new code" doesn't go back).
  const [sent, setSent] = useState<string | null>(null);
  const request = useMutation({
    mutationFn: () => api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email: email.trim() } }),
    onSuccess: (r) => setSent(r.message),
  });
  const reset = useMutation({
    mutationFn: () => api<{ message: string }>("/auth/reset-password", { method: "POST", body: { email: email.trim(), code, password, confirmPassword: confirm } }),
  });
  const requestErrors = request.error instanceof ApiError ? (request.error.fieldErrors ?? {}) : {};
  const errors = reset.error instanceof ApiError ? (reset.error.fieldErrors ?? {}) : {};

  if (reset.isSuccess) {
    return (
      <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Notice tone="success">{reset.data.message}</Notice>
        <Button label="Sign in" variant="accent" onPress={() => router.replace("/sign-in")} />
      </Scroll>
    );
  }
  return (
    <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
      {!sent ? (
        <>
          <Body tone="graphite">We&apos;ll email you a code; you type it here with your new password.</Body>
          {request.isError && !Object.keys(requestErrors).length && <Notice>{(request.error as Error).message}</Notice>}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={requestErrors.email} />
          <Button label="Send me a code" loading={request.isPending} disabled={!email} onPress={() => request.mutate()} />
        </>
      ) : (
        <>
          <Notice tone="success">{sent}</Notice>
          {request.isError && <Notice>{(request.error as Error).message}</Notice>}
          {reset.isError && !Object.keys(errors).length && <Notice>{(reset.error as Error).message}</Notice>}
          <Field
            label="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            style={{ fontSize: 26, letterSpacing: 10, textAlign: "center" }}
            error={errors.code}
          />
          <PasswordPair password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} errors={errors} label="New password" />
          <Button label="Set new password" variant="accent" loading={reset.isPending} disabled={code.length !== 6 || !pairReady(password, confirm)} onPress={() => reset.mutate()} />
          <Button label="Send a new code" variant="ghost" compact loading={request.isPending} onPress={() => request.mutate()} />
        </>
      )}
    </Scroll>
  );
}

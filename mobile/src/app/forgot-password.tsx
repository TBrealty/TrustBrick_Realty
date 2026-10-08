import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ApiError, api } from "@/api/client";
import { Body, Button, Field, Notice, Scroll } from "@/components/ui";

/** Sends a reset link by email. The password itself is reset on the website, from that link. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email: email.trim() } }) });
  const errors = request.error instanceof ApiError ? (request.error.fieldErrors ?? {}) : {};
  return (
    <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
      {request.isSuccess ? (
        <>
          <Notice tone="success">{request.data.message}</Notice>
          <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
        </>
      ) : (
        <>
          <Body tone="graphite">We&apos;ll email you a link to choose a new password.</Body>
          {request.isError && !Object.keys(errors).length && <Notice>{(request.error as Error).message}</Notice>}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={errors.email} />
          <Button label="Send reset link" loading={request.isPending} disabled={!email} onPress={() => request.mutate()} />
        </>
      )}
    </Scroll>
  );
}

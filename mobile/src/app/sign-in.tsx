import { Link, router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { ApiError } from "@/api/client";
import { useSession } from "@/auth/session";
import { Body, Button, Field, Notice, Scroll, Small } from "@/components/ui";
import { useColors } from "@/theme";

/** Email and password, as on the website. The session is kept in the phone's secure storage. */
export default function SignIn() {
  const c = useColors();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL_ERROR", "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Scroll contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Body tone="graphite">Use the same email and password as on the Trustbrick website.</Body>
        {error && <Notice tone={error.reason === "EMAIL_NOT_VERIFIED" ? "warning" : "danger"}>{error.message}</Notice>}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" error={error?.fieldErrors?.email} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} error={error?.fieldErrors?.password} />
        <Button label="Sign in" loading={busy} disabled={!email || !password} onPress={submit} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Link href="/forgot-password" replace>
            <Small tone="graphite" style={{ textDecorationLine: "underline" }}>Forgot password?</Small>
          </Link>
          <Link href="/sign-up" replace>
            <Small tone="graphite" style={{ textDecorationLine: "underline" }}>Create an account</Small>
          </Link>
        </View>
      </Scroll>
    </KeyboardAvoidingView>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { api, setSessionToken } from "@/api/client";
import { useSession } from "@/auth/session";
import { tokenStore } from "@/auth/storage";
import { FormText } from "@/components/form";
import { thud, tick } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { confirm } from "@/confirm";
import { relativeTime } from "@/lib/format";
import { formErrors } from "@/partner/data";
import { registerForPush } from "@/push";
import { fonts, radius, useColors } from "@/theme";

type Security = {
  sessions: { device: string; ip: string | null; lastActiveAt: string; current: boolean }[];
  notifications: { type: string; label: string; enabled: boolean; locked: boolean }[];
};

/**
 * Profile & security, as the website's page: the account, changing the password, where you're
 * signed in (and signing out everywhere else), and which notifications you get.
 */
export default function SecurityScreen() {
  const c = useColors();
  const { me } = useSession();
  const data = useQuery({ queryKey: ["me-security"], queryFn: () => api<Security>("/me/security") });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title: "Profile & security" }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 22 }}>
        <Section title="Account">
          <Row label="Name" value={me?.user.name} />
          <Row label="Email" value={me?.user.email} />
          <Row label="Reference" value={me?.user.referenceId} />
          <Small>To change your name or email, contact a Trustbrick administrator.</Small>
        </Section>
        <PasswordForm />
        {data.isPending ? <Loading /> : data.isError ? <ErrorState error={data.error} onRetry={() => data.refetch()} /> : <Devices data={data.data} />}
        {data.data && <Preferences data={data.data} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>{title}</Text>
        {action}
      </View>
      <View style={{ padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 12 }}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Small>{label}</Small>
      <Text style={{ flex: 1, textAlign: "right", fontFamily: fonts.medium, fontSize: 14, color: c.text }} numberOfLines={1}>
        {value ?? ""}
      </Text>
    </View>
  );
}

function PasswordForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const change = useMutation({
    mutationFn: () => api<{ token: string | null }>("/me/password", { method: "POST", body: form }),
    onSuccess: async ({ token }) => {
      tick();
      // Every session ended with the old password; this phone carries on with its new one.
      if (token) {
        setSessionToken(token);
        await tokenStore.set(token);
        void registerForPush();
      }
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      void queryClient.invalidateQueries({ queryKey: ["me-security"] });
    },
    onError: () => thud(),
  });
  const { fields, message } = formErrors(change.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Section title="Password">
      {change.isSuccess && <Notice tone="success">Password changed. You&apos;ve been signed out on every other device.</Notice>}
      {message && !Object.keys(fields).length && <Notice>{message}</Notice>}
      <FormText label="Current password" required secureTextEntry autoComplete="current-password" value={form.currentPassword} onChangeText={set("currentPassword")} error={fields.currentPassword} />
      <FormText label="New password" required secureTextEntry autoComplete="new-password" value={form.newPassword} onChangeText={set("newPassword")} error={fields.newPassword} hint="At least 10 characters." />
      <FormText label="Repeat the new password" required secureTextEntry autoComplete="new-password" value={form.confirmPassword} onChangeText={set("confirmPassword")} error={fields.confirmPassword} />
      <Button label="Change password" loading={change.isPending} disabled={!form.currentPassword || !form.newPassword} onPress={() => change.mutate()} />
    </Section>
  );
}

function Devices({ data }: { data: Security }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const others = data.sessions.filter((s) => !s.current).length;
  const revoke = useMutation({
    mutationFn: () => api("/me/sessions", { method: "DELETE" }),
    onSuccess: () => {
      tick();
      void queryClient.invalidateQueries({ queryKey: ["me-security"] });
    },
  });
  return (
    <Section
      title="Where you're signed in"
      action={others > 0 ? <Button label="Sign out the others" compact variant="secondary" loading={revoke.isPending} onPress={async () => (await confirm("Sign out everywhere else?", `${others} other ${others === 1 ? "session ends" : "sessions end"}. This phone stays signed in.`, "Sign out")) && revoke.mutate()} /> : undefined}
    >
      {data.sessions.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name={/app|Android|iOS/.test(s.device) ? "phone-portrait-outline" : "desktop-outline"} size={20} color={c.graphite} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{s.device}</Text>
            <Small style={{ fontSize: 12 }}>
              {s.ip ?? "IP unknown"} · active {relativeTime(s.lastActiveAt)}
            </Small>
          </View>
          {s.current && <Badge label="This device" tone="success" />}
        </View>
      ))}
      {revoke.isError && <Small tone="brick">{(revoke.error as Error).message}</Small>}
    </Section>
  );
}

function Preferences({ data }: { data: Security }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(() => new Set(data.notifications.filter((n) => n.enabled).map((n) => n.type)));
  const save = useMutation({
    mutationFn: (next: Set<string>) => api("/me/notification-preferences", { method: "PUT", body: { enabled: [...next] } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me-security"] }),
  });
  const toggle = (type: string, on: boolean) => {
    tick();
    const next = new Set(enabled);
    if (on) next.add(type);
    else next.delete(type);
    setEnabled(next);
    save.mutate(next);
  };
  return (
    <Section title="Notifications">
      <Small>What you&apos;re told about, in the app and on your phone. Security notices always come.</Small>
      {save.isError && <Small tone="brick">{(save.error as Error).message}</Small>}
      {data.notifications.map((n) => (
        <View key={n.type} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: n.locked ? c.muted : c.text }}>{n.label}</Text>
          <Switch accessibilityLabel={n.label} value={n.locked || enabled.has(n.type)} disabled={n.locked} onValueChange={(v) => toggle(n.type, v)} trackColor={{ true: c.brick, false: c.sand }} thumbColor="#fff" />
        </View>
      ))}
    </Section>
  );
}

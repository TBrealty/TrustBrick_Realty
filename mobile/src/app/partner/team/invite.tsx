import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { MembersResponse, OrgRole } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { Body, Button, Chip, ErrorState, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";

/** Adding someone to the organization. They get an email with a one-time link to accept. */
export default function InviteMember() {
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["partner-members", workspace], queryFn: () => api<MembersResponse>("/partner/members") });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("agent");
  const [phone, setPhone] = useState("");
  const [rera, setRera] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ referenceId: string }>("/partner/members", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-members"] });
      router.back();
    },
  });

  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const d = data.data;
  if (!d.manage) return <ErrorState error={new Error("Only Owners and Managers add people.")} />;
  const roles = d.roles.filter((r) => d.manage!.roles.includes(r.code));
  const info = d.roles.find((r) => r.code === role);
  const agent = Boolean(info?.agent);
  const errors = send.error instanceof ApiError ? (send.error.fieldErrors ?? {}) : {};

  return (
    <>
      <Stack.Screen options={{ title: "Add someone" }} />
      <Scroll>
        <Body tone="graphite">
          They get an email with a link to join {d.organization}, valid for 72 hours. They sign in as themselves, in the role you choose.
        </Body>
        <Field label="Full name" value={name} onChangeText={setName} autoComplete="off" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" error={errors.email} />
        <View style={{ gap: 8 }}>
          <Title>Role</Title>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roles.map((r) => (
              <Chip key={r.code} label={r.name} selected={role === r.code} onPress={() => setRole(r.code)} />
            ))}
          </View>
          {info && <Small>{info.description}</Small>}
          {!d.manage.roles.includes("manager") && <Small>Only an Owner can add Managers and Owners.</Small>}
        </View>
        {agent && (
          <>
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Customers who enquire on their listings see this." error={errors.phone} />
            <Field label="RERA agent registration (optional)" value={rera} onChangeText={setRera} autoCapitalize="characters" error={errors.reraAgentNumber} />
            {d.teams.length > 0 && (
              <View style={{ gap: 8 }}>
                <Small>Team (optional)</Small>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Chip label="No team" selected={teamId === null} onPress={() => setTeamId(null)} />
                  {d.teams.map((t) => (
                    <Chip key={t.id} label={t.name} selected={teamId === t.id} onPress={() => setTeamId(t.id)} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        {send.isError && <Notice>{(send.error as Error).message}</Notice>}
        <Button label="Send invitation" loading={send.isPending} disabled={!name.trim() || !email.trim()} onPress={() => send.mutate({ name, email, role, ...(agent ? { phone, reraAgentNumber: rera, teamId: teamId ?? undefined } : {}) })} />
      </Scroll>
    </>
  );
}

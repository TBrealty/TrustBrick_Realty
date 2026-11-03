import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { MembersResponse } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { confirm } from "@/confirm";
import { PressableScale } from "@/components/motion";
import { Badge, Body, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { radius, useColors } from "@/theme";

/** One team: who's in it and, for Owners and Managers, adding and taking people out, renaming and deleting. */
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["partner-members", workspace], queryFn: () => api<MembersResponse>("/partner/members") });
  const [name, setName] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["partner-members"] });
  const setMember = useMutation({
    mutationFn: (v: { member: string; inTeam: boolean }) => api(`/partner/teams/${id}/members`, { method: "POST", body: v }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (value: string) => api(`/partner/teams/${id}`, { method: "PUT", body: { name: value } }),
    onSuccess: () => {
      setName(null);
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/partner/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void refresh();
      router.back();
    },
  });

  if (data.isPending) return <Loading />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const team = data.data.teams.find((t) => t.id === id);
  if (!team) return <EmptyState icon="people-circle-outline" title="This team isn't here any more" />;
  const manages = Boolean(data.data.manage);
  const inTeam = new Set(team.members.map((m) => m.userReferenceId));
  const candidates = data.data.members.filter((m) => (m.role === "agent" || m.role === "supervisor") && !inTeam.has(m.userReferenceId));
  const renameError = rename.error instanceof ApiError ? rename.error : null;

  return (
    <>
      <Stack.Screen options={{ title: team.name }} />
      <Scroll>
        <Small>
          {team.listings} listings · {team.openLeads} open leads. A Supervisor in this team sees and works its people&apos;s listings, leads and visits.
        </Small>
        <View style={{ gap: 10 }}>
          <Title>People</Title>
          {team.members.length === 0 && <Body tone="graphite">Nobody in this team yet.</Body>}
          {team.members.map((m) => (
            <PressableScale
              key={m.userReferenceId}
              scaleTo={0.98}
              accessibilityRole="link"
              onPress={() => router.push(`/partner/team/${m.userReferenceId}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Body>{m.name}</Body>
                <Small>{m.roleName}</Small>
              </View>
              {m.isLead && <Badge label="Leads the team" tone="info" />}
              {manages && (
                <Button
                  label="Take out"
                  variant="ghost"
                  compact
                  loading={setMember.isPending && setMember.variables?.member === m.userReferenceId}
                  onPress={() => setMember.mutate({ member: m.userReferenceId, inTeam: false })}
                />
              )}
            </PressableScale>
          ))}
        </View>
        {setMember.isError && <Notice>{(setMember.error as Error).message}</Notice>}

        {manages && (
          <>
            {candidates.length > 0 && (
              <Card>
                <Title>Add to the team</Title>
                <Small>Supervisors and agents only.</Small>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {candidates.map((m) => (
                    <Chip key={m.userReferenceId} label={`${m.name} · ${m.roleName}`} icon="add" onPress={() => setMember.mutate({ member: m.userReferenceId, inTeam: true })} />
                  ))}
                </View>
              </Card>
            )}
            <Card>
              <Field label="Team name" value={name ?? team.name} onChangeText={setName} error={renameError?.fieldErrors?.name} />
              <Button label="Save name" variant="secondary" compact disabled={name === null || name.trim() === team.name} loading={rename.isPending} onPress={() => rename.mutate(name ?? team.name)} />
            </Card>
            <Button
              label="Delete team"
              variant="danger"
              loading={remove.isPending}
              onPress={async () => {
                if (await confirm(`Delete ${team.name}?`, "Its people stay in your organization and keep their work.", "Delete")) remove.mutate();
              }}
            />
            {remove.isError && <Notice>{(remove.error as Error).message}</Notice>}
          </>
        )}
      </Scroll>
    </>
  );
}

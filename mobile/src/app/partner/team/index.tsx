import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { JoinRequestRow, MemberInvitationRow, MemberRow, MembersResponse, OrgRole, TeamRow } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { confirm } from "@/confirm";
import { PressableScale } from "@/components/motion";
import { Badge, Button, Chip, EmptyState, ErrorState, Field, Loading, Notice, Small } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

type Tab = "people" | "teams" | "requests" | "invitations";

/**
 * The organization's people, as the website's Team pages. Owners and Managers add people, arrange
 * teams and follow invitations; a Supervisor sees their own team.
 */
export default function Team() {
  const c = useColors();
  const { workspace } = useSession();
  const [tab, setTab] = useState<Tab>("people");
  const [q, setQ] = useState("");
  const data = useQuery({ queryKey: ["partner-members", workspace], queryFn: () => api<MembersResponse>("/partner/members") });
  const d = data.data;
  const manages = Boolean(d?.manage);
  const needle = q.trim().toLowerCase();
  const people = (d?.members ?? []).filter((m) => !needle || `${m.name} ${m.email} ${m.phone ?? ""} ${m.userReferenceId}`.toLowerCase().includes(needle));
  const pending = d?.invitations.filter((i) => i.status === "pending").length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          title: manages ? "People" : "My team",
          headerRight: manages
            ? () => (
                <Pressable accessibilityRole="link" accessibilityLabel="Add someone" hitSlop={10} onPress={() => router.push("/partner/team/invite")}>
                  <Ionicons name="person-add-outline" size={22} color={c.text} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {data.isPending ? (
        <Loading />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : (
        <>
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
              <Chip label={`People · ${d!.members.length}`} selected={tab === "people"} onPress={() => setTab("people")} />
              <Chip label={`Teams · ${d!.teams.length}`} selected={tab === "teams"} onPress={() => setTab("teams")} />
              {manages && <Chip label={`Requests${d!.requests.length ? ` · ${d!.requests.length}` : ""}`} selected={tab === "requests"} onPress={() => setTab("requests")} />}
              {manages && <Chip label={`Invitations${pending ? ` · ${pending}` : ""}`} selected={tab === "invitations"} onPress={() => setTab("invitations")} />}
            </ScrollView>
          </View>
          {tab === "people" && (
            <FlatList
              data={people}
              keyExtractor={(m) => m.membershipId}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} tintColor={c.brick} />}
              ListHeaderComponent={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
                  <Ionicons name="search" size={18} color={c.muted} />
                  <TextInput value={q} onChangeText={setQ} returnKeyType="search" placeholder="Name, email or phone" placeholderTextColor={c.faint} accessibilityLabel="Search people" style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: c.text }} />
                </View>
              }
              renderItem={({ item }) => <PersonCard member={item} />}
              ListEmptyComponent={<EmptyState icon="people-outline" title="Nobody matches" />}
            />
          )}
          {tab === "teams" && <Teams teams={d!.teams} manages={manages} refreshing={data.isRefetching} onRefresh={() => data.refetch()} />}
          {tab === "requests" && <Requests data={d!} refreshing={data.isRefetching} onRefresh={() => data.refetch()} />}
          {tab === "invitations" && <Invitations invitations={d!.invitations} refreshing={data.isRefetching} onRefresh={() => data.refetch()} />}
        </>
      )}
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const c = useColors();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.slateSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.slate }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function PersonCard({ member: m }: { member: MemberRow }) {
  const c = useColors();
  return (
    <PressableScale scaleTo={0.98} accessibilityRole="link" onPress={() => router.push(`/partner/team/${m.userReferenceId}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Avatar name={m.name} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
            {m.name}
            {m.isYou ? " (you)" : ""}
          </Text>
          <Badge label={m.roleName} tone={m.role === "owner" || m.role === "manager" ? "contrast" : "neutral"} />
        </View>
        <Small numberOfLines={1}>
          {m.role === "operator" ? "Prepares listings" : `${m.listings} listings · ${m.openLeads} open leads`}
          {m.teams.length ? ` · ${m.teams.map((t) => t.name).join(", ")}` : ""}
        </Small>
        {m.agentStatus === "suspended" ? <Small style={{ color: c.brick }}>Agent access suspended by Trustbrick</Small> : m.lastActiveAt ? <Small>Active {relativeTime(m.lastActiveAt)}</Small> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.faint} />
    </PressableScale>
  );
}

function Teams({ teams, manages, refreshing, onRefresh }: { teams: TeamRow[]; manages: boolean; refreshing: boolean; onRefresh: () => void }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api<{ id: string }>("/partner/teams", { method: "POST", body: { name } }),
    onSuccess: ({ id }) => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["partner-members"] });
      router.push(`/partner/team/teams/${id}`);
    },
  });
  const error = create.error instanceof ApiError ? create.error : null;
  return (
    <FlatList
      data={teams}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brick} />}
      ListHeaderComponent={
        manages ? (
          <View style={{ gap: 8, marginBottom: 6 }}>
            <Field label="New team" value={name} onChangeText={setName} placeholder="e.g. Hyderabad West" error={error?.fieldErrors?.name} hint="A Supervisor sees the work of the teams they're in." />
            <Button label="Create team" compact variant="secondary" disabled={name.trim().length < 2} loading={create.isPending} onPress={() => create.mutate()} />
            {create.isError && !error?.fieldErrors && <Notice>{(create.error as Error).message}</Notice>}
          </View>
        ) : null
      }
      renderItem={({ item: t }) => (
        <PressableScale scaleTo={0.98} accessibilityRole="link" onPress={() => router.push(`/partner/team/teams/${t.id}`)} style={{ gap: 6, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>{t.name}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.faint} />
          </View>
          <Small>
            {t.members.length} {t.members.length === 1 ? "person" : "people"} · {t.listings} listings · {t.openLeads} open leads
          </Small>
          {t.members.length > 0 && (
            <Small numberOfLines={2}>{t.members.map((m) => (m.isLead ? `${m.name} (lead)` : m.name)).join(", ")}</Small>
          )}
        </PressableScale>
      )}
      ListEmptyComponent={<EmptyState icon="people-circle-outline" title={manages ? "No teams yet" : "You're not in a team yet"}>{manages ? "Create one, then add its supervisor and agents." : "An Owner or Manager adds you to one."}</EmptyState>}
    />
  );
}

function Invitations({ invitations, refreshing, onRefresh }: { invitations: MemberInvitationRow[]; refreshing: boolean; onRefresh: () => void }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: (ref: string) => api(`/partner/members/invitations/${ref}/revoke`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner-members"] }),
  });
  return (
    <FlatList
      data={invitations}
      keyExtractor={(i) => i.referenceId}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brick} />}
      ListHeaderComponent={revoke.isError ? <Notice>{(revoke.error as Error).message}</Notice> : null}
      renderItem={({ item: i }) => (
        <View style={{ gap: 6, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: c.text }} numberOfLines={1}>
              {i.name}
            </Text>
            <Badge label={i.status.charAt(0).toUpperCase() + i.status.slice(1)} tone={i.status === "pending" ? "warning" : "neutral"} />
          </View>
          <Small numberOfLines={1}>{i.email}</Small>
          <Small>
            {i.roleName}
            {i.team ? ` · ${i.team}` : ""} · by {i.invitedBy}
            {i.status === "pending" ? ` · expires ${relativeTime(i.expiresAt)}` : ""}
          </Small>
          {i.canRevoke && (
            <Button
              label="Revoke"
              variant="secondary"
              compact
              loading={revoke.isPending && revoke.variables === i.referenceId}
              onPress={async () => {
                if (await confirm(`Revoke the invitation for ${i.email}?`, "The link stops working at once. You can invite them again later.", "Revoke")) revoke.mutate(i.referenceId);
              }}
            />
          )}
        </View>
      )}
      ListEmptyComponent={<EmptyState icon="mail-outline" title="No invitations in the last 30 days">Add someone with the button at the top: they get an email to join.</EmptyState>}
    />
  );
}

/** Agents asking to join with the organization's reference. Approve in a role, or decline with a reason they're told. */
function Requests({ data, refreshing, onRefresh }: { data: MembersResponse; refreshing: boolean; onRefresh: () => void }) {
  const c = useColors();
  return (
    <FlatList
      data={data.requests}
      keyExtractor={(r) => r.agentReferenceId}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brick} />}
      ListHeaderComponent={<Small>Approve only people who work with you: they get into your workspace straight away.</Small>}
      renderItem={({ item }) => <RequestCard request={item} data={data} />}
      ListEmptyComponent={<EmptyState icon="person-add-outline" title="No requests waiting">When an agent asks to join with your organization&apos;s reference, it appears here.</EmptyState>}
    />
  );
}

function RequestCard({ request: r, data }: { request: JoinRequestRow; data: MembersResponse }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<OrgRole>("agent");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const done = () => queryClient.invalidateQueries({ queryKey: ["partner-members"] });
  const approve = useMutation({ mutationFn: () => api(`/partner/members/requests/${r.agentReferenceId}/approve`, { method: "POST", body: { role } }), onSuccess: done });
  const decline = useMutation({ mutationFn: () => api(`/partner/members/requests/${r.agentReferenceId}/decline`, { method: "POST", body: { reason } }), onSuccess: done });
  const declineError = decline.error instanceof ApiError ? decline.error : null;
  const roles = data.roles.filter((x) => data.manage?.roles.includes(x.code));
  return (
    <View style={{ gap: 8, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>{r.name}</Text>
      <Small>
        {r.email} · {r.phone}
      </Small>
      <Small>
        {[r.city, r.experienceYears !== null ? `${r.experienceYears} years` : null, r.reraAgentNumber ? `RERA ${r.reraAgentNumber}` : null, `asked ${relativeTime(r.submittedAt)}`]
          .filter(Boolean)
          .join(" · ")}
      </Small>
      {r.bio ? <Small>“{r.bio}”</Small> : null}
      {declining ? (
        <>
          <Field label="Reason (they'll see it)" value={reason} onChangeText={setReason} multiline placeholder="e.g. We don't have an agent by this name." error={declineError?.fieldErrors?.reason} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Decline" variant="danger" compact disabled={reason.trim().length < 10} loading={decline.isPending} onPress={() => decline.mutate()} />
            <Button label="Back" variant="ghost" compact onPress={() => setDeclining(false)} />
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {roles.map((x) => (
              <Chip key={x.code} label={x.name} selected={role === x.code} onPress={() => setRole(x.code)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={`Approve as ${data.roles.find((x) => x.code === role)?.name ?? role}`} compact loading={approve.isPending} onPress={() => approve.mutate()} />
            <Button label="Decline" variant="secondary" compact onPress={() => setDeclining(true)} />
          </View>
        </>
      )}
      {approve.isError && <Notice>{(approve.error as Error).message}</Notice>}
      {decline.isError && !declineError?.fieldErrors && <Notice>{(decline.error as Error).message}</Notice>}
    </View>
  );
}

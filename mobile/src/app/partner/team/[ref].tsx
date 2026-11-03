import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { MemberDetail, MembersResponse, OrgRole } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { confirm } from "@/confirm";
import { Badge, Body, Button, Card, Chip, ErrorState, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { formatDay, relativeTime } from "@/lib/format";
import { fonts, radius, useColors } from "@/theme";

const AGENT_ROLES: OrgRole[] = ["supervisor", "agent"];

/**
 * One person in the organization: how to reach them, the work they hold, and, for Owners and
 * Managers, their role and removal. Removing someone hands their work to another member.
 */
export default function TeamMember() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const c = useColors();
  const queryClient = useQueryClient();
  const { workspace } = useSession();
  const member = useQuery({ queryKey: ["partner-member", ref], queryFn: () => api<MemberDetail>(`/partner/members/${ref}`) });
  // Role names and descriptions come with the Team screen's data (usually cached already).
  const catalog = useQuery({ queryKey: ["partner-members", workspace], queryFn: () => api<MembersResponse>("/partner/members") });
  const [role, setRole] = useState<OrgRole | null>(null);
  const [phone, setPhone] = useState("");
  const [handoverTo, setHandoverTo] = useState<string | null>(null);
  const refreshList = () => queryClient.invalidateQueries({ queryKey: ["partner-members"] });

  const changeRole = useMutation({
    mutationFn: () => api<MemberDetail>(`/partner/members/${ref}/role`, { method: "POST", body: { role, phone: phone || undefined, handoverTo: handoverTo ?? undefined } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["partner-member", ref], data);
      setRole(null);
      setPhone("");
      void refreshList();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/partner/members/${ref}/remove`, { method: "POST", body: { handoverTo: handoverTo ?? undefined } }),
    onSuccess: () => {
      void refreshList();
      router.back();
    },
  });

  if (member.isPending) return <Loading />;
  if (member.isError) return <ErrorState error={member.error} onRetry={() => member.refetch()} />;
  const m = member.data;
  const roleInfo = (code: OrgRole | null) => catalog.data?.roles.find((r) => r.code === code);
  const work = m.listings + m.openLeads + m.upcomingVisits + m.openBookings;
  const chosen = role ?? m.role;
  const needsPhone = chosen !== null && AGENT_ROLES.includes(chosen) && m.agentStatus !== "active";
  const needsHandover = chosen === "operator" && m.role !== "operator" && work > 0;
  const roleError = changeRole.error instanceof ApiError ? changeRole.error : null;
  const removeError = remove.error instanceof ApiError ? remove.error : null;

  const handoverPicker = (
    <View style={{ gap: 8 }}>
      <Small>{m.handoverTo.length ? "Hand their work to" : "Add someone who works leads first: their work needs somewhere to go."}</Small>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {m.handoverTo.map((h) => (
          <Chip key={h.userReferenceId} label={`${h.name} · ${h.roleName}`} selected={handoverTo === h.userReferenceId} onPress={() => setHandoverTo(h.userReferenceId)} />
        ))}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: m.name }} />
      <Scroll>
        <View style={{ alignItems: "center", gap: 8 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.slateSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 36, color: c.slate }}>{m.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: c.text, textAlign: "center" }}>{m.name}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Badge label={m.roleName} tone="contrast" />
            {m.isYou && <Badge label="You" />}
            {m.agentStatus === "suspended" && <Badge label="Agent access suspended" tone="danger" />}
          </View>
          <Small>
            {m.teams.length ? `${m.teams.map((t) => t.name).join(", ")} · ` : ""}Joined {formatDay(m.joinedAt)}
            {m.lastActiveAt ? ` · active ${relativeTime(m.lastActiveAt)}` : ""}
          </Small>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          {m.phone ? <Button label="Call" icon="call" variant="secondary" onPress={() => Linking.openURL(`tel:${m.phone}`)} style={{ flex: 1 }} /> : null}
          <Button label="Email" icon="mail" variant="secondary" onPress={() => Linking.openURL(`mailto:${m.email}`)} style={{ flex: 1 }} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {(
            [
              ["Listings", m.listings],
              ["Open leads", m.openLeads],
              ["Visits ahead", m.upcomingVisits],
              ["Stays booked", m.openBookings],
            ] as const
          ).map(([label, n]) => (
            <View key={label} style={{ width: "48%", flexGrow: 1, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 32, color: c.text }}>{n}</Text>
              <Small>{label}</Small>
            </View>
          ))}
        </View>

        {roleInfo(m.role) && (
          <Card>
            <Small>What {m.isYou ? "you" : "they"} can do</Small>
            <Body tone="graphite">{roleInfo(m.role)!.description}</Body>
          </Card>
        )}

        {m.manage.canChangeRole && (
          <Card>
            <Title>Role</Title>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {m.manage.roles.map((r) => (
                <Chip key={r} label={roleInfo(r)?.name ?? r} selected={chosen === r} onPress={() => setRole(r)} />
              ))}
            </View>
            {role && role !== m.role && (
              <>
                {roleInfo(role) && <Small>{roleInfo(role)!.description}</Small>}
                {needsPhone && (
                  <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Customers who enquire see it." error={roleError?.fieldErrors?.phone} />
                )}
                {needsHandover && handoverPicker}
                {roleError?.fieldErrors?.handoverTo && <Notice>{roleError.fieldErrors.handoverTo}</Notice>}
                <Button label={`Make them ${roleInfo(role)?.name ?? role}`} compact loading={changeRole.isPending} disabled={needsHandover && !handoverTo} onPress={() => changeRole.mutate()} />
              </>
            )}
            {changeRole.isError && !roleError?.fieldErrors && <Notice>{(changeRole.error as Error).message}</Notice>}
          </Card>
        )}

        {m.manage.canRemove && (
          <Card>
            <Title>Remove from organization</Title>
            <Small>They lose access to this workspace at once and are told by email. Their own Trustbrick account stays.</Small>
            {work > 0 && handoverPicker}
            {removeError?.fieldErrors?.handoverTo && <Notice>{removeError.fieldErrors.handoverTo}</Notice>}
            {remove.isError && !removeError?.fieldErrors && <Notice>{(remove.error as Error).message}</Notice>}
            <Button
              label="Remove"
              variant="danger"
              compact
              loading={remove.isPending}
              disabled={work > 0 && !handoverTo}
              onPress={async () => {
                const to = m.handoverTo.find((h) => h.userReferenceId === handoverTo);
                if (await confirm(`Remove ${m.name}?`, to ? `Their listings, leads, visits and stays go to ${to.name}.` : "They have nothing to hand over.", "Remove")) remove.mutate();
              }}
            />
          </Card>
        )}
      </Scroll>
    </>
  );
}

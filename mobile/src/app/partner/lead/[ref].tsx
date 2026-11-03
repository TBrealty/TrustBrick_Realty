import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { ApiError, api } from "@/api/client";
import type { LeadDetail } from "@/api/types";
import type { LeadAssignee } from "@/api/workspace-types";
import { VisitCard } from "@/partner/visit-card";
import { Badge, Body, Button, Card, Chip, Display, Divider, ErrorState, Eyebrow, Field, Loading, Notice, Scroll, Small, Title } from "@/components/ui";
import { LEAD_STATUS_LABELS, LEAD_TRANSITIONS, type LeadStatus } from "@/lib/crm/terms";
import { formatDateTime, relativeTime } from "@/lib/format";
import { leadTone } from "@/components/tones";

const digits = (phone: string) => phone.replace(/[^\d]/g, "").replace(/^0+/, "");
const whatsapp = (phone: string) => `https://wa.me/${digits(phone).length === 10 ? `91${digits(phone)}` : digits(phone)}`;

/** One lead: reach the person, move the lead along, confirm visits and keep notes. */
export default function LeadScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const queryClient = useQueryClient();
  const lead = useQuery({ queryKey: ["partner-lead", ref], queryFn: () => api<LeadDetail>(`/partner/leads/${ref}`) });
  const [target, setTarget] = useState<LeadStatus | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [note, setNote] = useState("");
  // Supervisors, Managers and Owners can give a lead to someone else; for everyone else this is empty.
  const assignees = useQuery({ queryKey: ["partner-lead-assignees", ref], queryFn: () => api<{ assignees: LeadAssignee[] }>(`/partner/leads/${ref}/assign`) });
  const assign = useMutation({
    mutationFn: (agent: string) => api<LeadDetail | null>(`/partner/leads/${ref}/assign`, { method: "POST", body: { agent } }),
    onSuccess: (data) => {
      refresh();
      // Given to someone outside what this person sees: it leaves their list.
      if (data) queryClient.setQueryData(["partner-lead", ref], data);
      else router.back();
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-lead", ref] });
    void queryClient.invalidateQueries({ queryKey: ["partner-leads"] });
    void queryClient.invalidateQueries({ queryKey: ["partner-summary"] });
  };
  const move = useMutation({
    mutationFn: (status: LeadStatus) => api<LeadDetail>(`/partner/leads/${ref}/status`, { method: "POST", body: { status, lostReason: status === "lost" ? lostReason : undefined } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["partner-lead", ref], data);
      setTarget(null);
      setLostReason("");
      refresh();
    },
  });
  const addNote = useMutation({
    mutationFn: () => api<LeadDetail>(`/partner/leads/${ref}/notes`, { method: "POST", body: { note } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["partner-lead", ref], data);
      setNote("");
    },
  });

  if (lead.isPending) return <Loading />;
  if (lead.isError) return <ErrorState error={lead.error} onRetry={() => lead.refetch()} />;
  const l = lead.data;
  const next = LEAD_TRANSITIONS[l.status];
  const moveError = move.error instanceof ApiError ? move.error : null;

  return (
    <Scroll>
      <View style={{ gap: 6 }}>
        <Eyebrow>{l.referenceId}</Eyebrow>
        <Display size={30}>{l.contactName}</Display>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Badge label={LEAD_STATUS_LABELS[l.status]} tone={leadTone(l.status)} />
          <Small>since {relativeTime(l.createdAt)}</Small>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {l.contactPhone && <Button label="Call" icon="call-outline" compact onPress={() => Linking.openURL(`tel:${l.contactPhone}`)} />}
        {l.contactPhone && <Button label="WhatsApp" icon="logo-whatsapp" variant="secondary" compact onPress={() => Linking.openURL(whatsapp(l.contactPhone!))} />}
        {l.contactEmail && <Button label="Email" icon="mail-outline" variant="secondary" compact onPress={() => Linking.openURL(`mailto:${l.contactEmail}`)} />}
      </View>

      <Card>
        <Small>About</Small>
        <Title>{l.listingTitle ?? "General enquiry"}</Title>
        {l.message ? <Body tone="graphite">“{l.message}”</Body> : null}
        {l.lostReason ? <Small>Lost: {l.lostReason}</Small> : null}
      </Card>

      {next.length > 0 && (
        <Card>
          <Title>Move to</Title>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {next.map((s) => (
              <Chip key={s} label={LEAD_STATUS_LABELS[s]} selected={target === s} onPress={() => (s === "lost" ? setTarget(s) : move.mutate(s))} />
            ))}
          </View>
          {target === "lost" && (
            <>
              <Field label="Why was it lost?" value={lostReason} onChangeText={setLostReason} placeholder="e.g. Chose another flat" error={moveError?.fieldErrors?.lostReason} />
              <Button label="Mark as lost" variant="danger" compact loading={move.isPending} onPress={() => move.mutate("lost")} />
            </>
          )}
          {move.isError && !moveError?.fieldErrors && <Notice>{(move.error as Error).message}</Notice>}
        </Card>
      )}

      {(assignees.data?.assignees.length ?? 0) > 0 && (
        <Card>
          <Title>Assign to</Title>
          <Small>Now with {l.agentName ?? "nobody"}.</Small>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {assignees.data!.assignees.map((a) => (
              <Chip
                key={a.userReferenceId}
                label={`${a.name}${a.isYou ? " (you)" : ""}`}
                selected={assign.isPending && assign.variables === a.userReferenceId}
                onPress={() => assign.mutate(a.userReferenceId)}
              />
            ))}
          </View>
          {assign.isError && <Notice>{(assign.error as Error).message}</Notice>}
        </Card>
      )}

      {l.visits.length > 0 && (
        <View style={{ gap: 10 }}>
          <Title>Visits</Title>
          {l.visits.map((v) => (
            <VisitCard key={v.referenceId} visit={v} onChanged={refresh} />
          ))}
        </View>
      )}

      <Card>
        <Title>Notes</Title>
        <Field label="Add a note" value={note} onChangeText={setNote} multiline style={{ minHeight: 70, textAlignVertical: "top" }} placeholder="What did you talk about?" />
        <Button label="Save note" compact variant="secondary" disabled={!note.trim()} loading={addNote.isPending} onPress={() => addNote.mutate()} />
        {l.activities.length > 0 && <Divider />}
        {l.activities.map((a, i) => (
          <View key={`${a.createdAt}-${i}`} style={{ gap: 2 }}>
            <Body style={{ fontSize: 14 }}>
              {a.type === "status_changed" && a.toStatus ? `Moved to ${LEAD_STATUS_LABELS[a.toStatus as LeadStatus] ?? a.toStatus}${a.body ? `: ${a.body}` : ""}` : (a.body ?? a.type)}
            </Body>
            <Small style={{ fontSize: 12 }}>
              {a.actorName ?? "Trustbrick"} · {formatDateTime(a.createdAt)}
            </Small>
          </View>
        ))}
      </Card>
    </Scroll>
  );
}

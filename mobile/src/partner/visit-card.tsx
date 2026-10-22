import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/api/client";
import type { VisitRow } from "@/api/types";
import { SlotPicker } from "@/components/slot-picker";
import { Badge, Body, Button, Card, Notice, Small, Title } from "@/components/ui";
import { VISIT_ACTIONS, VISIT_STATUS_LABELS, type VisitAction } from "@/lib/crm/terms";
import { formatDateTime } from "@/lib/format";

/** A site visit, with what can be done to it now: confirm or change the time, mark it done, cancel. `withContext` adds who and where (in the visits list). */
export function VisitCard({ visit, onChanged, withContext }: { visit: VisitRow; onChanged: () => void; withContext?: boolean }) {
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: (action: VisitAction) => api(`/partner/visits/${visit.referenceId}`, { method: "POST", body: { action, scheduledAt: when ?? undefined } }),
    onSuccess: () => {
      setScheduling(false);
      onChanged();
    },
  });
  const actions = (Object.keys(VISIT_ACTIONS) as VisitAction[]).filter((a) => (VISIT_ACTIONS[a].from as readonly string[]).includes(visit.status));
  return (
    <Card style={{ padding: 12 }}>
      {withContext && (
        <Pressable accessibilityRole="link" disabled={!visit.leadReferenceId} onPress={() => visit.leadReferenceId && router.push(`/partner/lead/${visit.leadReferenceId}`)} style={{ gap: 2 }}>
          <Title style={{ fontSize: 16 }} numberOfLines={1}>
            {visit.contactName ?? "Visit"}
          </Title>
          <Small numberOfLines={1}>
            {visit.listingTitle ?? "General enquiry"}
            {visit.agentName ? ` · ${visit.agentName}` : ""}
          </Small>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Body style={{ flex: 1 }}>{visit.scheduledAt ? `Confirmed: ${formatDateTime(visit.scheduledAt)}` : visit.requestedFor ? `Asked for ${formatDateTime(visit.requestedFor)}` : "Visit"}</Body>
        <Badge label={VISIT_STATUS_LABELS[visit.status]} tone={visit.status === "requested" ? "warning" : visit.status === "scheduled" ? "info" : "neutral"} />
      </View>
      {act.isError && <Notice>{(act.error as Error).message}</Notice>}
      {scheduling ? (
        <>
          <SlotPicker onChange={setWhen} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Confirm this time" compact disabled={!when} loading={act.isPending} onPress={() => act.mutate("schedule")} />
            <Button label="Back" variant="ghost" compact onPress={() => setScheduling(false)} />
          </View>
          <Small>The customer is told straight away.</Small>
        </>
      ) : (
        actions.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {actions.map((a) =>
              a === "schedule" ? (
                <Button key={a} label={visit.status === "scheduled" ? "Change the time" : "Confirm a time"} compact onPress={() => setScheduling(true)} />
              ) : (
                <Button key={a} label={VISIT_ACTIONS[a].label} variant={a === "cancel" ? "danger" : "secondary"} compact loading={act.isPending && act.variables === a} onPress={() => act.mutate(a)} />
              ),
            )}
          </View>
        )
      )}
    </Card>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { type Href, Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { api, assetUrl, authHeaders } from "@/api/client";
import type { Gap, ListingActionView, ListingWorkspace } from "@/api/workspace-types";
import { FormCards, FormText, SaveBar, Sheet } from "@/components/form";
import { PressableScale, enter, thud, tick } from "@/components/motion";
import { Badge, Button, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { CLOSE_OUTCOME_LABELS, computeCommission } from "@/lib/commission/terms";
import { formatDateTime, formatPrice } from "@/lib/format";
import { CLOSE_OUTCOMES } from "@/lib/vocab";
import { formErrors, refreshListing, useListingWorkspace } from "@/partner/data";
import { STATUS_TONE } from "@/partner/labels";
import { fonts, radius, shadow, useColors } from "@/theme";


/**
 * One property, managed as on the website: where it stands and what's missing, each step to
 * edit, quick edits while it's live, the actions it can take now (submit, withdraw, mark sold or
 * rented…), and its numbers and history.
 */
export default function PropertyHub() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const ws = useListingWorkspace(ref);
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: "", headerTransparent: false, headerShadowVisible: false, headerStyle: { backgroundColor: c.background } }} />
      {ws.isPending ? (
        <Loading />
      ) : ws.isError ? (
        <ErrorState error={ws.error} onRetry={() => ws.refetch()} />
      ) : (
        <Hub ws={ws.data} refreshing={ws.isRefetching} onRefresh={() => ws.refetch()} />
      )}
    </>
  );
}

const SECTIONS: { key: Gap["section"] | "amenities" | "tour"; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "location", title: "Location", icon: "location-outline" },
  { key: "details", title: "Details", icon: "list-outline" },
  { key: "pricing", title: "Price and terms", icon: "pricetag-outline" },
  { key: "amenities", title: "Amenities", icon: "sparkles-outline" },
  { key: "media", title: "Photos and files", icon: "images-outline" },
  { key: "tour", title: "360° and 3D tour", icon: "planet-outline" },
];

function Hub({ ws, refreshing, onRefresh }: { ws: ListingWorkspace; refreshing: boolean; onRefresh: () => void }) {
  const c = useColors();
  const l = ws.listing;
  const cover = l.media.filter((m) => m.kind === "photo").sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const [acting, setActing] = useState<ListingActionView | null>(null);
  const primary = ws.actions.find((a) => a.action === "submit");
  const others = ws.actions.filter((a) => a !== primary);
  const commissionGap = ws.gaps.find((g) => g.section === "commission");

  const hrefFor = (key: (typeof SECTIONS)[number]["key"]): Href =>
    key === "media" ? `/partner/property/${l.referenceId}/media` : key === "tour" ? `/partner/listing/${l.referenceId}` : `/partner/property/${l.referenceId}/${key}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brick} />}>
        {/* Header */}
        <Animated.View entering={enter(0)} style={{ paddingHorizontal: 16, gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ width: 92, height: 92, borderRadius: radius.xl, backgroundColor: c.sand, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {cover ? (
                <Image source={{ uri: assetUrl(cover.thumbnailUrl ?? cover.url), headers: authHeaders() }} style={{ width: 92, height: 92 }} contentFit="cover" transition={200} />
              ) : (
                <Ionicons name="image-outline" size={28} color={c.faint} />
              )}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <Badge label={ws.statusLabel} tone={STATUS_TONE[l.status] ?? "neutral"} />
                {l.isSample && <Badge label="Sample" />}
              </View>
              <Text style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: c.text }} numberOfLines={3}>
                {l.title || "Untitled property"}
              </Text>
              <Small numberOfLines={2}>
                {ws.purposeLabel} · {l.type.name} · {l.location.locality}
                {l.location.city ? `, ${l.location.city}` : ""}
              </Small>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 20, color: c.text }}>{ws.card.priceLabel}</Text>
            <Small>{l.referenceId}</Small>
          </View>
          {l.statusReason && ["changes_requested", "rejected"].includes(l.status) && <Notice tone={l.status === "rejected" ? "danger" : "warning"}>{`Our team: ${l.statusReason}`}</Notice>}
          {ws.card.offer?.active && (
            <Notice tone="success">
              {ws.card.offer.title}
              {ws.card.offer.validUntil ? ` · until ${ws.card.offer.validUntil}` : ""}
            </Notice>
          )}
        </Animated.View>

        {/* What's missing */}
        {ws.editable && ws.gaps.length > 0 && (
          <Animated.View entering={enter(1)} style={{ margin: 16, marginBottom: 0, padding: 16, borderRadius: radius.xl, backgroundColor: c.amberSoft, gap: 10 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>Before you can submit</Text>
            {ws.gaps.map((g, i) => (
              <PressableScale
                key={i}
                accessibilityRole="link"
                onPress={() => router.push(g.section === "commission" ? "/partner/commission" : hrefFor(g.section))}
                style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
              >
                <Ionicons name="ellipse-outline" size={16} color={c.amber} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.text }}>{g.message}</Text>
                <Ionicons name="chevron-forward" size={16} color={c.muted} style={{ marginTop: 2 }} />
              </PressableScale>
            ))}
          </Animated.View>
        )}
        {!ws.editable && commissionGap && (
          <PressableScale accessibilityRole="link" onPress={() => router.push("/partner/commission")} style={{ margin: 16, marginBottom: 0 }}>
            <Notice tone="warning">{`${commissionGap.message} ›`}</Notice>
          </PressableScale>
        )}

        {/* Quick edit */}
        {ws.quickEdit && (
          <Animated.View entering={enter(1)} style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <PressableScale accessibilityRole="button" onPress={() => router.push(`/partner/property/${l.referenceId}/terms`)} style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.xl, backgroundColor: c.ink }, shadow.soft]}>
              <Ionicons name="flash" size={20} color={c.background} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.background }}>Quick edit</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.background, opacity: 0.75 }}>Price, availability and an offer. Live straight away, no new review.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.background} />
            </PressableScale>
          </Animated.View>
        )}

        {/* Steps */}
        <Animated.View entering={enter(2)} style={{ margin: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
          {SECTIONS.map((s, i) => {
            const gap = ws.gaps.find((g) => g.section === s.key);
            const locked = !ws.editable && s.key !== "tour" && s.key !== "media";
            return (
              <PressableScale
                key={s.key}
                accessibilityRole="link"
                disabled={locked}
                scaleTo={0.99}
                onPress={() => router.push(hrefFor(s.key))}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 15, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
              >
                <Ionicons name={s.icon} size={20} color={c.graphite} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: locked ? c.muted : c.text }}>{s.title}</Text>
                {ws.editable && s.key !== "tour" && s.key !== "amenities" && <Ionicons name={gap ? "alert-circle" : "checkmark-circle"} size={18} color={gap ? c.amber : c.sage} />}
                {!locked && <Ionicons name="chevron-forward" size={16} color={c.faint} />}
              </PressableScale>
            );
          })}
        </Animated.View>
        {!ws.editable && !ws.quickEdit && ["submitted", "under_review", "approved"].includes(l.status) && (
          <View style={{ paddingHorizontal: 16 }}>
            <Notice tone="info">Our team is reviewing this listing. You&apos;ll be notified when it&apos;s live or if anything needs changing.</Notice>
          </View>
        )}

        {/* Numbers */}
        {l.publishedAt && (
          <Animated.View entering={enter(3)} style={{ paddingHorizontal: 16, gap: 10 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>How it&apos;s doing</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  ["Views", l.stats.views],
                  ["Viewers", l.stats.uniqueViewers],
                  ["Leads", l.stats.leads],
                  ["Saves", l.stats.saves],
                  ["Visits", l.stats.visits],
                ] as const
              ).map(([label, n]) => (
                <View key={label} style={{ flexGrow: 1, minWidth: "30%", padding: 12, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 28, color: c.text }}>{n}</Text>
                  <Small>{label}</Small>
                </View>
              ))}
            </View>
            {ws.card.publicUrl && <Button label="See it as customers do" variant="secondary" icon="eye-outline" onPress={() => router.push(`/listing/${l.referenceId}`)} />}
          </Animated.View>
        )}

        {/* What customers see */}
        {ws.card.sections.some((s) => s.facts.some(([, v]) => v)) && (
          <View style={{ padding: 16, gap: 12 }}>
            {ws.card.sections.map((s) => {
              const facts = s.facts.filter(([, v]) => v);
              if (!facts.length) return null;
              return (
                <View key={s.title} style={{ padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 6 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{s.title}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                    {facts.map(([k, v]) => (
                      <View key={k} style={{ width: "50%", paddingVertical: 5, paddingRight: 8 }}>
                        <Small>{k}</Small>
                        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.text }}>{v}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            {ws.card.rooms.length > 0 && (
              <View style={{ padding: 16, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 8 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>Rooms</Text>
                {ws.card.rooms.map((r) => (
                  <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.text }}>{r.label}</Text>
                    <Small>
                      {formatPrice(r.rentPerBed, { compact: false })}/bed · {r.bedsAvailable} free
                    </Small>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* History */}
        {ws.card.history.length > 0 && (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>History</Text>
            {ws.card.history.slice(0, 12).map((h, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ alignItems: "center" }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i ? c.faint : c.brick, marginTop: 5 }} />
                  {i < Math.min(ws.card.history.length, 12) - 1 && <View style={{ width: 1, flex: 1, backgroundColor: c.line, marginTop: 2 }} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 14, gap: 2 }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{h.label}</Text>
                  {h.reason ? <Small tone="graphite">{h.reason}</Small> : null}
                  <Small style={{ fontSize: 12 }}>
                    {[h.actor, formatDateTime(h.at)].filter(Boolean).join(" · ")}
                  </Small>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Other actions */}
        {others.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
            {others.map((a) => (
              <Button key={a.action} label={a.label} variant={a.action === "archive" ? "ghost" : "secondary"} onPress={() => setActing(a)} />
            ))}
          </View>
        )}
      </ScrollView>

      {primary && (
        <SaveBar>
          <Button label={primary.label} variant="accent" icon="send" disabled={ws.gaps.length > 0} onPress={() => setActing(primary)} style={{ flex: 1 }} />
        </SaveBar>
      )}
      {acting && <ActionSheet ws={ws} action={acting} onClose={() => setActing(null)} />}
    </View>
  );
}

/** Confirms an action, with a reason where it needs one, or — closing a sale or rental — how it closed and the commission. */
function ActionSheet({ ws, action, onClose }: { ws: ListingWorkspace; action: ListingActionView; onClose: () => void }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const l = ws.listing;
  const closing = action.action === "mark_closed" && ws.deal;
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dealValue, setDealValue] = useState(ws.deal?.price ? String(ws.deal.price) : "");
  const [brokerage, setBrokerage] = useState(ws.deal?.suggestedBrokerage != null ? String(ws.deal.suggestedBrokerage) : "");
  const run = useMutation({
    mutationFn: () =>
      api(`/partner/listings/${l.referenceId}/transition`, {
        method: "POST",
        body: { action: action.action, reason: reason.trim() || undefined, close: closing ? { outcome, dealValue: outcome === "closed_deal" ? dealValue : undefined, brokerage: outcome === "closed_deal" ? brokerage : undefined } : undefined },
      }),
    onSuccess: () => {
      tick();
      refreshListing(queryClient, l.referenceId);
      onClose();
    },
    onError: () => thud(),
  });
  const { fields, message } = formErrors(run.error);
  const deal = ws.deal;
  const preview =
    closing && deal && outcome === "closed_deal" && Number(dealValue) > 0
      ? computeCommission({ basis: deal.rate.basis, percent: deal.rate.percent, dealValue: Number(dealValue), brokerage: brokerage === "" ? null : Number(brokerage), gstPercent: deal.gstPercent })
      : null;

  return (
    <Sheet visible onClose={onClose} title={action.label}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 16 }}>
        {action.confirm ? <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.graphite }}>{action.confirm}</Text> : null}
        {message && <Notice>{message}</Notice>}
        {closing && deal && (
          <>
            <FormCards label="How did it close?" value={outcome} onChange={setOutcome} error={fields.outcome} options={CLOSE_OUTCOMES.map((o) => ({ value: o, label: CLOSE_OUTCOME_LABELS[o].label, hint: CLOSE_OUTCOME_LABELS[o].hint }))} />
            {outcome === "closed_deal" && (
              <>
                <FormText label={deal.purpose === "sale" ? "Final sale price" : "Final monthly rent"} required prefix="₹" keyboardType="number-pad" value={dealValue} onChangeText={(v) => setDealValue(v.replace(/\D/g, ""))} error={fields.dealValue} />
                <FormText
                  label="Your brokerage"
                  required={deal.rate.basis === "brokerage"}
                  prefix="₹"
                  keyboardType="number-pad"
                  value={brokerage}
                  onChangeText={(v) => setBrokerage(v.replace(/\D/g, ""))}
                  error={fields.brokerage}
                  hint="What you earned on this deal, in rupees (0 if none)."
                />
                {preview && (
                  <View style={{ padding: 14, borderRadius: radius.lg, backgroundColor: c.paper, gap: 4 }}>
                    <Small>
                      Trustbrick&apos;s commission: {deal.rate.percent}% of the {deal.rate.basis === "brokerage" ? "brokerage" : "deal value"}, plus {deal.gstPercent}% GST
                    </Small>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text }}>{formatPrice(preview.total, { compact: false })}</Text>
                    <Small>
                      {formatPrice(preview.amount, { compact: false })} + {formatPrice(preview.gst, { compact: false })} GST. It&apos;s added to your commission ledger.
                    </Small>
                  </View>
                )}
              </>
            )}
          </>
        )}
        {(action.reasonRequired || action.action !== "submit") && (
          <FormText label={action.reasonRequired ? "Reason" : "Note"} required={action.reasonRequired} multiline value={reason} onChangeText={setReason} maxLength={2000} error={fields.reason} hint="Kept on the listing's history for your team." />
        )}
        <Button
          label={action.label}
          variant={action.action === "archive" || action.action === "withdraw" ? "danger" : "accent"}
          loading={run.isPending}
          disabled={(action.reasonRequired && !reason.trim()) || (Boolean(closing) && !outcome)}
          onPress={() => run.mutate()}
        />
      </ScrollView>
    </Sheet>
  );
}

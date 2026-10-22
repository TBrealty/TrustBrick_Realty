import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { CalendarDay, CalendarMonth } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { FormSelect, FormText, Sheet, monthLabel, shiftMonth } from "@/components/form";
import { PressableScale, thud, tick } from "@/components/motion";
import { Button, EmptyState, ErrorState, Loading, Notice, Small } from "@/components/ui";
import { confirm } from "@/confirm";
import { formatPrice } from "@/lib/format";
import { formErrors } from "@/partner/data";
import { fonts, radius, useColors } from "@/theme";

const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n));

/**
 * The hosting calendar, as on the website: each night's price, bookings and blocked dates. Tap
 * two nights to pick a range, then block it or give it a special price.
 */
export default function HostCalendar() {
  const c = useColors();
  const { workspace } = useSession();
  const stays = useQuery({ queryKey: ["partner-stays", workspace], queryFn: () => api<{ items: { referenceId: string; title: string; status: string }[] }>("/partner/stays") });
  const [stay, setStay] = useState<string | null>(null);
  const chosen = stay ?? stays.data?.items[0]?.referenceId ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: "Calendar" }} />
      {stays.isPending ? (
        <Loading />
      ) : stays.isError ? (
        <ErrorState error={stays.error} onRetry={() => stays.refetch()} />
      ) : !chosen ? (
        <EmptyState icon="calendar-outline" title="No homestays yet">
          List a home as a homestay and its calendar shows here.
        </EmptyState>
      ) : (
        <>
          {stays.data.items.length > 1 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <FormSelect label="Homestay" required value={chosen} options={stays.data.items.map((s) => ({ value: s.referenceId, label: s.title }))} onChange={setStay} />
            </View>
          )}
          <Month key={chosen} stayRef={chosen} />
        </>
      )}
    </View>
  );
}

function Month({ stayRef }: { stayRef: string }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"range" | null>(null);
  const cal = useQuery({ queryKey: ["stay-calendar", stayRef, month], queryFn: () => api<CalendarMonth>(`/partner/stays/${stayRef}/calendar?month=${month}`), placeholderData: (prev) => prev });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["stay-calendar", stayRef] });

  const remove = useMutation({
    mutationFn: (p: { kind: "blocks" | "rates"; id: string }) => api(`/partner/stays/${stayRef}/${p.kind}/${p.id}`, { method: "DELETE" }),
    onSuccess: () => {
      tick();
      refresh();
    },
  });

  if (cal.isPending) return <Loading />;
  if (cal.isError) return <ErrorState error={cal.error} onRetry={() => cal.refetch()} />;
  const d = cal.data;
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

  const pick = async (day: CalendarDay) => {
    if (day.booking) return router.push(`/partner/booking/${day.booking.referenceId}`);
    if (day.past || !d.canEdit) return;
    if (day.blocked && !from) {
      if (await confirm("Open these nights again?", day.blocked.reason ? `Blocked: ${day.blocked.reason}` : "Guests will be able to book them.", "Open")) remove.mutate({ kind: "blocks", id: day.blocked.id });
      return;
    }
    tick();
    if (!from || to || day.date < from) {
      setFrom(day.date);
      setTo(null);
    } else {
      setTo(day.date);
      setSheet("range");
    }
  };
  const inRange = (date: string) => from !== null && (to ? date >= from && date <= to : date === from);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }} refreshControl={<RefreshControl refreshing={cal.isRefetching} onRefresh={() => cal.refetch()} tintColor={c.brick} />}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <PressableScale accessibilityLabel="Previous month" disabled={month <= today().slice(0, 7)} onPress={() => setMonth((x) => shiftMonth(x, -1))} style={{ padding: 8, opacity: month <= today().slice(0, 7) ? 0.3 : 1 }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </PressableScale>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: c.text }}>{monthLabel(month)}</Text>
        <PressableScale accessibilityLabel="Next month" onPress={() => setMonth((x) => shiftMonth(x, 1))} style={{ padding: 8 }}>
          <Ionicons name="chevron-forward" size={22} color={c.text} />
        </PressableScale>
      </View>

      <View>
        <View style={{ flexDirection: "row" }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: fonts.medium, fontSize: 12, color: c.muted, paddingBottom: 6 }}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: lead }, (_, i) => (
            <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 0.82 }} />
          ))}
          {d.days.map((day) => {
            const sel = inRange(day.date);
            const bg = sel ? c.ink : day.booking ? c.slateSoft : day.blocked ? c.sand : "transparent";
            const fg = sel ? c.background : day.past ? c.faint : c.text;
            return (
              <Pressable key={day.date} accessibilityLabel={`${shortDay(day.date)}${day.booking ? `, booked by ${day.booking.guestName}` : day.blocked ? ", blocked" : `, ${formatPrice(day.price, { compact: false })}`}`} onPress={() => pick(day)} style={{ width: `${100 / 7}%`, aspectRatio: 0.82, padding: 2 }}>
                <View style={{ flex: 1, borderRadius: radius.md, backgroundColor: bg, alignItems: "center", justifyContent: "center", gap: 1, borderWidth: day.date === today() ? 1 : 0, borderColor: c.brick }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: fg, textDecorationLine: day.blocked && !sel ? "line-through" : "none" }}>{Number(day.date.slice(8))}</Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 9.5, color: sel ? c.background : day.special ? c.brick : c.muted }} numberOfLines={1}>
                    {day.booking ? (day.booking.isStart ? day.booking.guestName.split(" ")[0] : "•") : day.blocked ? "shut" : `₹${compact(day.price)}`}
                  </Text>
                  {day.requests > 0 && !sel && <View style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: c.amber }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Legend color={c.slateSoft} label="Booked" />
        <Legend color={c.sand} label="Blocked" />
        <Legend dot={c.amber} label="Request waiting" />
        <Legend text={c.brick} label="Special price" />
      </View>
      {!d.canEdit ? (
        <Notice tone="info">You can see this calendar but not change it.</Notice>
      ) : from && !to ? (
        <Notice tone="info">{`From ${shortDay(from)}. Now tap the last night.`}</Notice>
      ) : (
        <Small>Tap the first and last night to block them or set a special price. Tap a blocked night to open it again.</Small>
      )}

      {(d.blocks.length > 0 || d.rates.length > 0) && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>This month</Text>
          {d.blocks.map((b) => (
            <Line key={b.id} icon="lock-closed-outline" title={`Blocked ${shortDay(b.from)} – ${shortDay(b.to)}`} detail={b.reason ?? undefined} onRemove={d.canEdit ? () => remove.mutate({ kind: "blocks", id: b.id }) : undefined} />
          ))}
          {d.rates.map((r) => (
            <Line key={r.id} icon="pricetag-outline" title={`${formatPrice(r.price, { compact: false })} a night, ${shortDay(r.from)} – ${shortDay(r.to)}`} detail={r.note ?? undefined} onRemove={d.canEdit ? () => remove.mutate({ kind: "rates", id: r.id }) : undefined} />
          ))}
        </View>
      )}
      {remove.isError && <Notice>{(remove.error as Error).message}</Notice>}

      {sheet === "range" && from && to && (
        <RangeSheet
          stayRef={stayRef}
          from={from}
          to={to}
          basePrice={d.listing.price}
          onClose={(done) => {
            setSheet(null);
            if (done) {
              setFrom(null);
              setTo(null);
              refresh();
            }
          }}
        />
      )}
    </ScrollView>
  );
}

function Legend({ color, dot, text, label }: { color?: string; dot?: string; text?: string; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {color ? <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color }} /> : dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: text }}>₹</Text>}
      <Small style={{ fontSize: 12, color: c.graphite }}>{label}</Small>
    </View>
  );
}

function Line({ icon, title, detail, onRemove }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail?: string; onRemove?: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Ionicons name={icon} size={18} color={c.graphite} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{title}</Text>
        {detail ? <Small>{detail}</Small> : null}
      </View>
      {onRemove && (
        <PressableScale accessibilityRole="button" accessibilityLabel={`Remove: ${title}`} hitSlop={8} onPress={onRemove}>
          <Ionicons name="close-circle-outline" size={22} color={c.brick} />
        </PressableScale>
      )}
    </View>
  );
}

/** What to do with the chosen nights: block them, or price them differently. */
function RangeSheet({ stayRef, from, to, basePrice, onClose }: { stayRef: string; from: string; to: string; basePrice: number; onClose: (done: boolean) => void }) {
  const c = useColors();
  const [kind, setKind] = useState<"block" | "rate">("block");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState(String(basePrice));
  const save = useMutation({
    mutationFn: () => (kind === "block" ? api(`/partner/stays/${stayRef}/blocks`, { method: "POST", body: { from, to, reason } }) : api(`/partner/stays/${stayRef}/rates`, { method: "POST", body: { from, to, price, note: reason } })),
    onSuccess: () => {
      tick();
      onClose(true);
    },
    onError: () => thud(),
  });
  const { fields, message } = formErrors(save.error);
  const nights = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return (
    <Sheet visible onClose={() => onClose(false)} title={`${shortDay(from)} – ${shortDay(to)} · ${nights} ${nights === 1 ? "night" : "nights"}`}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 16 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.sand, borderRadius: radius.pill, padding: 4 }}>
          {(
            [
              ["block", "Block nights"],
              ["rate", "Special price"],
            ] as const
          ).map(([k, label]) => (
            <PressableScale key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={{ flex: 1, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: kind === k ? c.surface : "transparent" }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: kind === k ? c.text : c.muted }}>{label}</Text>
            </PressableScale>
          ))}
        </View>
        {message && <Notice>{message}</Notice>}
        {kind === "rate" && <FormText label="Price per night" required prefix="₹" keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ""))} error={fields.price} hint={`Usually ${formatPrice(basePrice, { compact: false })}.`} />}
        <FormText
          label={kind === "block" ? "Why (just for you)" : "Note"}
          value={reason}
          onChangeText={setReason}
          maxLength={80}
          error={fields.reason ?? fields.note ?? fields.from ?? fields.to}
          placeholder={kind === "block" ? "e.g. Family visiting, repairs" : "e.g. Diwali week"}
        />
        <Button label={kind === "block" ? "Block these nights" : "Set this price"} variant="accent" loading={save.isPending} onPress={() => save.mutate()} />
      </ScrollView>
    </Sheet>
  );
}

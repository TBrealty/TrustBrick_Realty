import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { api } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import type { Dashboard } from "@/api/workspace-types";
import { useSession } from "@/auth/session";
import { PressableScale, Skeleton, enter, tick } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, ErrorState, Screen, Small } from "@/components/ui";
import { LEAD_STATUS_LABELS } from "@/lib/crm/terms";
import { formatDateTime, formatDay, formatPrice, relativeTime } from "@/lib/format";
import { nightsLabel } from "@/lib/stays/labels";
import { STATUS_TONE } from "@/partner/labels";
import { fonts, radius, shadow, useColors } from "@/theme";

const RANGES = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
] as const;

function greeting() {
  const h = Number(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).slice(0, 2));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Partner mode's home: what needs doing today, how the listings are doing, and shortcuts to the day's work. */
export default function Today() {
  const c = useColors();
  const space = useTabBarSpace();
  const { me, workspace } = useSession();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("30d");
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary") });
  const dash = useQuery({ queryKey: ["partner-dashboard", workspace, range], queryFn: () => api<Dashboard>(`/partner/dashboard?range=${range}`), placeholderData: (prev) => prev });

  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const d = dash.data;
  const firstName = me?.user.name?.split(" ")[0];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space, gap: 22 }}
        refreshControl={
          <RefreshControl
            refreshing={summary.isRefetching || dash.isRefetching}
            onRefresh={() => {
              void summary.refetch();
              void dash.refetch();
            }}
            tintColor={c.brick}
          />
        }
      >
        {/* Greeting */}
        <Animated.View entering={enter(0)} style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: c.muted }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
            </Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: c.text }}>
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </Text>
            {s && s.workspace.type !== "personal" && <Small>{s.workspace.name}</Small>}
          </View>
          <PressableScale accessibilityRole="button" accessibilityLabel="Workspace and settings" onPress={() => router.navigate("/more")} style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" }, shadow.soft]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.brick }}>{(s?.workspace.name ?? me?.user.name ?? "T").charAt(0).toUpperCase()}</Text>
          </PressableScale>
        </Animated.View>

        {/* Quick actions */}
        {s && (
          <Animated.View entering={enter(1)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {s.can.onboard && <Action icon="add" label={s.workspace.roles.length === 1 && s.workspace.roles[0] === "host" ? "List a home" : "Onboard property"} href="/partner/property/new" primary />}
              {s.leads && <Action icon="people-outline" label="Leads" href="/leads" count={s.leads.new} />}
              {s.visits && <Action icon="walk-outline" label="Visits" href="/partner/visits" count={s.visits.upcoming} />}
              {s.can.calendar && <Action icon="calendar-number-outline" label="Calendar" href="/partner/calendar" />}
              {s.listings && <Action icon="camera-outline" label="360° tour" href="/listings" />}
              {s.can.clients && <Action icon="person-outline" label="Clients" href="/partner/clients" />}
            </ScrollView>
          </Animated.View>
        )}

        {/* Needs doing */}
        {s && <Todo s={s} />}

        {/* Numbers */}
        <Animated.View entering={enter(3)} style={{ paddingHorizontal: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text }}>Performance</Text>
            <View style={{ flexDirection: "row", backgroundColor: c.sand, borderRadius: radius.pill, padding: 3 }}>
              {RANGES.map(([key, label]) => (
                <PressableScale
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: range === key }}
                  onPress={() => {
                    tick();
                    setRange(key);
                  }}
                  style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: range === key ? c.surface : "transparent" }}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: range === key ? c.text : c.muted }}>{label}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
          {!d ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Skeleton height={104} style={{ flex: 1 }} rounded={radius.xl} />
              <Skeleton height={104} style={{ flex: 1 }} rounded={radius.xl} />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Metric label="Views" value={d.engagement.views.current} previous={d.engagement.views.previous} versus={d.range.previous} />
                {s?.leads ? <Metric label="New leads" value={d.leads.newInPeriod.current} previous={d.leads.newInPeriod.previous} versus={d.range.previous} /> : <Metric label="Saves" value={d.engagement.saves} />}
                <Metric label="Live listings" value={d.listings.live} detail={d.listings.pending ? `${d.listings.pending} in review` : d.listings.drafts ? `${d.listings.drafts} drafts` : undefined} href="/listings" />
                {s?.visits ? <Metric label="Visits done" value={d.visits.completedInPeriod} detail={d.visits.upcoming ? `${d.visits.upcoming} coming up` : undefined} href="/partner/visits" /> : <Metric label="Viewers" value={d.engagement.uniqueViewers} />}
              </View>
              <Bars series={d.series.views} label={`Views, ${d.range.label.toLowerCase()}`} />
              {s?.can.performance && <LinkRow icon="stats-chart-outline" label="Performance by listing" href="/partner/performance" />}
            </>
          )}
        </Animated.View>

        {/* Top listings */}
        {d && d.topListings.length > 0 && (
          <Animated.View entering={enter(4)} style={{ paddingHorizontal: 16, gap: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text }}>Most viewed</Text>
            <View style={{ borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
              {d.topListings.slice(0, 5).map((l, i) => (
                <PressableScale key={l.referenceId} scaleTo={0.99} accessibilityRole="link" onPress={() => router.push(`/partner/property/${l.referenceId}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 22, color: c.faint, width: 22 }}>{i + 1}</Text>
                  <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: c.text }} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Small>
                    {l.views} views{s?.leads ? ` · ${l.leads} leads` : ""}
                  </Small>
                </PressableScale>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Action({ icon, label, href, count, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; href: Href; count?: number; primary?: boolean }) {
  const c = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      onPress={() => router.push(href)}
      style={[{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 46, borderRadius: radius.pill, backgroundColor: primary ? c.brick : c.surface, borderWidth: primary ? 0 : 1, borderColor: c.line }, primary ? shadow.soft : null]}
    >
      <Ionicons name={icon} size={18} color={primary ? "#fff" : c.text} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: primary ? "#fff" : c.text }}>{label}</Text>
      {count ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: c.brick, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: "#fff" }}>{count}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

function Metric({ label, value, previous, versus, detail, href }: { label: string; value: number; previous?: number; versus?: string; detail?: string; href?: Href }) {
  const c = useColors();
  const change = previous === undefined ? null : previous === 0 ? (value > 0 ? null : 0) : Math.round(((value - previous) / previous) * 100);
  return (
    <PressableScale disabled={!href} accessibilityRole={href ? "link" : undefined} onPress={() => href && router.push(href)} style={{ width: "48%", flexGrow: 1, padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 2 }}>
      <Small>{label}</Small>
      <Text style={{ fontFamily: fonts.display, fontSize: 36, lineHeight: 40, color: c.text }}>{value.toLocaleString("en-IN")}</Text>
      {change !== null && change !== 0 ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: change > 0 ? c.sage : c.brick }}>
          {change > 0 ? "▲" : "▼"} {Math.abs(change)}% vs {versus?.toLowerCase() ?? "before"}
        </Text>
      ) : detail ? (
        <Small style={{ fontSize: 12 }}>{detail}</Small>
      ) : (
        <Small style={{ fontSize: 12 }}> </Small>
      )}
    </PressableScale>
  );
}

/** A small bar chart of a series (views per day or week). */
function Bars({ series, label }: { series: { bucket: string; count: number }[]; label: string }) {
  const c = useColors();
  if (series.length < 2) return null;
  const max = Math.max(1, ...series.map((p) => p.count));
  return (
    <View accessible accessibilityLabel={`${label}: ${series.reduce((n, p) => n + p.count, 0)} in all`} style={{ padding: 14, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, gap: 10 }}>
      <Small>{label}</Small>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, gap: series.length > 40 ? 1 : 3 }}>
        {series.map((p, i) => (
          <View key={p.bucket} style={{ flex: 1, height: `${Math.max((p.count / max) * 100, 3)}%`, borderRadius: 3, backgroundColor: i === series.length - 1 ? c.brick : p.count ? c.graphite : c.sand, opacity: i === series.length - 1 ? 1 : 0.55 }} />
        ))}
      </View>
    </View>
  );
}

function LinkRow({ icon, label, href }: { icon: keyof typeof Ionicons.glyphMap; label: string; href: Href }) {
  const c = useColors();
  return (
    <PressableScale accessibilityRole="link" onPress={() => router.push(href)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
      <Ionicons name={icon} size={18} color={c.brick} />
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 14, color: c.brick }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.brick} />
    </PressableScale>
  );
}

type Item = { key: string; icon: keyof typeof Ionicons.glyphMap; tone: string; title: string; detail?: string; badge?: { label: string; tone: "danger" | "warning" | "info" | "neutral" | "success" }; href: Href };

/** One list of what needs doing: booking requests, visits to confirm, new leads, listings sent back. */
function Todo({ s }: { s: PartnerSummary }) {
  const c = useColors();
  const { workspace } = useSession();
  const attention = useQuery({ queryKey: ["partner-dashboard", workspace, "30d"], queryFn: () => api<Dashboard>("/partner/dashboard?range=30d"), select: (d) => d.needsAttention });
  const items: Item[] = [
    ...(s.bookings?.requests ?? []).map((b) => ({
      key: b.referenceId,
      icon: "calendar" as const,
      tone: c.amber,
      title: `${b.guestName} wants to stay`,
      detail: `${b.listing.title} · ${formatDay(b.checkIn)} – ${formatDay(b.checkOut)} · ${nightsLabel(b.nights)} · ${formatPrice(b.total, { compact: false })}${b.expiresAt ? ` · answer by ${formatDateTime(b.expiresAt)}` : ""}`,
      href: `/partner/booking/${b.referenceId}` as Href,
    })),
    ...(s.visits?.next ?? [])
      .filter((v) => v.status === "requested")
      .map((v) => ({
        key: v.referenceId,
        icon: "walk" as const,
        tone: c.slate,
        title: `${v.contactName ?? "Someone"} asked for a visit`,
        detail: `${v.listingTitle ?? ""}${v.requestedFor ? ` · ${formatDateTime(v.requestedFor)}` : ""}`,
        badge: { label: "Needs a time", tone: "warning" as const },
        href: (v.leadReferenceId ? `/partner/lead/${v.leadReferenceId}` : "/partner/visits") as Href,
      })),
    ...(s.leads?.latest ?? []).map((l) => ({
      key: l.referenceId,
      icon: "person" as const,
      tone: c.brick,
      title: l.contactName,
      detail: `${l.listingTitle ?? "General enquiry"} · ${relativeTime(l.createdAt)}`,
      badge: { label: LEAD_STATUS_LABELS[l.status], tone: "danger" as const },
      href: `/partner/lead/${l.referenceId}` as Href,
    })),
    ...(attention.data ?? []).slice(0, 4).map((n) => ({
      key: n.referenceId,
      icon: "alert-circle" as const,
      tone: c.amber,
      title: n.title,
      detail: n.reason ?? undefined,
      badge: { label: n.status === "changes_requested" ? "Changes asked" : n.status === "rejected" ? "Rejected" : "Check", tone: STATUS_TONE[n.status] === "danger" ? ("danger" as const) : ("warning" as const) },
      href: `/partner/property/${n.referenceId}` as Href,
    })),
  ];
  const upcoming = (s.visits?.next ?? []).filter((v) => v.status !== "requested" && v.scheduledAt);

  return (
    <Animated.View entering={enter(2)} style={{ paddingHorizontal: 16, gap: 10 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text }}>{items.length ? "Needs you" : "All caught up"}</Text>
      {items.length === 0 ? (
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: radius.xl, backgroundColor: c.sageSoft }}>
          <Ionicons name="checkmark-done" size={22} color={c.sage} />
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.text }}>New leads, booking requests and messages show up here, and on your phone as notifications.</Text>
        </View>
      ) : (
        <View style={{ borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
          {items.map((it, i) => (
            <PressableScale key={it.key} scaleTo={0.99} accessibilityRole="link" onPress={() => router.push(it.href)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.paper, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={it.icon} size={18} color={it.tone} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: c.text }} numberOfLines={1}>
                  {it.title}
                </Text>
                {it.detail ? (
                  <Small numberOfLines={2} style={{ fontSize: 12 }}>
                    {it.detail}
                  </Small>
                ) : null}
              </View>
              {it.badge && <Badge label={it.badge.label} tone={it.badge.tone} />}
            </PressableScale>
          ))}
        </View>
      )}
      {upcoming.length > 0 && (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>Coming up</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {upcoming.map((v) => (
              <PressableScale key={v.referenceId} accessibilityRole="link" onPress={() => router.push(v.leadReferenceId ? `/partner/lead/${v.leadReferenceId}` : "/partner/visits")} style={{ width: 220, padding: 14, borderRadius: radius.xl, backgroundColor: c.contrast, gap: 4 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: c.onContrast, opacity: 0.7 }}>{formatDateTime(v.scheduledAt!)}</Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.onContrast }} numberOfLines={1}>
                  {v.contactName ?? "Visit"}
                </Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.onContrast, opacity: 0.8 }} numberOfLines={1}>
                  {v.listingTitle ?? ""}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  );
}

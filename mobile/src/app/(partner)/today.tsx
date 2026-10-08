import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { api } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { Badge, Body, Button, Card, Display, ErrorState, Eyebrow, Loading, Screen, Small, Title } from "@/components/ui";
import { LEAD_STATUS_LABELS } from "@/lib/crm/terms";
import { formatDateTime, formatDay, formatPrice, relativeTime } from "@/lib/format";
import { nightsLabel } from "@/lib/stays/labels";
import { fonts, useColors } from "@/theme";

function Stat({ label, value, href, tone }: { label: string; value: number; href: Href; tone?: "brick" }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${value} ${label}`} onPress={() => router.navigate(href)} style={{ width: "48%" }}>
      {({ pressed }) => (
        <Card style={{ opacity: pressed ? 0.8 : 1, gap: 2, padding: 14 }}>
          <Display size={34} style={{ color: tone === "brick" && value > 0 ? c.brick : c.text }}>
            {value}
          </Display>
          <Small tone="graphite">{label}</Small>
        </Card>
      )}
    </Pressable>
  );
}

function RowLink({ title, detail, meta, href }: { title: string; detail?: string; meta?: React.ReactNode; href: Href }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {title}
        </Body>
        {detail ? <Small numberOfLines={1}>{detail}</Small> : null}
      </View>
      {meta}
      <Ionicons name="chevron-forward" size={16} color={c.faint} />
    </Pressable>
  );
}

/** Partner mode's home: what needs doing today. */
export default function Today() {
  const c = useColors();
  const { me, workspace, switchMode } = useSession();
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary") });
  const spaces = me?.workspaces.filter((w) => w.kind === "professional") ?? [];

  if (summary.isPending) return <Loading />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const s = summary.data;
  const live = s.listings?.active ?? 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={summary.isRefetching} onRefresh={() => summary.refetch()} tintColor={c.brick} />}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Eyebrow tone="brick">Partner mode</Eyebrow>
            <Display size={30}>{s.workspace.type === "personal" ? (me?.user.name ?? "Today") : s.workspace.name}</Display>
            <Small>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</Small>
          </View>
          <Button
            label="Customer mode"
            variant="secondary"
            compact
            icon="swap-horizontal"
            onPress={async () => {
              await switchMode("customer");
              router.replace("/");
            }}
          />
        </View>
        {spaces.length > 1 && <Button label="Change workspace" variant="ghost" compact onPress={() => router.push("/workspaces")} />}

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
          {s.leads && <Stat label="new leads" value={s.leads.new} href="/leads" tone="brick" />}
          {s.visits && <Stat label="upcoming visits" value={s.visits.upcoming} href="/leads" />}
          {s.bookings && (s.bookings.counts.all > 0 || s.inbox) && <Stat label="booking requests" value={s.bookings.counts.requests} href="/bookings" tone="brick" />}
          {s.inbox && <Stat label="unread messages" value={s.inbox.unread} href="/inbox" tone="brick" />}
          {s.listings && <Stat label={live === 1 ? "live listing" : "live listings"} value={live} href="/listings" />}
          {s.bookings && s.bookings.counts.upcoming > 0 && <Stat label="upcoming stays" value={s.bookings.counts.upcoming} href="/bookings" />}
        </View>

        {s.bookings && s.bookings.requests.length > 0 && (
          <Card style={{ gap: 0 }}>
            <Title>Booking requests</Title>
            {s.bookings.requests.map((b) => (
              <RowLink
                key={b.referenceId}
                href={`/partner/booking/${b.referenceId}`}
                title={`${b.guestName} · ${b.listing.title}`}
                detail={`${formatDay(b.checkIn)} – ${formatDay(b.checkOut)} · ${nightsLabel(b.nights)} · ${formatPrice(b.total, { compact: false })}`}
                meta={b.expiresAt ? <Small tone="amber">answer by {formatDateTime(b.expiresAt)}</Small> : undefined}
              />
            ))}
          </Card>
        )}

        {s.visits && s.visits.next.length > 0 && (
          <Card style={{ gap: 0 }}>
            <Title>Visits</Title>
            {s.visits.next.map((v) => (
              <RowLink
                key={v.referenceId}
                href={v.leadReferenceId ? `/partner/lead/${v.leadReferenceId}` : "/leads"}
                title={`${v.contactName ?? "Visit"} · ${v.listingTitle ?? ""}`}
                detail={v.scheduledAt ? `Confirmed for ${formatDateTime(v.scheduledAt)}` : v.requestedFor ? `Asked for ${formatDateTime(v.requestedFor)}` : undefined}
                meta={v.status === "requested" ? <Badge label="Needs a time" tone="warning" /> : undefined}
              />
            ))}
          </Card>
        )}

        {s.leads && s.leads.latest.length > 0 && (
          <Card style={{ gap: 0 }}>
            <Title>New leads</Title>
            {s.leads.latest.map((l) => (
              <RowLink
                key={l.referenceId}
                href={`/partner/lead/${l.referenceId}`}
                title={l.contactName}
                detail={`${l.listingTitle ?? "General enquiry"} · ${relativeTime(l.createdAt)}`}
                meta={<Badge label={LEAD_STATUS_LABELS[l.status]} tone="danger" />}
              />
            ))}
          </Card>
        )}

        {!s.leads?.new && !s.bookings?.counts.requests && !s.inbox?.unread && !s.visits?.upcoming && (
          <Card>
            <Title>All caught up</Title>
            <Body tone="graphite">New leads, booking requests and messages show up here, and on your phone as notifications.</Body>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

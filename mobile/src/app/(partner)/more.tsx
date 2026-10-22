import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { api } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { PressableScale, enter } from "@/components/motion";
import { useTabBarSpace } from "@/components/tab-bar";
import { Screen, Small } from "@/components/ui";
import { fonts, radius, useColors } from "@/theme";

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; href?: Href; onPress?: () => void; badge?: number };

/** Everything else in the workspace, as the website's sidebar: the day's other work, the business side, and switching. */
export default function More() {
  const c = useColors();
  const space = useTabBarSpace();
  const { me, workspace, switchMode } = useSession();
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary") });
  const s = summary.data;
  const spaces = me?.workspaces.filter((w) => w.kind === "professional") ?? [];
  const hasBookings = Boolean(s?.bookings && (s.bookings.counts.all > 0 || s.inbox));
  const inboxInMore = Boolean(s?.inbox) && Boolean(s?.leads && hasBookings);

  const groups: { title: string; rows: (Row | false | undefined | null)[] }[] = [
    {
      title: "Work",
      rows: [
        s?.can.onboard && { icon: "add-circle-outline", label: "Onboard a property", href: "/partner/property/new" },
        s?.visits && { icon: "walk-outline", label: "Visits", detail: s.visits.upcoming ? `${s.visits.upcoming} coming up` : undefined, href: "/partner/visits" },
        s?.can.clients && { icon: "person-outline", label: "Clients", detail: "Everyone who's enquired", href: "/partner/clients" },
        s?.can.calendar && { icon: "calendar-number-outline", label: "Calendar", detail: "Block nights, set special prices", href: "/partner/calendar" },
        inboxInMore && { icon: "chatbubbles-outline", label: "Messages", href: "/inbox", badge: s?.inbox?.unread },
        s?.can.team && { icon: "id-card-outline", label: "Agents", detail: "Your organization's team", href: "/partner/team" },
      ],
    },
    {
      title: "Business",
      rows: [
        s?.can.performance && { icon: "stats-chart-outline", label: "Performance", detail: "Views, leads and visits by listing", href: "/partner/performance" },
        s?.can.commission && { icon: "cash-outline", label: "Commission", detail: "Rates, terms and what's due", href: "/partner/commission" },
        s?.can.subscription && { icon: "sparkles-outline", label: "Subscription", detail: "Your partner plan", href: "/partner/subscription" },
      ],
    },
    {
      title: "Account",
      rows: [{ icon: "shield-checkmark-outline", label: "Profile & security", detail: "Password, devices and notifications", href: "/security" }],
    },
    {
      title: "Help",
      rows: [{ icon: "cube-outline", label: "Making a 3D model", href: "/partner/model-guide" }],
    },
    {
      title: "Switch",
      rows: [
        spaces.length > 1 && { icon: "swap-vertical-outline", label: "Change workspace", detail: s?.workspace.name, href: "/workspaces" },
        {
          icon: "home-outline",
          label: "Customer mode",
          detail: "Browse, save and book as a customer",
          onPress: async () => {
            await switchMode("customer");
            router.replace("/");
          },
        },
      ],
    },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: space, gap: 22 }}>
        <Animated.View entering={enter(0)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.brickSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: c.brick }}>{(me?.user.name ?? "T").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: c.text }} numberOfLines={1}>
              {me?.user.name ?? "Workspace"}
            </Text>
            <Small numberOfLines={1}>{s ? (s.workspace.type === "personal" ? "Independent" : s.workspace.name) : " "}</Small>
          </View>
        </Animated.View>

        {groups.map((g, gi) => {
          const rows = g.rows.filter(Boolean) as Row[];
          if (!rows.length) return null;
          return (
            <Animated.View key={g.title} entering={enter(gi + 1)} style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: c.muted, paddingHorizontal: 4 }}>{g.title}</Text>
              <View style={{ borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
                {rows.map((r, i) => (
                  <PressableScale
                    key={r.label}
                    scaleTo={0.99}
                    accessibilityRole={r.href ? "link" : "button"}
                    onPress={() => (r.onPress ? r.onPress() : r.href && router.push(r.href))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
                  >
                    <Ionicons name={r.icon} size={21} color={c.graphite} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: c.text }}>{r.label}</Text>
                      {r.detail ? <Small numberOfLines={1}>{r.detail}</Small> : null}
                    </View>
                    {r.badge ? (
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.brick, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: "#fff" }}>{r.badge}</Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={c.faint} />
                  </PressableScale>
                ))}
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

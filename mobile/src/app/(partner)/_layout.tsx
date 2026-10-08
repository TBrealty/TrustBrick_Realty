import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { api } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { fonts, useColors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;
function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color} />;
  };
}

/**
 * Partner mode: an agent's or host's work. Tabs their role doesn't cover are hidden (an agent
 * without stays sees no Bookings; a host without leads, no Leads).
 */
export default function PartnerLayout() {
  const c = useColors();
  const { mode, status, workspace } = useSession();
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary"), enabled: mode === "partner" && status === "signedIn", refetchInterval: 60_000 });
  if (status !== "signedIn" || mode !== "partner") return <Redirect href="/" />;
  const s = summary.data;
  const hasBookings = Boolean(s?.bookings && (s.bookings.counts.all > 0 || s.inbox));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brick,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today", tabBarIcon: icon("today-outline", "today") }} />
      <Tabs.Screen name="leads" options={{ title: "Leads", tabBarIcon: icon("people-outline", "people"), href: s?.leads ? undefined : null, tabBarBadge: s?.leads?.new || undefined }} />
      <Tabs.Screen
        name="bookings"
        options={{ title: "Bookings", tabBarIcon: icon("calendar-outline", "calendar"), href: hasBookings ? undefined : null, tabBarBadge: s?.bookings?.counts.requests || undefined }}
      />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("chatbubbles-outline", "chatbubbles"), href: s?.inbox ? undefined : null, tabBarBadge: s?.inbox?.unread || undefined }} />
      <Tabs.Screen name="listings" options={{ title: "Listings", tabBarIcon: icon("business-outline", "business"), href: s?.listings ? undefined : null }} />
    </Tabs>
  );
}

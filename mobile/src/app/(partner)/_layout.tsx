import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { api } from "@/api/client";
import type { PartnerSummary } from "@/api/types";
import { useSession } from "@/auth/session";
import { FloatingTabBar } from "@/components/tab-bar";

type IconName = keyof typeof Ionicons.glyphMap;
function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color} />;
  };
}

/**
 * Partner mode: an agent's, broker's or host's workspace, on the same floating tab bar as the
 * customer side. Today and Properties for everyone; Leads for agents, Bookings and Messages for
 * hosts (someone doing both finds Messages under More); everything else under More.
 */
export default function PartnerLayout() {
  const { mode, status, workspace } = useSession();
  const summary = useQuery({ queryKey: ["partner-summary", workspace], queryFn: () => api<PartnerSummary>("/partner/summary"), enabled: mode === "partner" && status === "signedIn", refetchInterval: 60_000 });
  if (status !== "signedIn" || mode !== "partner") return <Redirect href="/" />;
  const s = summary.data;
  const hasBookings = Boolean(s?.bookings && (s.bookings.counts.all > 0 || s.inbox));
  const inboxTab = Boolean(s?.inbox) && !(s?.leads && hasBookings);
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, animation: "shift" }}>
      <Tabs.Screen name="today" options={{ title: "Today", tabBarIcon: icon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="listings" options={{ title: "Properties", tabBarIcon: icon("business-outline", "business"), href: s && !s.listings ? null : undefined }} />
      <Tabs.Screen name="leads" options={{ title: "Leads", tabBarIcon: icon("people-outline", "people"), href: s?.leads ? undefined : null, tabBarBadge: s?.leads?.new || undefined }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("calendar-outline", "calendar"), href: hasBookings ? undefined : null, tabBarBadge: s?.bookings?.counts.requests || undefined }} />
      <Tabs.Screen name="inbox" options={{ title: "Messages", tabBarIcon: icon("chatbubbles-outline", "chatbubbles"), href: inboxTab ? undefined : null, tabBarBadge: s?.inbox?.unread || undefined }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("grid-outline", "grid"), tabBarBadge: !inboxTab && s?.inbox?.unread ? s.inbox.unread : undefined }} />
    </Tabs>
  );
}

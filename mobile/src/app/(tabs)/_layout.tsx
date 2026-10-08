import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useSession } from "@/auth/session";
import { fonts, useColors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;
function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color} />;
  };
}

/** Explore, Saved, Messages, Alerts and Account, as tabs along the bottom. */
export default function TabsLayout() {
  const c = useColors();
  const { me, mode } = useSession();
  // Partner mode opens on its own tabs; switching back to customer mode returns here.
  if (mode === "partner") return <Redirect href="/today" />;
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
      <Tabs.Screen name="index" options={{ title: "Explore", tabBarIcon: icon("search-outline", "search") }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: icon("heart-outline", "heart") }} />
      <Tabs.Screen
        name="messages"
        options={{ title: "Messages", tabBarIcon: icon("chatbubbles-outline", "chatbubbles"), tabBarBadge: me?.unreadMessages ? me.unreadMessages : undefined }}
      />
      <Tabs.Screen
        name="alerts"
        options={{ title: "Alerts", tabBarIcon: icon("notifications-outline", "notifications"), tabBarBadge: me?.unreadNotifications ? me.unreadNotifications : undefined }}
      />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-circle-outline", "person-circle") }} />
    </Tabs>
  );
}

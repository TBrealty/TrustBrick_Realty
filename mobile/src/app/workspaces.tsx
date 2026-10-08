import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSession } from "@/auth/session";
import { Body, Card, Scroll, Small } from "@/components/ui";
import { useColors } from "@/theme";

const ROLE_LABELS: Record<string, string> = { broker_admin: "Broker admin", team_lead: "Team lead", agent: "Agent", host: "Host" };

/** For someone in more than one organization: which one partner mode works in. */
export default function Workspaces() {
  const c = useColors();
  const { me, switchMode, workspace } = useSession();
  const spaces = me?.workspaces.filter((w) => w.kind === "professional") ?? [];
  return (
    <Scroll>
      <Body tone="graphite">Choose where you&apos;re working. You can switch any time from the Today screen.</Body>
      {spaces.map((w) => (
        <Pressable
          key={w.membershipId}
          accessibilityRole="button"
          accessibilityState={{ selected: workspace === w.membershipId }}
          onPress={async () => {
            await switchMode("partner", w.membershipId);
            router.dismissAll();
            router.replace("/today");
          }}
        >
          {({ pressed }) => (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.8 : 1, borderColor: workspace === w.membershipId ? c.brick : c.line }}>
              <Ionicons name={w.organization.type === "personal" ? "person-outline" : "business-outline"} size={22} color={c.graphite} />
              <View style={{ flex: 1 }}>
                <Body>{w.organization.type === "personal" ? "On my own" : w.organization.name}</Body>
                <Small>{w.roles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</Small>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.faint} />
            </Card>
          )}
        </Pressable>
      ))}
    </Scroll>
  );
}

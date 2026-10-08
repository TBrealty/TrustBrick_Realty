import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { View } from "react-native";
import { Button, EmptyState } from "@/components/ui";

/** What a tab that needs an account shows to someone signed out. */
export function SignedOut({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      action={
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Button label="Sign in" compact onPress={() => router.push("/sign-in")} />
          <Button label="Create an account" variant="secondary" compact onPress={() => router.push("/sign-up")} />
        </View>
      }
    >
      {children}
    </EmptyState>
  );
}

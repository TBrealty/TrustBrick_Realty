import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { useSession } from "@/auth/session";
import { SignedOut } from "@/components/signed-out";
import { useTabBarSpace } from "@/components/tab-bar";
import { Badge, Body, Button, Card, Display, Divider, Eyebrow, Loading, Screen, Scroll, Small, Title } from "@/components/ui";
import { API_ORIGIN } from "@/config";
import { confirm } from "@/confirm";
import { formatDay } from "@/lib/format";
import { STATE_LABELS } from "@/lib/subscriptions/terms";
import { useColors } from "@/theme";

function Row({ icon, label, onPress, detail }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; detail?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={20} color={c.graphite} />
      <Body style={{ flex: 1 }}>{label}</Body>
      {detail ? <Small>{detail}</Small> : null}
      <Ionicons name="chevron-forward" size={18} color={c.faint} />
    </Pressable>
  );
}

/** The person's account: their plan, their stays, and settings. */
export default function Account() {
  const { status, me, signOut, switchMode } = useSession();
  const go = (href: Href) => () => router.push(href);
  const space = useTabBarSpace();

  if (status === "loading") return <Loading />;
  if (status !== "signedIn") {
    return (
      <Screen>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Display size={32}>Account</Display>
        </View>
        <SignedOut icon="person-circle-outline" title="Welcome to Trustbrick">
          Sign in to save homes, contact agents, book stays and open virtual tours.
        </SignedOut>
      </Screen>
    );
  }
  if (!me) return <Loading />;
  const sub = me.plan.subscription;
  const partnerSpaces = me.workspaces.filter((w) => w.kind === "professional");
  const label = sub ? STATE_LABELS[sub.state] : null;

  return (
    <Screen>
      <Scroll contentContainerStyle={{ paddingBottom: space }}>
        <View style={{ gap: 4 }}>
          <Eyebrow>{me.user.referenceId}</Eyebrow>
          <Display size={32}>{me.user.name}</Display>
          <Small>{me.user.email}</Small>
        </View>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Title>Trustbrick {me.plan.name}</Title>
            {label && <Badge label={label.label} tone={label.tone} />}
          </View>
          <Body tone="graphite">
            {me.plan.code === "customer_free"
              ? me.plan.trialAvailable
                ? "Try Plus free for 14 days: virtual tours and 3D views, and more coming."
                : "Plus adds virtual tours and 3D views."
              : sub?.state === "trialing" && sub.trialEndsAt
                ? `Free trial until ${formatDay(sub.trialEndsAt)}.`
                : sub?.currentPeriodEnd
                  ? `Paid until ${formatDay(sub.currentPeriodEnd)}.`
                  : "Your plan is active."}
          </Body>
          <Button label={me.plan.code === "customer_free" ? "See Plus" : "Manage plan"} variant={me.plan.code === "customer_free" ? "accent" : "secondary"} compact onPress={go("/plans")} />
        </Card>

        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Row icon="bed-outline" label="Your stays" onPress={go("/trips")} />
          <Divider />
          <Row icon="chatbubbles-outline" label="Messages" detail={me.unreadMessages ? `${me.unreadMessages} new` : undefined} onPress={() => router.navigate("/messages")} />
          <Divider />
          <Row icon="heart-outline" label="Saved homes" onPress={() => router.navigate("/saved")} />
          <Divider />
          <Row icon="globe-outline" label="Profile and settings on the website" onPress={() => Linking.openURL(`${API_ORIGIN}/account/profile`)} />
        </Card>

        {partnerSpaces.length > 0 && (
          <Card>
            <Title>Agent and host tools</Title>
            <Body tone="graphite">
              Your leads, visits, bookings, guest messages and listings, and recording virtual tours on site.
            </Body>
            <Button
              label="Switch to partner mode"
              icon="briefcase-outline"
              compact
              onPress={async () => {
                if (partnerSpaces.length === 1) {
                  await switchMode("partner", partnerSpaces[0].membershipId);
                  router.replace("/today");
                } else router.push("/workspaces");
              }}
            />
          </Card>
        )}
        {me.workspaces.some((w) => w.kind === "platform") && (
          <Card>
            <Title>Trustbrick team</Title>
            <Body tone="graphite">Approvals and admin work happen on the website.</Body>
            <Button label="Open the workspace" variant="secondary" compact onPress={() => Linking.openURL(`${API_ORIGIN}/dashboard`)} />
          </Card>
        )}

        <Button
          label="Sign out"
          variant="danger"
          onPress={async () => {
            if (await confirm("Sign out?", "You'll stop getting notifications on this phone.", "Sign out")) await signOut();
          }}
        />
      </Scroll>
    </Screen>
  );
}

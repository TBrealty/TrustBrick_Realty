import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { enter } from "@/components/motion";
import { Body, Card, Display, Eyebrow, Notice, Scroll, Small, Title } from "@/components/ui";
import { useColors } from "@/theme";

type Way = { icon: keyof typeof Ionicons.glyphMap; title: string; who: string; steps: string[]; note?: string };

const WAYS: Way[] = [
  {
    icon: "phone-portrait-outline",
    title: "Scan it with an iPhone Pro or iPad Pro",
    who: "Best on a phone: these have a depth sensor (LiDAR), so walls and rooms come out right.",
    steps: [
      "Install a free scanning app: Polycam or Scaniverse.",
      "Choose its room or LiDAR mode. Switch the lights on.",
      "Walk slowly round the room, pointing at the walls, then the floor and ceiling edges. Go back over anything it missed.",
      "Let it process, then export as GLB (binary glTF). Pick medium detail to keep it under 100 MB.",
      "Save it to Files, then come back here and tap Add a 3D model.",
    ],
  },
  {
    icon: "camera-outline",
    title: "Photo-scan it with any other phone",
    who: "Android phones and older iPhones: the app builds the model from many photos.",
    steps: [
      "Use a photo-scanning app such as Polycam (photo mode) or KIRI Engine.",
      "Take 50 to 200 photos walking round, overlapping each one with the last.",
      "Export as GLB and add it here.",
    ],
    note: "Plain white walls and glass give it little to go on, so whole rooms can come out patchy. It suits a furnished room, a kitchen or a feature better than an empty flat.",
  },
  {
    icon: "business-outline",
    title: "Get it from the architect or builder",
    who: "New projects: there's usually a 3D model of the show flat already.",
    steps: [
      "Ask for the model in glTF Binary (.glb) format. SketchUp, Blender, Revit and 3ds Max can all export it.",
      "Ask for it with materials and textures, and under 100 MB.",
      "Add it here, or on the website from the listing's tour.",
    ],
  },
];

/** How an agent gets a 3D model (.glb) of a home for its virtual tour. */
export default function ModelGuide() {
  const c = useColors();
  return (
    <Scroll>
      <Animated.View entering={enter(0)} style={{ gap: 8 }}>
        <Eyebrow tone="brick">Virtual tour</Eyebrow>
        <Display size={32}>Making a 3D model of a home</Display>
        <Body tone="graphite">
          A 3D model lets customers turn the home around like a dollhouse. It&apos;s optional: 360° photos of each room matter most, and you can take those with this phone.
        </Body>
      </Animated.View>

      {WAYS.map((way, i) => (
        <Animated.View key={way.title} entering={enter(i + 1)}>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brickSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={way.icon} size={20} color={c.brick} />
              </View>
              <Title style={{ flex: 1 }}>{way.title}</Title>
            </View>
            <Small tone="graphite">{way.who}</Small>
            <View style={{ gap: 8 }}>
              {way.steps.map((step, n) => (
                <View key={step} style={{ flexDirection: "row", gap: 10 }}>
                  <Small style={{ width: 18, fontVariant: ["tabular-nums"] }}>{n + 1}.</Small>
                  <Body style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{step}</Body>
                </View>
              ))}
            </View>
            {way.note && <Small>{way.note}</Small>}
          </Card>
        </Animated.View>
      ))}

      <Animated.View entering={enter(4)} style={{ gap: 10 }}>
        <Title>Before you add it</Title>
        {[
          "One model per listing: the whole home, or its best room.",
          "The file must be .glb and under 100 MB.",
          "On a live listing, it shows straight away and Trustbrick checks it after.",
        ].map((tip) => (
          <View key={tip} style={{ flexDirection: "row", gap: 10 }}>
            <Ionicons name="checkmark-circle" size={18} color={c.sage} />
            <Body style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{tip}</Body>
          </View>
        ))}
        <Notice tone="info">Already have a Matterport, Kuula or CloudPano tour? Paste its link under Hosted 3D tour instead; it opens inside Trustbrick&apos;s viewer.</Notice>
      </Animated.View>
    </Scroll>
  );
}

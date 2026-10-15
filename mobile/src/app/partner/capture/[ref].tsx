import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Directory, File, Paths } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { DeviceMotion } from "expo-sensors";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CAPTURE_PLAN, type Mat, angleBetween, cameraAngles, cameraForward, direction, focalFor, hint, portraitFov, project, rotationMatrix, wrapYaw } from "@/capture/geometry";
import { PressableScale, thud, tick } from "@/components/motion";
import { confirm } from "@/confirm";
import { fonts, palette, radius } from "@/theme";
import { enqueueCapture } from "@/uploads/queue";

/** Close enough to the target to take the photo, in degrees (straight up and down are looser). */
const TOLERANCE = 4;
const POLE_TOLERANCE = 7;
/** How long to hold still on a target before the photo is taken. */
const HOLD_MS = 900;
/** Turning slower than this (degrees a second) counts as holding still. */
const STEADY = 12;
const ROOM_NAMES = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Balcony", "Hall", "Dining", "Study"];
const RING = 72;
const DOT = 26;

type Shot = { uri: string; yaw: number; pitch: number; roll: number };
const dark = palette.dark;

/** DeviceMotion gives radians; some Android builds have given degrees. Upright, beta is ~1.57 rad or ~90°. */
const toRadians = (v: number, inDegrees: boolean) => (inDegrees ? (v * Math.PI) / 180 : v);

/**
 * Taking a 360° photo of a room with the phone's own camera. A dot shows where to point next;
 * line it up in the circle, hold still for a moment, and the photo is taken. 30 photos (all the
 * way round, above, below, the ceiling and the floor) are sent to Trustbrick, which joins them
 * into one 360° photo for the listing's virtual tour.
 */
export default function CaptureScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<"intro" | "capturing" | "saving">("intro");
  const [roomName, setRoomName] = useState("");
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("Hold the phone upright at chest height");
  const [motionMissing, setMotionMissing] = useState(false);

  const camera = useRef<CameraView>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const ready = useRef(false);
  const shots = useRef<Shot[]>([]);
  const hfov = useRef(53);
  const [fov, setFov] = useState(53);
  const room = useRef("");
  const session = useRef<Directory | null>(null);
  const rotation = useRef<Mat | null>(null);
  const inDegrees = useRef<boolean | null>(null);
  const baseYaw = useRef<number | null>(null);
  const holdSince = useRef<number | null>(null);
  const busy = useRef(false);
  const indexRef = useRef(0);
  const lastMessage = useRef("");

  // On-screen guide, moved on the UI thread.
  const dotX = useSharedValue(0);
  const dotY = useSharedValue(0);
  const dotShown = useSharedValue(0);
  const arrowAngle = useSharedValue(0);
  const arrowShown = useSharedValue(0);
  const progress = useSharedValue(0);
  const flash = useSharedValue(0);

  // The preview fills the screen's height at 3:4, so it shows a little less than the photo's width.
  const previewWidth = Math.max(width, (height * 3) / 4);
  const focal = focalFor(fov, previewWidth);

  const say = (text: string) => {
    if (text !== lastMessage.current) {
      lastMessage.current = text;
      setMessage(text);
    }
  };

  const takePhoto = useCallback(async () => {
    if (busy.current || !camera.current || !ready.current || !rotation.current || baseYaw.current === null) return;
    busy.current = true;
    const at = cameraAngles(rotation.current);
    try {
      const first = shots.current.length === 0;
      const photo = await camera.current.takePictureAsync({ quality: 0.85, exif: first, shutterSound: false });
      if (first) {
        const exif = (photo.exif ?? {}) as Record<string, unknown>;
        hfov.current = portraitFov(Number(exif.FocalLengthIn35mmFilm ?? exif.FocalLenIn35mmFilm) || null);
        setFov(hfov.current);
      }
      const target = CAPTURE_PLAN[indexRef.current];
      const file = new File(session.current!, `${String(indexRef.current).padStart(3, "0")}.jpg`);
      new File(photo.uri).move(file);
      shots.current[indexRef.current] = {
        uri: file.uri,
        // At the poles the compass direction means little; the plan's own yaw keeps the order.
        yaw: target.row === "zenith" || target.row === "nadir" ? target.yaw : wrapYaw(at.yaw - baseYaw.current),
        pitch: at.pitch,
        roll: target.row === "zenith" || target.row === "nadir" ? 0 : at.roll,
      };
      thud();
      flash.set(withSequence(withTiming(0.55, { duration: 60 }), withTiming(0, { duration: 260 })));
      indexRef.current += 1;
      setIndex(indexRef.current);
      if (indexRef.current >= CAPTURE_PLAN.length) void complete();
    } catch {
      say("That photo didn't take. Hold still and try again.");
    } finally {
      holdSince.current = null;
      progress.set(0);
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, progress]);

  // Follow the phone's movement while capturing: guide towards the next target, take the photo when steady on it.
  useEffect(() => {
    if (phase !== "capturing") return;
    DeviceMotion.setUpdateInterval(33);
    const sub = DeviceMotion.addListener((m) => {
      if (!m.rotation) return;
      const { alpha, beta, gamma } = m.rotation;
      inDegrees.current ??= Math.abs(beta) > 6.3 || Math.abs(gamma) > 6.3 || Math.abs(alpha) > 6.3;
      const r = rotationMatrix(toRadians(alpha, inDegrees.current), toRadians(beta, inDegrees.current), toRadians(gamma, inDegrees.current));
      rotation.current = r;
      // "Straight ahead" is wherever the agent faces when they start.
      baseYaw.current ??= cameraAngles(r).yaw;
      const target = CAPTURE_PLAN[indexRef.current];
      if (!target) return;

      const goal = direction(target.yaw + baseYaw.current, target.pitch);
      const onScreen = project(r, goal, focal);
      if (onScreen.onScreen && Math.abs(onScreen.x) < width / 2 - 24 && Math.abs(onScreen.y) < height / 2 - 80) {
        dotX.set(onScreen.x);
        dotY.set(onScreen.y);
        dotShown.set(1);
        arrowShown.set(0);
      } else {
        dotShown.set(0);
        arrowAngle.set(onScreen.angle);
        arrowShown.set(1);
      }

      const off = angleBetween(cameraForward(r), goal);
      const spin = m.rotationRate ? Math.hypot(m.rotationRate.alpha, m.rotationRate.beta, m.rotationRate.gamma) : 0;
      const tolerance = target.row === "zenith" || target.row === "nadir" ? POLE_TOLERANCE : TOLERANCE;
      if (off < tolerance && spin < STEADY) {
        const now = Date.now();
        holdSince.current ??= now;
        const held = (now - holdSince.current) / HOLD_MS;
        progress.set(Math.min(held, 1));
        say("Hold still…");
        if (held >= 1) void takePhoto();
      } else {
        if (holdSince.current !== null) tick();
        holdSince.current = null;
        progress.set(0);
        say(off < tolerance ? "Hold still…" : hint(r, target, baseYaw.current));
      }
    });
    return () => sub.remove();
  }, [phase, focal, width, height, takePhoto, dotX, dotY, dotShown, arrowAngle, arrowShown, progress]);

  // All photos taken: hand them to the upload queue (it keeps them through closing the app and losing signal).
  async function complete() {
    if (!session.current) return;
    setPhase("saving");
    const folder = session.current.uri;
    session.current = null;
    await enqueueCapture(ref, { roomName: room.current, hfov: hfov.current, shots: shots.current.filter(Boolean), folder });
    router.back();
  }

  // Leaving without finishing deletes what was taken.
  useEffect(
    () => () => {
      try {
        session.current?.delete();
      } catch {}
    },
    [],
  );

  const start = async () => {
    const motion = await DeviceMotion.isAvailableAsync().catch(() => false);
    if (!motion) return setMotionMissing(true);
    if (!permission?.granted) {
      const answer = await requestPermission();
      if (!answer.granted) return;
    }
    const dir = new Directory(Paths.document, "captures", `${Date.now()}`);
    dir.create({ intermediates: true, idempotent: true });
    session.current = dir;
    shots.current = [];
    room.current = roomName.trim();
    indexRef.current = 0;
    baseYaw.current = null;
    setIndex(0);
    setPhase("capturing");
  };

  const undo = () => {
    if (indexRef.current === 0 || busy.current) return;
    indexRef.current -= 1;
    const removed = shots.current.pop();
    try {
      if (removed) new File(removed.uri).delete();
    } catch {}
    setIndex(indexRef.current);
  };

  /** Straight up or down can be awkward (a fan, a low ceiling); skipping leaves a small patch to fill. */
  const skipPole = () => {
    const target = CAPTURE_PLAN[indexRef.current];
    if (!target || (target.row !== "zenith" && target.row !== "nadir")) return;
    indexRef.current = CAPTURE_PLAN.length;
    setIndex(indexRef.current);
    void complete();
  };

  const close = async () => {
    if (phase === "capturing" && indexRef.current > 0 && !(await confirm("Stop taking this room?", "The photos taken so far are deleted.", "Stop"))) return;
    router.back();
  };

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotShown.value, transform: [{ translateX: dotX.value }, { translateY: dotY.value }] }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: arrowShown.value, transform: [{ rotate: `${arrowAngle.value}rad` }, { translateX: 110 }] }));
  const ringFill = useAnimatedStyle(() => ({ transform: [{ scale: 0.35 + progress.value * 0.65 }], opacity: progress.value > 0 ? 0.9 : 0 }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  if (phase === "intro") {
    return (
      <View style={{ flex: 1, backgroundColor: dark.background, paddingTop: insets.top }}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ alignSelf: "flex-start", padding: 6, marginLeft: -6 }}>
            <Ionicons name="close" size={26} color={dark.text} />
          </PressableScale>
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: dark.brick }}>360° photo</Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 42, color: dark.text }}>Photograph a room, all the way round</Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: dark.graphite }}>
              Follow the dot: about 30 photos, a minute or two. Trustbrick joins them into one 360° photo for the tour.
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: dark.text }}>Which room?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ROOM_NAMES.map((name) => (
                <PressableScale
                  key={name}
                  haptic
                  accessibilityRole="button"
                  accessibilityState={{ selected: roomName === name }}
                  onPress={() => setRoomName(name)}
                  style={{ paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: radius.pill, backgroundColor: roomName === name ? dark.text : dark.surface, borderWidth: 1, borderColor: dark.line }}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: roomName === name ? dark.background : dark.text }}>{name}</Text>
                </PressableScale>
              ))}
            </View>
            <TextInput
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Or type a name, like Master bedroom"
              placeholderTextColor={dark.faint}
              maxLength={40}
              accessibilityLabel="Room name"
              style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: dark.text }}
            />
          </View>

          <View style={{ gap: 12, padding: 16, borderRadius: radius.xl, backgroundColor: dark.surface }}>
            {[
              ["locate-outline", "Stand in the middle of the room, and stay on that spot throughout."],
              ["phone-portrait-outline", "Hold the phone upright at chest height. Turn yourself around the phone, not the phone around you."],
              ["sunny-outline", "Switch the lights on and open the curtains. Ask people to step out of the room."],
              ["hand-left-outline", "Line the dot up in the circle and hold still: the photo takes itself."],
            ].map(([icon, text]) => (
              <View key={text} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={dark.brick} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: dark.graphite }}>{text}</Text>
              </View>
            ))}
          </View>

          {motionMissing && <Text style={{ fontFamily: fonts.body, fontSize: 14, color: dark.brick }}>This phone has no motion sensor, so it can&apos;t guide the photos. Use a 360° camera and add its photos instead.</Text>}
          {permission && !permission.granted && !permission.canAskAgain && (
            <PressableScale onPress={() => Linking.openSettings()}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: dark.brick }}>Camera access is off for Trustbrick. Turn it on in Settings.</Text>
            </PressableScale>
          )}
          <PressableScale
            haptic
            accessibilityRole="button"
            disabled={!roomName.trim()}
            onPress={start}
            style={{ height: 56, borderRadius: radius.pill, backgroundColor: roomName.trim() ? dark.brick : dark.sand, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
          >
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: "#fff" }}>{roomName.trim() ? "Start" : "Name the room to start"}</Text>
          </PressableScale>
        </ScrollView>
      </View>
    );
  }

  const target = CAPTURE_PLAN[Math.min(index, CAPTURE_PLAN.length - 1)];
  const atPole = target.row === "zenith" || target.row === "nadir";
  const rows = (["middle", "up", "down"] as const).map((row) => ({ row, total: CAPTURE_PLAN.filter((t) => t.row === row).length, done: CAPTURE_PLAN.slice(0, index).filter((t) => t.row === row).length }));

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        ratio="4:3"
        pictureSize={pictureSize}
        animateShutter={false}
        onCameraReady={async () => {
          ready.current = true;
          if (pictureSize) return;
          // About 2000 pixels on the long side: plenty for the panorama, and quick to send.
          const sizes = (await camera.current?.getAvailablePictureSizesAsync().catch(() => [])) ?? [];
          const fourThree = sizes
            .map((s) => ({ s, w: Number(s.split("x")[0]), h: Number(s.split("x")[1]) }))
            .filter((x) => x.w && x.h && Math.abs(Math.max(x.w, x.h) / Math.min(x.w, x.h) - 4 / 3) < 0.02);
          const best = fourThree.sort((a, b) => Math.abs(Math.max(a.w, a.h) - 2000) - Math.abs(Math.max(b.w, b.h) - 2000))[0];
          if (best) setPictureSize(best.s);
        }}
      />

      {/* The circle to line up in, and the dot to line up */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" }}>
          <Animated.View style={[{ width: RING - 12, height: RING - 12, borderRadius: (RING - 12) / 2, backgroundColor: dark.brick }, ringFill]} />
        </View>
        <Animated.View style={[{ position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: "#ffffff", borderWidth: 4, borderColor: dark.brick }, dotStyle]} />
        <Animated.View style={[{ position: "absolute" }, arrowStyle]}>
          <Ionicons name="arrow-forward-circle" size={44} color="#ffffff" />
        </Animated.View>
      </View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#fff" }, flashStyle]} />

      {/* Top: close, the room and the count */}
      <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Stop" onPress={close} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={24} color="#fff" />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: "#fff" }} numberOfLines={1}>
            {roomName}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            {Math.min(index, CAPTURE_PLAN.length)} of {CAPTURE_PLAN.length} photos
          </Text>
        </View>
        {index > 0 && phase === "capturing" && (
          <PressableScale accessibilityRole="button" accessibilityLabel="Take the last photo again" onPress={undo} style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="arrow-undo" size={16} color="#fff" />
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: "#fff" }}>Retake</Text>
          </PressableScale>
        )}
      </View>

      {/* Bottom: what to do now, and how far along */}
      <View style={{ position: "absolute", bottom: insets.bottom + 20, left: 16, right: 16, gap: 12, alignItems: "center" }}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.6)", borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", gap: 4 }} accessibilityLiveRegion="polite">
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: "#fff", textAlign: "center" }}>{phase === "saving" ? "Saving the photos…" : message}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
            {target.row === "middle" ? "Round the room at eye level" : target.row === "up" ? "The upper half of the walls" : target.row === "down" ? "The lower half of the walls" : target.row === "zenith" ? "The ceiling" : "The floor"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {rows.map((r) => (
            <View key={r.row} style={{ width: 70, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
              <View style={{ width: `${(r.done / r.total) * 100}%`, height: 6, backgroundColor: dark.brick }} />
            </View>
          ))}
        </View>
        {atPole && phase === "capturing" && (
          <PressableScale accessibilityRole="button" onPress={skipPole} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: "rgba(255,255,255,0.85)", textDecorationLine: "underline" }}>
              Skip the {target.row === "zenith" ? "ceiling and floor" : "floor"}
            </Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

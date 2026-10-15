import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, type SharedValue, clamp, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { LogoMark } from "@/components/brand";
import { fonts, useColors } from "@/theme";

const LOGO = 108;
/** The name and motto under the logo: their gap, line heights and spacing, added up. */
const TEXT_BLOCK = 22 + 52 + 10 + 18;
const WORDS = ["Trust.", "Build.", "Deliver"];
const ease = Easing.out(Easing.cubic);

/**
 * The opening: picks up from the system launch screen (the logo alone, centred, on the same
 * background), then lifts the logo and brings in the name and the motto, word by word, before
 * dissolving into the app. About 1.6 seconds; the app loads underneath meanwhile.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const started = useRef(false);

  const lift = useSharedValue(reduce ? 0 : TEXT_BLOCK / 2);
  const logoScale = useSharedValue(1);
  const name = useSharedValue(0);
  const words = useSharedValue(0);
  const exit = useSharedValue(0);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    // The first frame matches the launch screen, so swapping them is invisible.
    void SplashScreen.hideAsync();
    if (reduce) {
      name.set(withDelay(80, withTiming(1, { duration: 300 })));
      words.set(withDelay(200, withTiming(1, { duration: 300 })));
      exit.set(withDelay(1100, withTiming(1, { duration: 250 }, (done) => done && scheduleOnRN(onDone))));
      return;
    }
    lift.set(withDelay(140, withSpring(0, { damping: 18, stiffness: 120 })));
    logoScale.set(withDelay(140, withSpring(0.88, { damping: 18, stiffness: 120 })));
    name.set(withDelay(320, withTiming(1, { duration: 520, easing: ease })));
    words.set(withDelay(620, withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) })));
    exit.set(withDelay(1500, withTiming(1, { duration: 340, easing: Easing.inOut(Easing.quad) }, (done) => done && scheduleOnRN(onDone))));
  }, [reduce, onDone, lift, logoScale, name, words, exit]);

  // If layout never fires (it always should), don't leave the launch screen up.
  useEffect(() => {
    const t = setTimeout(start, 600);
    return () => clearTimeout(t);
  }, [start]);

  const container = useAnimatedStyle(() => ({ opacity: 1 - exit.value, transform: [{ scale: 1 + exit.value * 0.04 }] }));
  const logo = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }, { scale: logoScale.value }] }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: name.value, transform: [{ translateY: (1 - name.value) * 14 }] }));

  return (
    <Animated.View pointerEvents="none" onLayout={start} style={[StyleSheet.absoluteFill, { backgroundColor: c.background, alignItems: "center", justifyContent: "center", zIndex: 100 }, container]}>
      <Animated.View style={logo}>
        <LogoMark size={LOGO} />
      </Animated.View>
      <View style={{ alignItems: "center", marginTop: 22 }}>
        <Animated.Text style={[{ fontFamily: fonts.display, fontSize: 48, lineHeight: 52, color: c.text, letterSpacing: -0.5 }, nameStyle]}>Trustbrick</Animated.Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, height: 18 }} accessibilityLabel="Trust. Build. Deliver">
          {WORDS.map((word, i) => (
            <Word key={word} word={word} index={i} progress={words} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** One word of the motto, arriving a little after the one before it. */
function Word({ word, index, progress }: { word: string; index: number; progress: SharedValue<number> }) {
  const c = useColors();
  const style = useAnimatedStyle(() => {
    const t = clamp(progress.value * 2.2 - index * 0.6, 0, 1);
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  return (
    <Animated.View style={style}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 2.6, textTransform: "uppercase", color: c.graphite }}>
        {word.replace(".", "")}
        {word.endsWith(".") ? <Text style={{ color: c.brick }}>.</Text> : null}
      </Text>
    </Animated.View>
  );
}

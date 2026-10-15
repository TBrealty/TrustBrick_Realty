import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import { radius, useColors } from "@/theme";

/**
 * The app's motion: springy presses, lists that settle in, soft loading shimmer and light haptics.
 * Everything runs on the UI thread, and Reanimated follows the phone's "Reduce motion" setting.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A light tap you can feel, for selections (tabs, chips, saving). Nothing on the web. */
export function tick() {
  if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
}

/** A firmer tap, for actions that change something (saving a home, sending). */
export function thud() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const PRESS = { damping: 18, stiffness: 320, mass: 0.6 };

/** A Pressable that dips slightly under the finger and springs back. */
export function PressableScale({
  style,
  scaleTo = 0.97,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, PRESS));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, PRESS));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) tick();
        onPress?.(e);
      }}
      style={[style, animated]}
    />
  );
}

/** How an item in a list or a section of a page arrives: rising slightly into place, one after another. */
export function enter(index = 0, step = 60) {
  return FadeInDown.delay(Math.min(index, 8) * step)
    .springify()
    .damping(20)
    .stiffness(180);
}

/** A placeholder block that breathes while content loads. */
export function Skeleton({ width, height, rounded = radius.md, style }: { width?: number | `${number}%`; height: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (!reduce) pulse.set(withRepeat(withTiming(1, { duration: 850 }), -1, true));
  }, [pulse, reduce]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width: width ?? "100%", height, borderRadius: rounded, backgroundColor: c.sand }, animated, style]} />;
}

/** The shape of a listing tile while it loads. */
export function TileSkeleton({ width }: { width: number }) {
  return (
    <View style={{ width, gap: 10 }}>
      <Skeleton height={width * 0.72} rounded={radius.xl} />
      <Skeleton width="45%" height={18} />
      <Skeleton width="80%" height={14} />
    </View>
  );
}

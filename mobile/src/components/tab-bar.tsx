import { BlurView } from "expo-blur";
import type { Tabs } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale, tick } from "@/components/motion";
import { fonts, shadow, useColors } from "@/theme";

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

const BAR_HEIGHT = 64;
const GAP = 10;

/** Room to leave under scrolling content so its end isn't hidden behind the floating tab bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + GAP + BAR_HEIGHT + 16;
}

/**
 * The tab bar, floating above the content: frosted on iOS, a soft translucent surface on Android
 * (where blur needs every screen wrapped). A pill glides to the selected tab, with a light tap.
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const c = useColors();
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  // Tabs hidden with `href: null` (a role that doesn't have them) take no room.
  const routes = state.routes.filter((r) => StyleSheet.flatten(descriptors[r.key].options.tabBarItemStyle)?.display !== "none");
  const current = Math.max(
    routes.findIndex((r) => r.key === state.routes[state.index]?.key),
    0,
  );
  const itemWidth = width / Math.max(routes.length, 1);
  const pill = useAnimatedStyle(() => ({
    width: Math.max(itemWidth - 12, 0),
    transform: [{ translateX: withSpring(current * itemWidth + 6, { damping: 20, stiffness: 220, mass: 0.7 }) }],
  }));

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + GAP }}>
      <View style={[{ borderRadius: BAR_HEIGHT / 2 }, shadow.float]}>
        <View style={{ height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint={dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(30,35,44,0.97)" : "rgba(255,255,255,0.97)" }]} />
          )}
          <View style={{ flex: 1, flexDirection: "row" }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && <Animated.View style={[{ position: "absolute", top: 8, bottom: 8, borderRadius: 24, backgroundColor: c.brickSoft }, pill]} />}
            {routes.map((route) => {
              const { options } = descriptors[route.key];
              const focused = state.routes[state.index]?.key === route.key;
              const color = focused ? c.brick : c.muted;
              const label = typeof options.title === "string" ? options.title : route.name;
              const badge = options.tabBarBadge;
              return (
                <PressableScale
                  key={route.key}
                  scaleTo={0.9}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={badge ? `${label}, ${badge} new` : label}
                  onPress={() => {
                    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                      tick();
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                  style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
                >
                  <View>
                    {options.tabBarIcon?.({ focused, color, size: 22 })}
                    {badge ? (
                      <View style={{ position: "absolute", top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: c.brick, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: dark ? "#1e232c" : "#ffffff" }}>
                        <Text style={{ color: "#fff", fontFamily: fonts.semibold, fontSize: 10, lineHeight: 12 }}>{badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: focused ? fonts.semibold : fonts.medium, fontSize: 10.5, color }} numberOfLines={1}>
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

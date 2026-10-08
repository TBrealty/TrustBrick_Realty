import { Ionicons } from "@expo/vector-icons";
import type { Ref } from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { type Colors, fonts, radius, useColors } from "@/theme";

// ── Text ──────────────────────────────────────────────────────────────────────

type Tone = "text" | "muted" | "graphite" | "brick" | "sage" | "amber" | "onContrast";
type TProps = TextProps & { tone?: Tone };

const toneColor = (c: Colors, tone: Tone = "text") => (tone === "onContrast" ? c.onContrast : c[tone]);

/** Instrument Serif, as the website's headings. */
export function Display({ style, tone, size = 34, ...rest }: TProps & { size?: number }) {
  const c = useColors();
  return <Text accessibilityRole="header" {...rest} style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.08, color: toneColor(c, tone) }, style]} />;
}

export function Title({ style, tone, ...rest }: TProps) {
  const c = useColors();
  return <Text {...rest} style={[{ fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, color: toneColor(c, tone) }, style]} />;
}

export function Body({ style, tone, ...rest }: TProps) {
  const c = useColors();
  return <Text {...rest} style={[{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: toneColor(c, tone) }, style]} />;
}

export function Small({ style, tone = "muted", ...rest }: TProps) {
  const c = useColors();
  return <Text {...rest} style={[{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: toneColor(c, tone) }, style]} />;
}

/** Small capitals, like the website's eyebrows. */
export function Eyebrow({ style, tone = "muted", ...rest }: TProps) {
  const c = useColors();
  return <Text {...rest} style={[{ fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: toneColor(c, tone) }, style]} />;
}

// ── Layout ────────────────────────────────────────────────────────────────────

/** A screen's background, inside the safe area. */
export function Screen({ children, edges = ["top"], style, ...rest }: ViewProps & { edges?: Edge[] }) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.background }, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
}

export function Scroll({ contentContainerStyle, ...rest }: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, paddingBottom: 48, gap: 16 }, contentContainerStyle]} {...rest} />;
}

export function Card({ style, ...rest }: ViewProps) {
  const c = useColors();
  return <View {...rest} style={[{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 16, gap: 10 }, style]} />;
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

/** A label and its value, for facts and details. */
export function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <View style={{ width: "50%", paddingVertical: 6, paddingRight: 8 }}>
      <Small>{label}</Small>
      <Body>{value}</Body>
    </View>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  compact?: boolean;
};

export function Button({ label, variant = "primary", icon, loading, compact, disabled, style, ...rest }: ButtonProps) {
  const c = useColors();
  const bg = { primary: c.ink, accent: c.brick, secondary: c.surface, ghost: "transparent", danger: c.brickSoft }[variant];
  const fg = { primary: c.background, accent: "#ffffff", secondary: c.text, ghost: c.text, danger: c.brick }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      style={(state) => [
        {
          backgroundColor: bg,
          minHeight: compact ? 38 : 50,
          paddingHorizontal: compact ? 14 : 20,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
          borderColor: c.line,
          opacity: off ? 0.5 : state.pressed ? 0.85 : 1,
        },
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: compact ? 14 : 15, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={20} color={tone ?? c.text} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.ink : c.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? c.ink : c.line,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={15} color={selected ? c.background : c.text} />}
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: selected ? c.background : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "info" | "success" | "warning" | "danger" | "contrast" }) {
  const c = useColors();
  const [bg, fg] = {
    neutral: [c.sand, c.graphite],
    info: [c.slateSoft, c.slate],
    success: [c.sageSoft, c.sage],
    warning: [c.amberSoft, c.amber],
    danger: [c.brickSoft, c.brick],
    contrast: [c.contrast, c.onContrast],
  }[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: fg }}>{label}</Text>
    </View>
  );
}

export function Field({ label, error, hint, style, ref, ...rest }: TextInputProps & { label: string; error?: string; hint?: string; ref?: Ref<TextInput> }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        style={[
          {
            minHeight: 50,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.brick : c.line,
            backgroundColor: c.surface,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: fonts.body,
            fontSize: 16,
            color: c.text,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Small tone="brick" accessibilityLiveRegion="polite">
          {error}
        </Small>
      ) : hint ? (
        <Small>{hint}</Small>
      ) : null}
    </View>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

export function Loading({ label = "Loading…" }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }} accessibilityLabel={label}>
      <ActivityIndicator color={c.brick} />
    </View>
  );
}

export function EmptyState({ icon = "home-outline", title, children, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", padding: 32, gap: 10, flexGrow: 1 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.sand, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={26} color={c.graphite} />
      </View>
      <Title style={{ textAlign: "center" }}>{title}</Title>
      {children ? <Body tone="muted" style={{ textAlign: "center", maxWidth: 320 }}>{children}</Body> : null}
      {action}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState icon="cloud-offline-outline" title="That didn't load" action={onRetry ? <Button label="Try again" variant="secondary" compact onPress={onRetry} /> : undefined}>
      {error instanceof Error ? error.message : "Something went wrong."}
    </EmptyState>
  );
}

/** A message in a box, for errors and notes inside forms. */
export function Notice({ tone = "danger", children }: { tone?: "danger" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const c = useColors();
  const [bg, fg] = { danger: [c.brickSoft, c.brick], success: [c.sageSoft, c.sage], info: [c.slateSoft, c.slate], warning: [c.amberSoft, c.amber] }[tone];
  return (
    <View accessibilityRole={tone === "danger" ? "alert" : undefined} style={{ backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: fg, borderRadius: radius.sm, padding: 12 }}>
      <Body style={{ color: c.text, fontSize: 14 }}>{children}</Body>
    </View>
  );
}

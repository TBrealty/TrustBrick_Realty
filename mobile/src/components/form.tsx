import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, type TextInputProps, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale, tick } from "@/components/motion";
import { fonts, radius, shadow, useColors } from "@/theme";

/**
 * The partner workspace's form controls: large, thumb-friendly, one field to a row, with the
 * server's message for a field shown under it. Values are kept as strings (what the website's
 * forms send), booleans for switches.
 */

export type Option = { value: string; label: string; hint?: string };

function Label({ label, required }: { label: string; required?: boolean }) {
  const c = useColors();
  return (
    <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text, marginBottom: 6 }}>
      {label}
      {required ? <Text style={{ color: c.brick }}> *</Text> : <Text style={{ fontFamily: fonts.body, color: c.muted }}> (optional)</Text>}
    </Text>
  );
}

function Message({ error, hint }: { error?: string; hint?: string }) {
  const c = useColors();
  if (!error && !hint) return null;
  return (
    <Text accessibilityLiveRegion={error ? "polite" : undefined} style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 6, color: error ? c.brick : c.muted }}>
      {error ?? hint}
    </Text>
  );
}

const box = (c: ReturnType<typeof useColors>, error?: string) => ({
  minHeight: 52,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: error ? c.brick : c.line,
  backgroundColor: c.surface,
  paddingHorizontal: 14,
});

export function FormText({
  label,
  required,
  error,
  hint,
  prefix,
  suffix,
  multiline,
  style,
  ...rest
}: TextInputProps & { label: string; required?: boolean; error?: string; hint?: string; prefix?: string; suffix?: string }) {
  const c = useColors();
  return (
    <View>
      <Label label={label} required={required} />
      <View style={[box(c, error), { flexDirection: "row", alignItems: multiline ? "flex-start" : "center", gap: 6 }]}>
        {prefix ? <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: c.muted }}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={c.faint}
          accessibilityLabel={label}
          multiline={multiline}
          style={[{ flex: 1, fontFamily: fonts.body, fontSize: 16, color: c.text, paddingVertical: 14, minHeight: multiline ? 110 : undefined, textAlignVertical: multiline ? "top" : "center" }, style]}
          {...rest}
        />
        {suffix ? <Text style={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{suffix}</Text> : null}
      </View>
      <Message error={error} hint={hint} />
    </View>
  );
}

/** A bottom sheet that slides up over the screen. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
        <View style={[{ maxHeight: "82%", backgroundColor: c.background, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingBottom: insets.bottom + 12 }, shadow.float]}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.sand, marginTop: 10 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: c.text, flex: 1 }}>{title}</Text>
            <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={c.muted} />
            </PressableScale>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A choice from a list, picked in a sheet. */
export function FormSelect({ label, value, options, onChange, required, error, hint, placeholder = "Choose" }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; required?: boolean; error?: string; hint?: string; placeholder?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  return (
    <View>
      <Label label={label} required={required} />
      <PressableScale accessibilityRole="button" accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`} scaleTo={0.99} onPress={() => setOpen(true)} style={[box(c, error), { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, color: chosen ? c.text : c.faint }} numberOfLines={1}>
          {chosen?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={c.muted} />
      </PressableScale>
      <Message error={error} hint={hint ?? chosen?.hint} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <FlatList
          data={required ? options : [{ value: "", label: placeholder === "Choose" ? "Not specified" : placeholder }, ...options]}
          keyExtractor={(o) => o.value || "__none"}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  tick();
                  onChange(item.value);
                  setOpen(false);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: radius.lg, backgroundColor: selected ? c.brickSoft : "transparent" }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 16, color: c.text }}>{item.label}</Text>
                  {item.hint ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.muted, marginTop: 2 }}>{item.hint}</Text> : null}
                </View>
                {selected && <Ionicons name="checkmark" size={20} color={c.brick} />}
              </PressableScale>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

/** A short choice as tappable chips (one of a few). */
export function FormChips({ label, value, options, onChange, required, error, hint }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; required?: boolean; error?: string; hint?: string }) {
  const c = useColors();
  return (
    <View>
      <Label label={label} required={required} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <PressableScale
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                tick();
                onChange(selected && !required ? "" : o.value);
              }}
              style={{ paddingHorizontal: 16, height: 42, justifyContent: "center", borderRadius: radius.pill, backgroundColor: selected ? c.ink : c.surface, borderWidth: 1, borderColor: selected ? c.ink : error ? c.brick : c.line }}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: selected ? c.background : c.text }}>{o.label}</Text>
            </PressableScale>
          );
        })}
      </View>
      <Message error={error} hint={hint ?? options.find((o) => o.value === value)?.hint} />
    </View>
  );
}

/** Bigger choices with an explanation each (what guests get, how a deal closed). */
export function FormCards({ label, value, options, onChange, error }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; error?: string }) {
  const c = useColors();
  return (
    <View>
      <Label label={label} required />
      <View style={{ gap: 10 }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <PressableScale
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                tick();
                onChange(o.value);
              }}
              style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? c.ink : c.line, backgroundColor: c.surface }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? c.ink : c.faint, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: c.text }}>{o.label}</Text>
                {o.hint ? <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{o.hint}</Text> : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
      <Message error={error} />
    </View>
  );
}

export function FormToggle({ label, value, onChange, hint, error }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string; error?: string }) {
  const c = useColors();
  return (
    <View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onPress={() => {
          tick();
          onChange(!value);
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}
      >
        <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: c.text }}>{label}</Text>
        <Switch value={value} onValueChange={(v) => { tick(); onChange(v); }} trackColor={{ true: c.brick, false: c.sand }} thumbColor="#fff" />
      </Pressable>
      <Message error={error} hint={hint} />
    </View>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** A month to pick a day from. */
export function MonthGrid({ month, selected, onPick, minDate }: { month: string; selected: string | null; onPick: (date: string) => void; minDate?: string }) {
  const c = useColors();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array.from({ length: (first + 6) % 7 }, () => null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: fonts.medium, fontSize: 12, color: c.muted, paddingVertical: 6 }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const off = minDate ? date < minDate : false;
          const on = date === selected;
          return (
            <Pressable key={date} disabled={off} onPress={() => onPick(date)} style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.ink : "transparent" }}>
                <Text style={{ fontFamily: on ? fonts.semibold : fonts.body, fontSize: 15, color: on ? c.background : off ? c.faint : c.text }}>{Number(date.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** A date (YYYY-MM-DD), picked from a month in a sheet. */
export function FormDate({ label, value, onChange, required, error, hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; hint?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || todayIso()).slice(0, 7));
  const shown = value ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Choose a date";
  return (
    <View>
      <Label label={label} required={required} />
      <PressableScale accessibilityRole="button" accessibilityLabel={`${label}: ${shown}`} scaleTo={0.99} onPress={() => setOpen(true)} style={[box(c, error), { flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <Ionicons name="calendar-outline" size={18} color={c.muted} />
        <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, color: value ? c.text : c.faint }}>{shown}</Text>
        {value && !required ? (
          <Pressable accessibilityLabel="Clear the date" hitSlop={8} onPress={() => onChange("")}>
            <Ionicons name="close-circle" size={18} color={c.faint} />
          </Pressable>
        ) : null}
      </PressableScale>
      <Message error={error} hint={hint} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
            <PressableScale accessibilityLabel="Previous month" onPress={() => setMonth((m) => shiftMonth(m, -1))} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={22} color={c.text} />
            </PressableScale>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>{monthLabel(month)}</Text>
            <PressableScale accessibilityLabel="Next month" onPress={() => setMonth((m) => shiftMonth(m, 1))} style={{ padding: 8 }}>
              <Ionicons name="chevron-forward" size={22} color={c.text} />
            </PressableScale>
          </View>
          <MonthGrid
            month={month}
            selected={value || null}
            onPick={(d) => {
              tick();
              onChange(d);
              setOpen(false);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "18:00", "20:00", "22:00", "22:30", "23:00"];

/** A time of day (HH:MM, 24-hour), from common choices or typed. */
export function FormTime({ label, value, onChange, required, error, hint, choices = TIMES }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; error?: string; hint?: string; choices?: string[] }) {
  return (
    <FormSelect label={label} value={value} required={required} error={error} hint={hint} placeholder={required ? "Choose a time" : "None"} onChange={onChange} options={(choices.includes(value) || !value ? choices : [value, ...choices]).map((t) => ({ value: t, label: t }))} />
  );
}

/** Section heading inside a form. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 17, color: c.text }}>{title}</Text>
        {description ? <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.muted }}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** The bar pinned to the bottom of a form, with its main action. */
export function SaveBar({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: c.background, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, flexDirection: "row", gap: 10 }, shadow.soft]}>{children}</View>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fonts, useColors } from "@/theme";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A month calendar for choosing check-in and check-out. Booked and blocked nights are greyed
 * out; a range can't cross them.
 */
export function RangeCalendar({
  today,
  unavailable,
  checkIn,
  checkOut,
  onChange,
}: {
  today: string;
  unavailable: { from: string; to: string }[];
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
}) {
  const c = useColors();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  // A night is taken when it falls in [from, to): its check-out day is still free to arrive on.
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const r of unavailable) for (let d = r.from; d < r.to; d = addDays(d, 1)) set.add(d);
    return set;
  }, [unavailable]);

  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(iso(d).slice(0, 7));
  };
  const crossesTaken = (from: string, to: string) => {
    for (let d = from; d < to; d = addDays(d, 1)) if (taken.has(d)) return true;
    return false;
  };

  const press = (day: string) => {
    if (!checkIn || checkOut || day <= checkIn) return onChange(taken.has(day) ? null : day, null);
    if (crossesTaken(checkIn, day)) return onChange(taken.has(day) ? null : day, null);
    onChange(checkIn, day);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => shift(-1)} disabled={month <= today.slice(0, 7)} style={{ opacity: month <= today.slice(0, 7) ? 0.3 : 1 }}>
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: c.text }}>{first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} onPress={() => shift(1)}>
          <Ionicons name="chevron-forward" size={22} color={c.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: "center", fontFamily: fonts.medium, fontSize: 12, color: c.muted }}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const past = day < today;
          const isTaken = taken.has(day);
          const ends = day === checkIn || day === checkOut;
          const inside = checkIn && checkOut && day > checkIn && day < checkOut;
          const disabled = past || (isTaken && !(checkIn && !checkOut && day > checkIn));
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={`${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" })}${isTaken ? ", not available" : ""}`}
              accessibilityState={{ disabled, selected: ends }}
              disabled={disabled}
              onPress={() => press(day)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: ends ? c.ink : inside ? c.sand : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: ends ? fonts.semibold : fonts.body,
                    fontSize: 15,
                    color: ends ? c.background : disabled ? c.faint : c.text,
                    textDecorationLine: isTaken && !past ? "line-through" : "none",
                  }}
                >
                  {Number(day.slice(8))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Chip, Small } from "@/components/ui";

const TIMES = ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00", "19:30"];

/** Today and the next thirteen days, in India. */
function nextDays(): string[] {
  const now = Date.now() + 5.5 * 3_600_000;
  return Array.from({ length: 14 }, (_, i) => new Date(now + i * 86_400_000).toISOString().slice(0, 10));
}

/** A visit time: one of the next fourteen days, and a slot. Returns an ISO time (India time). */
export function SlotPicker({ onChange }: { onChange: (iso: string | null) => void }) {
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [days] = useState(nextDays);
  const pick = (d: string | null, t: string | null) => {
    setDay(d);
    setTime(t);
    onChange(d && t ? new Date(`${d}T${t}:00+05:30`).toISOString() : null);
  };
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d, i) => (
          <Chip
            key={d}
            label={i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
            selected={day === d}
            onPress={() => pick(d, time)}
          />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TIMES.map((t) => (
          <Chip key={t} label={t} selected={time === t} onPress={() => pick(day, t)} />
        ))}
      </View>
      <Small>India time.</Small>
    </View>
  );
}

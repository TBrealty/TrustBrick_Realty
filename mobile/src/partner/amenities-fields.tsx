import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";
import type { OnboardingOptions } from "@/api/workspace-types";
import { FormSection, FormText } from "@/components/form";
import { PressableScale, tick } from "@/components/motion";
import { Button } from "@/components/ui";
import { CUSTOM_AMENITY_LIMIT, CUSTOM_AMENITY_MAX_LENGTH } from "@/lib/vocab";
import { AMENITY_GROUPS, CUSTOM_AMENITY_PATTERN, RELEVANT_AMENITIES, tidyAmenity } from "@/partner/property-fields";
import { fonts, radius, useColors } from "@/theme";

/** Amenities: tap to tick, grouped as on the website, plus the agent's own (up to 20). */
export function AmenitiesFields({
  options,
  category,
  selected,
  custom,
  error,
  onChange,
}: {
  options: OnboardingOptions;
  category: string;
  selected: string[];
  custom: string[];
  error?: string;
  onChange: (next: { selected: string[]; custom: string[] }) => void;
}) {
  const c = useColors();
  const groups = RELEVANT_AMENITIES[category] ?? Object.keys(AMENITY_GROUPS);
  const shown = options.amenities.filter((a) => groups.includes(a.category));
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const toggle = (code: string) => {
    tick();
    onChange({ selected: selected.includes(code) ? selected.filter((x) => x !== code) : [...selected, code], custom });
  };
  const add = () => {
    const name = tidyAmenity(draft);
    if (name.length < 2) return setNote({ tone: "error", text: "Type the amenity first, at least 2 characters." });
    if (!CUSTOM_AMENITY_PATTERN.test(name)) return setNote({ tone: "error", text: "Use letters, numbers and simple punctuation." });
    const match = shown.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (match) {
      onChange({ selected: selected.includes(match.code) ? selected : [...selected, match.code], custom });
      setDraft("");
      return setNote({ tone: "info", text: `“${match.name}” is already in the list above, so it's ticked there.` });
    }
    if (custom.some((i) => i.toLowerCase() === name.toLowerCase())) return setNote({ tone: "error", text: "That one's already added." });
    if (custom.length >= CUSTOM_AMENITY_LIMIT) return setNote({ tone: "error", text: `You can add up to ${CUSTOM_AMENITY_LIMIT} of your own.` });
    tick();
    onChange({ selected, custom: [...custom, name] });
    setDraft("");
    setNote(null);
  };

  return (
    <View style={{ gap: 32 }}>
      {groups.map((g) => {
        const items = options.amenities.filter((a) => a.category === g);
        if (!items.length) return null;
        return (
          <FormSection key={g} title={AMENITY_GROUPS[g]}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {items.map((a) => {
                const on = selected.includes(a.code);
                return (
                  <PressableScale
                    key={a.code}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(a.code)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}
                  >
                    {on && <Ionicons name="checkmark" size={15} color={c.background} />}
                    <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: on ? c.background : c.text }}>{a.name}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </FormSection>
        );
      })}

      <FormSection title="Anything else" description="Add amenities that aren't in the list, in a few words each. Customers see them as you write them.">
        {custom.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {custom.map((name) => (
              <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 14, paddingRight: 4, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: c.ink }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: c.text }}>{name}</Text>
                <PressableScale accessibilityRole="button" accessibilityLabel={`Remove ${name}`} hitSlop={6} onPress={() => onChange({ selected, custom: custom.filter((x) => x !== name) })} style={{ padding: 6 }}>
                  <Ionicons name="close" size={16} color={c.muted} />
                </PressableScale>
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <FormText label="Add an amenity" value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" maxLength={CUSTOM_AMENITY_MAX_LENGTH} placeholder="e.g. Rooftop garden" />
          </View>
          <Button label="Add" variant="secondary" icon="add" onPress={add} style={{ marginBottom: 1 }} />
        </View>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: error || note?.tone === "error" ? c.brick : c.muted }}>{error ?? note?.text ?? `${custom.length} of ${CUSTOM_AMENITY_LIMIT} added.`}</Text>
      </FormSection>
    </View>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { api } from "@/api/client";
import type { BrowseOptions } from "@/api/types";
import { PressableScale, Skeleton, tick } from "@/components/motion";
import { Small } from "@/components/ui";
import { cityStore } from "@/hooks/use-home";
import { fonts, radius, useColors } from "@/theme";

/** Choosing the home screen's city, as a sheet from the bottom. */
export default function CityPicker() {
  const c = useColors();
  const chosen = cityStore.useValue();
  const options = useQuery({ queryKey: ["options", "rent"], queryFn: () => api<BrowseOptions>("/listings/options?kind=rent"), staleTime: 30 * 60_000 });

  return (
    <View style={{ backgroundColor: c.background, paddingTop: 22 }}>
      <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.sand, marginBottom: 16 }} />
      <View style={{ paddingHorizontal: 20, gap: 4, marginBottom: 12 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, color: c.text }}>Your city</Text>
        <Small>The home screen shows what&apos;s new and nearby here.</Small>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32, gap: 4 }}>
        {options.isPending
          ? [0, 1, 2].map((i) => <Skeleton key={i} height={52} rounded={radius.lg} style={{ marginHorizontal: 8, marginVertical: 4 }} />)
          : (options.data?.cities ?? []).map((city) => {
              const selected = chosen?.slug === city.slug;
              return (
                <PressableScale
                  key={city.slug}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    tick();
                    cityStore.set({ slug: city.slug, name: city.name });
                    router.back();
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, height: 56, borderRadius: radius.lg, backgroundColor: selected ? c.brickSoft : "transparent" }}
                >
                  <Ionicons name={selected ? "location" : "location-outline"} size={20} color={selected ? c.brick : c.muted} />
                  <Text style={{ flex: 1, fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 16, color: c.text }}>{city.name}</Text>
                  <Small>
                    {city.localities.length} {city.localities.length === 1 ? "locality" : "localities"}
                  </Small>
                  {selected && <Ionicons name="checkmark" size={20} color={c.brick} />}
                </PressableScale>
              );
            })}
      </ScrollView>
    </View>
  );
}

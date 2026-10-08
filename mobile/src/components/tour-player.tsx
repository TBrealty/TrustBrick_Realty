import { Image } from "expo-image";
import { useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { assetUrl, authHeaders } from "@/api/client";
import type { TourData } from "@/api/types";
import { type TourHandle, type TourMode, TourView } from "@/components/tour-view";
import { Chip, EmptyState, Small } from "@/components/ui";
import { radius, useColors } from "@/theme";

/** A tour, full screen: its parts as tabs (360° rooms, 3D model, hosted tour) and the rooms as a strip. */
export function TourPlayer({ tour, title }: { tour: TourData; title: string }) {
  const c = useColors();
  const [mode, setMode] = useState<TourMode | null>(null);
  const [room, setRoom] = useState(0);
  const view = useRef<TourHandle>(null);
  const modes: { key: TourMode; label: string }[] = [
    ...(tour.rooms.length ? [{ key: "rooms" as const, label: "360° tour" }] : []),
    ...(tour.model ? [{ key: "model" as const, label: "3D model" }] : []),
    ...(tour.link ? [{ key: "link" as const, label: tour.link.provider }] : []),
  ];
  const current = mode ?? modes[0]?.key;
  if (!current) return <EmptyState icon="cube-outline" title="No tour yet" />;

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.background }}>
      {modes.length > 1 && (
        <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
          {modes.map((m) => (
            <Chip key={m.key} label={m.label} selected={current === m.key} onPress={() => setMode(m.key)} />
          ))}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <TourView ref={view} tour={tour} mode={current} title={title} onRoomChange={setRoom} />
      </View>
      {current === "rooms" && tour.rooms.length > 1 && (
        <FlatList
          horizontal
          data={tour.rooms}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ gap: 10, padding: 12 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Go to ${item.name || `room ${index + 1}`}`}
              accessibilityState={{ selected: room === index }}
              onPress={() => {
                setRoom(index);
                view.current?.showRoom(index);
              }}
              style={{ width: 120, gap: 4 }}
            >
              <Image
                source={{ uri: assetUrl(item.thumbnailUrl), headers: authHeaders() }}
                style={{ width: 120, height: 60, borderRadius: radius.sm, backgroundColor: c.sand, borderWidth: 2, borderColor: room === index ? c.brick : "transparent" }}
                contentFit="cover"
              />
              <Small numberOfLines={1} tone={room === index ? "text" : "muted"}>
                {item.name || `Room ${index + 1}`}
              </Small>
            </Pressable>
          )}
        />
      )}
      {current === "model" && <Small style={{ padding: 12, textAlign: "center" }}>Drag to turn it, pinch to zoom, two fingers to move it.</Small>}
    </SafeAreaView>
  );
}

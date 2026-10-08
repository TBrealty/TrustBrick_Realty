import type { Ref } from "react";
import { View } from "react-native";
import type { TourData } from "@/api/types";
import { Body, Button } from "@/components/ui";
import { API_ORIGIN } from "@/config";
import type { TourHandle, TourMode } from "./tour-view";

/**
 * The web preview has no WebView, and the tour needs one. It offers the website's tour page,
 * which shows the same tour to the same signed-in person.
 */
export function TourView({ tour, mode, title }: { tour: TourData; mode: TourMode; title: string; onRoomChange?: (i: number) => void; ref?: Ref<TourHandle> }) {
  const href = mode === "link" && tour.link ? tour.link.url : null;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#0d1119" }}>
      <Body style={{ color: "#f3f1ec", textAlign: "center" }}>The tour of {title} plays in the Trustbrick app on your phone. In this preview, open it in a new tab.</Body>
      <Button label="Open in a new tab" variant="accent" onPress={() => window.open(href ?? `${API_ORIGIN}${window.location.pathname.replace(/^\/listing\//, "/listings/")}`, "_blank")} />
    </View>
  );
}

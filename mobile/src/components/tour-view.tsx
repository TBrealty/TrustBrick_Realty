import { type Ref, useImperativeHandle, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { assetUrl, authHeaders } from "@/api/client";
import type { TourData } from "@/api/types";
import { API_ORIGIN } from "@/config";
import { tourHtml } from "./tour-html";

export type TourMode = "rooms" | "model" | "link";
export type TourHandle = { showRoom: (i: number) => void };
type Props = { tour: TourData; mode: TourMode; title: string; onRoomChange?: (i: number) => void; ref?: Ref<TourHandle> };

/**
 * One view of the tour in a WebView. 360° rooms and the 3D model run in a local page served
 * from the API's origin (so /media requests are same-origin); a hosted tour opens its own page.
 */
export function TourView({ tour, mode, title, onRoomChange, ref: handle }: Props) {
  const ref = useRef<WebView>(null);
  useImperativeHandle(handle, () => ({ showRoom: (i) => ref.current?.injectJavaScript(`window.showRoom && window.showRoom(${Number(i)}); true;`) }), []);
  const setup = useMemo(() => {
    const data = {
      mode,
      title,
      headers: authHeaders(),
      rooms: tour.rooms.map((r, i) => ({ url: assetUrl(r.url), name: r.name || `Room ${i + 1}` })),
      model: tour.model ? assetUrl(tour.model.url) : null,
    };
    // Handed over before the page's script runs; the token never appears in a URL.
    return `window.__TOUR = ${JSON.stringify(data)}; window.dispatchEvent(new Event("tourready")); true;`;
  }, [tour, mode, title]);

  if (mode === "link" && tour.link) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0d1119" }}>
        <WebView source={{ uri: tour.link.url }} allowsFullscreenVideo javaScriptEnabled setSupportMultipleWindows={false} style={{ flex: 1 }} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#0d1119" }}>
      <WebView
        key={mode}
        ref={ref}
        originWhitelist={["*"]}
        source={{ html: tourHtml(), baseUrl: API_ORIGIN }}
        injectedJavaScriptBeforeContentLoaded={setup}
        javaScriptEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data) as { type: string; index?: number };
            if (m.type === "room" && typeof m.index === "number") onRoomChange?.(m.index);
          } catch {}
        }}
        style={{ flex: 1, backgroundColor: "#0d1119" }}
      />
    </View>
  );
}

import { Image } from "expo-image";
import { useState } from "react";
import { FlatList, Text, View, useWindowDimensions } from "react-native";
import { assetUrl } from "@/api/client";
import { fonts, useColors } from "@/theme";

/** A listing's photos, swiped sideways, with a counter. */
export function PhotoCarousel({ images, height = 320 }: { images: { key: string; alt: string | null }[]; height?: number }) {
  const c = useColors();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (images.length === 0) return <View style={{ height, backgroundColor: c.sand }} />;
  return (
    <View style={{ height }}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(img, i) => `${img.key}-${i}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <Image
            source={{ uri: assetUrl(item.key) }}
            style={{ width, height, backgroundColor: c.sand }}
            contentFit="cover"
            transition={200}
            accessibilityLabel={item.alt ?? `Photo ${i + 1} of ${images.length}`}
          />
        )}
      />
      {images.length > 1 && (
        <View style={{ position: "absolute", right: 14, bottom: 14, backgroundColor: "rgba(13,17,25,0.6)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: "#fff", fontFamily: fonts.medium, fontSize: 12 }}>
            {index + 1} / {images.length}
          </Text>
        </View>
      )}
    </View>
  );
}

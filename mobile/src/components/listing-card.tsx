import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { assetUrl } from "@/api/client";
import type { ListingSummary } from "@/api/types";
import { Badge, Body, Small } from "@/components/ui";
import { useSave } from "@/hooks/use-save";
import { keyFacts, priceParts } from "@/lib/listings/describe";
import { tourBadge } from "@/lib/tours/terms";
import { fonts, radius, useColors } from "@/theme";

/** A listing in a list: photo, price, title, place and key facts, as on the website's cards. */
export function ListingCard({ listing, saved }: { listing: ListingSummary; saved?: boolean }) {
  const c = useColors();
  const toggle = useSave();
  const [isSaved, setSaved] = useState(Boolean(saved));
  const price = priceParts(listing);
  const facts = keyFacts(listing);
  const inactive = listing.status !== "published";

  return (
    <Link href={`/listing/${listing.referenceId}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${listing.title}, ${price.prefix ?? ""} ${price.amount} ${price.suffix ?? ""}, ${listing.locality}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.92 : inactive ? 0.7 : 1, gap: 10 })}
      >
        <View style={{ aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.sand }}>
          {listing.image ? <Image source={{ uri: assetUrl(listing.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
          <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 6, flexWrap: "wrap", right: 60 }}>
            {listing.isSample && <Badge label="Sample" tone="contrast" />}
            {inactive && <Badge label="No longer listed" />}
            {!inactive && listing.offer && <Badge label="Offer" tone="danger" />}
            {!inactive && listing.tour && <Badge label={tourBadge(listing.tour)} tone="contrast" />}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSaved ? "Remove from saved homes" : "Save this home"}
            accessibilityState={{ selected: isSaved }}
            hitSlop={8}
            onPress={(e) => {
              // On the web preview the card is a link; the heart mustn't follow it.
              e.preventDefault?.();
              toggle(listing.referenceId, !isSaved);
              setSaved((s) => !s);
            }}
            style={{ position: "absolute", top: 8, right: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(13,17,25,0.45)", alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name={isSaved ? "heart" : "heart-outline"} size={21} color={isSaved ? "#f08a64" : "#ffffff"} />
          </Pressable>
        </View>
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 5 }}>
            {price.prefix ? <Small>{price.prefix}</Small> : null}
            <Text style={{ fontFamily: fonts.display, fontSize: 26, color: c.text }}>{price.amount}</Text>
            {price.suffix ? <Small>{price.suffix}</Small> : null}
            {listing.priceNegotiable ? <Small>· Negotiable</Small> : null}
          </View>
          {!inactive && listing.offer ? <Small tone="brick">{listing.offer.title}</Small> : null}
          <Body style={{ fontFamily: fonts.medium }} numberOfLines={2}>
            {listing.title}
          </Body>
          <Small>
            {listing.locality}
            {listing.city ? `, ${listing.city}` : ""}
          </Small>
          {facts.length > 0 && <Small tone="graphite">{facts.join("  ·  ")}</Small>}
        </View>
      </Pressable>
    </Link>
  );
}
